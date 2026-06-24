// Admin-side write operations: poll creation, lifecycle transitions, tie-break.

import { prisma } from "./db";
import { audit } from "./audit";
import { slugify } from "./utils";
import { parseAdvancedRule } from "./rules/advanced";
import { computeSection } from "./poll-service";
import type { PollInput } from "./validation";

export async function createPoll(input: PollInput, ownerId: string) {
  // Validate any advanced rules up-front so we never store an invalid DSL.
  for (const section of input.sections) {
    if (section.advancedRule) {
      const parsed = parseAdvancedRule(section.advancedRule);
      if (!parsed.ok) throw new Error(`Invalid advanced rule in section "${section.title}": ${parsed.error}`);
    }
  }

  const poll = await prisma.$transaction(async (tx) => {
    const created = await tx.poll.create({
      data: {
        title: input.title,
        description: input.description,
        slug: slugify(input.title),
        visibility: input.visibility,
        sequential: input.sequential,
        ownerId,
        opensAt: input.opensAt ? new Date(input.opensAt) : null,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        status: "DRAFT",
      },
    });

    // Private-poll access list.
    const accessRows = [
      ...input.accessUserIds.map((userId) => ({ pollId: created.id, userId })),
      ...input.accessGroupIds.map((groupId) => ({ pollId: created.id, groupId })),
    ];
    if (accessRows.length) await tx.pollAccess.createMany({ data: accessRows });

    for (const [i, section] of input.sections.entries()) {
      const sec = await tx.pollSection.create({
        data: {
          pollId: created.id,
          title: section.title,
          description: section.description,
          position: i,
          method: section.method,
          minSelections: section.minSelections ?? null,
          maxSelections: section.maxSelections ?? null,
          exactSelections: section.exactSelections ?? null,
          minRanked: section.minRanked ?? null,
          maxRanked: section.maxRanked ?? null,
          requireFullRank: section.requireFullRank,
          scoreMin: section.scoreMin,
          scoreMax: section.scoreMax,
          allowSameScore: section.allowSameScore,
          defaultWeight: section.defaultWeight,
          numWinners: section.numWinners,
          resultVisibility: section.resultVisibility,
          anonymity: section.anonymity,
          allowVoteEdit: section.allowVoteEdit,
          conflictStrategy: section.conflictStrategy,
          tieBreakStrategy: section.tieBreakStrategy,
          allowedGroupIds: section.allowedGroupIds.length ? section.allowedGroupIds : undefined,
          excludedGroupIds: section.excludedGroupIds.length ? section.excludedGroupIds : undefined,
          advancedRule: section.advancedRule ? (section.advancedRule as object) : undefined,
        },
      });

      // Options + per-option group rules.
      for (const [j, opt] of section.options.entries()) {
        const o = await tx.pollOption.create({
          data: { sectionId: sec.id, label: opt.label, description: opt.description, position: j },
        });
        const ruleRows = [
          ...opt.hiddenForGroupIds.map((groupId) => ({ optionId: o.id, groupId, hidden: true, disabled: false })),
          ...opt.disabledForGroupIds
            .filter((g) => !opt.hiddenForGroupIds.includes(g))
            .map((groupId) => ({ optionId: o.id, groupId, hidden: false, disabled: true })),
        ];
        if (ruleRows.length) await tx.optionGroupRule.createMany({ data: ruleRows });
      }

      // Per-group limits.
      if (section.groupLimits.length) {
        await tx.sectionGroupLimit.createMany({
          data: section.groupLimits.map((l) => ({
            sectionId: sec.id,
            groupId: l.groupId,
            maxSelections: l.maxSelections ?? null,
            minSelections: l.minSelections ?? null,
            exactSelections: l.exactSelections ?? null,
            voteWeight: l.voteWeight,
            canVote: l.canVote,
          })),
        });
      }

      // Record advanced rule for audit if present.
      if (section.advancedRule) {
        await tx.pollRule.create({
          data: {
            sectionId: sec.id,
            type: "ADVANCED_JSON",
            description: "Advanced JSON rule",
            config: section.advancedRule as object,
          },
        });
      }
    }

    return created;
  });

  await audit({ action: "POLL_CREATED", pollId: poll.id, actorId: ownerId, metadata: { title: poll.title } });
  return poll;
}

const allowedTransitions: Record<string, string[]> = {
  DRAFT: ["OPEN", "SCHEDULED", "ARCHIVED"],
  SCHEDULED: ["OPEN", "DRAFT", "ARCHIVED"],
  OPEN: ["CLOSED", "ARCHIVED"],
  CLOSED: ["OPEN", "NEEDS_TIEBREAK", "FINALIZED", "ARCHIVED"],
  NEEDS_TIEBREAK: ["CLOSED", "FINALIZED", "ARCHIVED"],
  FINALIZED: ["ARCHIVED", "CLOSED"],
  ARCHIVED: [],
};

const actionFor: Record<string, any> = {
  OPEN: "POLL_OPENED",
  CLOSED: "POLL_CLOSED",
  FINALIZED: "POLL_FINALIZED",
  ARCHIVED: "POLL_ARCHIVED",
};

export async function transitionPoll(pollId: string, to: string, actorId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll) throw new Error("Poll not found");
  const allowed = allowedTransitions[poll.status] ?? [];
  if (!allowed.includes(to)) throw new Error(`Cannot move poll from ${poll.status} to ${to}.`);

  const reopening = poll.status !== "OPEN" && to === "OPEN" && (poll.status === "CLOSED");
  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: {
      status: to as any,
      finalizedAt: to === "FINALIZED" ? new Date() : poll.finalizedAt,
    },
  });
  await audit({
    action: reopening ? "POLL_REOPENED" : actionFor[to] ?? "POLL_EDITED",
    pollId,
    actorId,
    metadata: { from: poll.status, to },
  });
  return updated;
}

/**
 * Create a runoff phase for a section from a set of tied options.
 * Preserves the original eligible voter list (the poll's access remains).
 */
export async function createRunoffPhase(params: {
  sectionId: string;
  optionIds: string[];
  actorId: string;
  label?: string;
  seed?: string;
  method?: "SINGLE" | "MULTIPLE" | "RANKED" | "SCORE" | "APPROVAL";
  minSelections?: number | null;
  maxSelections?: number | null;
  exactSelections?: number | null;
}) {
  const section = await prisma.pollSection.findUnique({
    where: { id: params.sectionId },
    include: { phases: true, poll: true },
  });
  if (!section) throw new Error("Section not found");
  if (params.optionIds.length < 2) throw new Error("A runoff needs at least two tied options.");

  // How many seats are still open: total winners minus those already locked in
  // (the options that strictly beat the tied/cutoff value in the latest result).
  const original = await computeSection(section.id, null);
  const lockedWinners = original?.result.winners.length ?? 0;
  const seats = Math.max(1, section.numWinners - lockedWinners);

  // Sensible default config so a runoff can actually break the tie: pick exactly
  // `seats` of the tied options (which is SINGLE choice when one seat is open).
  const method = params.method ?? (seats <= 1 ? "SINGLE" : "MULTIPLE");
  let maxSelections = params.maxSelections ?? null;
  let exactSelections = params.exactSelections ?? null;
  if (method === "SINGLE") {
    maxSelections = 1;
    exactSelections = null;
  } else if ((method === "MULTIPLE" || method === "APPROVAL") && maxSelections == null && exactSelections == null) {
    // Default to "pick exactly the number of open seats", capped below the
    // option count so selecting everything can't keep the tie alive.
    exactSelections = Math.min(seats, params.optionIds.length - 1);
  }

  const phaseIndex = (section.phases.length ?? 0) + 1;
  const phase = await prisma.pollPhase.create({
    data: {
      pollId: section.pollId,
      sectionId: section.id,
      phaseIndex,
      label: params.label ?? `Runoff ${phaseIndex} — ${section.title}`,
      optionIds: params.optionIds,
      seats,
      method,
      minSelections: params.minSelections ?? null,
      maxSelections,
      exactSelections,
      seed: params.seed ?? `${section.id}:runoff:${phaseIndex}`,
      status: "OPEN",
    },
  });

  // Move the poll into a state that signals an active tie-break.
  if (section.poll.status === "CLOSED" || section.poll.status === "NEEDS_TIEBREAK") {
    await prisma.poll.update({ where: { id: section.pollId }, data: { status: "OPEN" } });
  }

  await audit({
    action: "TIEBREAK_PHASE_CREATED",
    pollId: section.pollId,
    actorId: params.actorId,
    targetType: "PollPhase",
    targetId: phase.id,
    metadata: { sectionId: section.id, optionIds: params.optionIds },
  });
  return phase;
}

/**
 * Is a section "settled" — i.e. its result has no unresolved tie?
 * Considers the latest runoff phase if one exists. KEEP_TIE counts as settled.
 */
export async function isSectionSettled(
  sectionId: string
): Promise<{ settled: boolean; reason?: string; tie: boolean }> {
  const section = await prisma.pollSection.findUnique({
    where: { id: sectionId },
    include: { phases: { orderBy: { phaseIndex: "desc" } } },
  });
  if (!section) return { settled: false, reason: "Section not found.", tie: false };
  if (section.tieBreakStrategy === "KEEP_TIE") return { settled: true, tie: false };

  const openPhase = section.phases.find((p) => p.status === "OPEN");
  if (openPhase) return { settled: false, reason: "Close the open runoff phase first.", tie: true };

  const latest = section.phases[0]; // highest phaseIndex
  let result;
  if (latest) {
    const optionIds = Array.isArray(latest.optionIds) ? (latest.optionIds as string[]) : undefined;
    result = await computeSection(sectionId, latest.id, optionIds, latest.seats);
  } else {
    result = await computeSection(sectionId, null);
  }
  const tie = result?.result.tie ?? false;
  return { settled: !tie, reason: tie ? "Resolve the tie before advancing to the next stage." : undefined, tie };
}

/**
 * Advance a sequential poll to its next stage. Requires the current stage to be
 * settled (no unresolved tie / no open runoff). When the last stage is reached,
 * the poll moves to CLOSED.
 */
export async function advanceStage(pollId: string, actorId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { sections: { orderBy: { position: "asc" } } },
  });
  if (!poll) throw new Error("Poll not found.");
  if (!poll.sequential) throw new Error("This poll does not use sequential stages.");
  if (poll.status !== "OPEN") throw new Error("Open the poll before advancing stages.");

  const current = poll.sections.find((s) => s.position === poll.currentStage);
  if (!current) throw new Error("There is no active stage to advance.");

  const settled = await isSectionSettled(current.id);
  if (!settled.settled) throw new Error(settled.reason ?? "The current stage is not settled yet.");

  const nextStage = poll.currentStage + 1;
  const isLast = nextStage > poll.sections.length - 1;

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { currentStage: nextStage, status: isLast ? "CLOSED" : poll.status },
  });

  await audit({
    action: "STAGE_ADVANCED",
    pollId,
    actorId,
    metadata: { fromStage: poll.currentStage, toStage: nextStage, finished: isLast },
  });
  return { finished: isLast, stage: nextStage, status: updated.status };
}

/**
 * Step a sequential poll back to the previous stage (e.g. a stage was advanced
 * by mistake). Non-destructive: votes already cast in later stages are kept.
 * If the poll had auto-closed after the final stage, this reopens it.
 */
export async function reopenStage(pollId: string, actorId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { sections: { orderBy: { position: "asc" } } },
  });
  if (!poll) throw new Error("Poll not found.");
  if (!poll.sequential) throw new Error("This poll does not use sequential stages.");

  const lastIndex = poll.sections.length - 1;
  let target: number;
  let newStatus = poll.status;

  if (poll.status === "CLOSED" && poll.currentStage > lastIndex) {
    // All stages had finished — reactivate the final stage.
    target = lastIndex;
    newStatus = "OPEN";
  } else if (poll.status === "OPEN" && poll.currentStage > 0) {
    target = poll.currentStage - 1;
  } else {
    throw new Error("There is no earlier stage to reopen.");
  }

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { currentStage: target, status: newStatus },
  });
  await audit({
    action: "STAGE_REOPENED",
    pollId,
    actorId,
    metadata: { fromStage: poll.currentStage, toStage: target },
  });
  return { stage: target, status: updated.status };
}

export async function flagTie(pollId: string, actorId: string, detail: Record<string, unknown>) {
  await prisma.poll.update({ where: { id: pollId }, data: { status: "NEEDS_TIEBREAK" } });
  await audit({ action: "TIE_DETECTED", pollId, actorId, metadata: detail });
}
