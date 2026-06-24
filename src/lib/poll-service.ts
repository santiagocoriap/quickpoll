// Service layer: bridges the database (Prisma) to the pure rule/result engines.

import { prisma } from "./db";
import { evaluateEligibility, validateBallot } from "./rules/engine";
import { computeResult, type ResultBallot, type SectionResult } from "./rules/results";
import { resolveTieBreak, type TieBreakContext } from "./rules/tiebreak";
import { parseAdvancedRule, applyAdvancedRule } from "./rules/advanced";
import type { Ballot, SectionConfig, VoterEligibility } from "./rules/types";

type Json = any;

function asIdArray(v: Json): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  return undefined;
}

const sectionInclude = {
  options: { orderBy: { position: "asc" } },
  groupLimits: true,
  rules: true,
} as const;

export async function getSectionWithConfig(sectionId: string) {
  return prisma.pollSection.findUnique({
    where: { id: sectionId },
    include: {
      ...sectionInclude,
      options: { orderBy: { position: "asc" }, include: { groupRules: true } },
      poll: true,
    },
  });
}

type SectionWithConfig = NonNullable<Awaited<ReturnType<typeof getSectionWithConfig>>>;

/** Translate a Prisma section row into the engine's SectionConfig. */
export function toSectionConfig(section: SectionWithConfig): SectionConfig {
  return {
    id: section.id,
    method: section.method,
    minSelections: section.minSelections,
    maxSelections: section.maxSelections,
    exactSelections: section.exactSelections,
    minRanked: section.minRanked,
    maxRanked: section.maxRanked,
    requireFullRank: section.requireFullRank,
    scoreMin: section.scoreMin,
    scoreMax: section.scoreMax,
    allowSameScore: section.allowSameScore,
    defaultWeight: section.defaultWeight,
    conflictStrategy: section.conflictStrategy,
    numWinners: section.numWinners,
    allowedGroupIds: asIdArray(section.allowedGroupIds),
    excludedGroupIds: asIdArray(section.excludedGroupIds),
    options: section.options.map((o) => ({ id: o.id, label: o.label })),
    groupLimits: section.groupLimits.map((l) => ({
      groupId: l.groupId,
      minSelections: l.minSelections,
      maxSelections: l.maxSelections,
      exactSelections: l.exactSelections,
      voteWeight: l.voteWeight,
      canVote: l.canVote,
    })),
    optionGroupRules: section.options.flatMap((o) =>
      o.groupRules.map((r) => ({
        optionId: o.id,
        groupId: r.groupId,
        hidden: r.hidden,
        disabled: r.disabled,
      }))
    ),
  };
}

/** Build an engine config for a RUNOFF phase (its own method + uniform limits). */
export function toPhaseConfig(section: SectionWithConfig, phase: { method: string; minSelections: number | null; maxSelections: number | null; exactSelections: number | null; optionIds: Json; seats: number | null }): SectionConfig {
  const base = toSectionConfig(section);
  const optionIds = asIdArray(phase.optionIds) ?? [];
  return {
    ...base,
    method: phase.method as SectionConfig["method"],
    minSelections: phase.minSelections,
    maxSelections: phase.maxSelections,
    exactSelections: phase.exactSelections,
    numWinners: phase.seats ?? base.numWinners,
    options: base.options.filter((o) => optionIds.includes(o.id)),
    // Runoff limits are uniform — keep only weight & eligibility from groups.
    groupLimits: base.groupLimits.map((l) => ({
      ...l,
      minSelections: null,
      maxSelections: null,
      exactSelections: null,
    })),
    // All tied options are visible to every eligible voter in a runoff.
    optionGroupRules: [],
  };
}

/** Evaluate a voter's eligibility for a specific runoff phase. */
export async function getPhaseEligibility(
  phaseId: string,
  userId: string
): Promise<{ phase: any; section: SectionWithConfig; config: SectionConfig; eligibility: VoterEligibility } | null> {
  const phase = await prisma.pollPhase.findUnique({ where: { id: phaseId } });
  if (!phase) return null;
  const section = await getSectionWithConfig(phase.sectionId);
  if (!section) return null;

  const userGroups = await prisma.userGroup.findMany({ where: { userId }, include: { group: true } });
  const override = await prisma.userSectionOverride.findUnique({
    where: { sectionId_userId: { sectionId: phase.sectionId, userId } },
  });

  const config = toPhaseConfig(section, phase);
  const eligibility = evaluateEligibility(config, {
    groups: userGroups.map((ug) => ({ id: ug.groupId, name: ug.group.name, priority: ug.group.priority })),
    // Selection limits come from the phase; only weight & eligibility carry over.
    override: override
      ? { minSelections: null, maxSelections: null, exactSelections: null, voteWeight: override.voteWeight, canVote: override.canVote }
      : null,
  });
  return { phase, section, config, eligibility };
}

/** Evaluate a user's eligibility for a section, applying advanced rules. */
export async function getEligibility(
  sectionId: string,
  userId: string
): Promise<{ section: SectionWithConfig; eligibility: VoterEligibility } | null> {
  const section = await getSectionWithConfig(sectionId);
  if (!section) return null;

  const userGroups = await prisma.userGroup.findMany({
    where: { userId },
    include: { group: true },
  });
  const override = await prisma.userSectionOverride.findUnique({
    where: { sectionId_userId: { sectionId, userId } },
  });

  const config = toSectionConfig(section);
  let eligibility = evaluateEligibility(config, {
    groups: userGroups.map((ug) => ({ id: ug.groupId, name: ug.group.name, priority: ug.group.priority })),
    override: override
      ? {
          minSelections: override.minSelections,
          maxSelections: override.maxSelections,
          exactSelections: override.exactSelections,
          voteWeight: override.voteWeight,
          canVote: override.canVote,
        }
      : null,
  });

  if (section.advancedRule) {
    const parsed = parseAdvancedRule(section.advancedRule);
    if (parsed.ok) {
      eligibility = applyAdvancedRule(eligibility, parsed.rule, userGroups.map((ug) => ug.group.name));
    }
  }

  return { section, eligibility };
}

/** Number of users eligible to vote in a section (for turnout). */
export async function countEligibleVoters(section: SectionWithConfig): Promise<number> {
  const allowed = asIdArray(section.allowedGroupIds);
  const excluded = asIdArray(section.excludedGroupIds) ?? [];

  // Base population: members of the poll (via access) or all active users for public polls.
  const access = await prisma.pollAccess.findMany({ where: { pollId: section.pollId } });
  let userIds: Set<string>;
  if (section.poll.visibility === "PRIVATE" && access.length > 0) {
    const directUserIds = access.filter((a) => a.userId).map((a) => a.userId!);
    const groupIds = access.filter((a) => a.groupId).map((a) => a.groupId!);
    const groupMembers = groupIds.length
      ? await prisma.userGroup.findMany({ where: { groupId: { in: groupIds } } })
      : [];
    userIds = new Set([...directUserIds, ...groupMembers.map((m) => m.userId)]);
  } else {
    const all = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
    userIds = new Set(all.map((u) => u.id));
  }

  if (!allowed && excluded.length === 0) return userIds.size;

  // Filter by allowed/excluded groups.
  const memberships = await prisma.userGroup.findMany({
    where: { userId: { in: [...userIds] } },
    select: { userId: true, groupId: true },
  });
  const groupsByUser = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (!groupsByUser.has(m.userId)) groupsByUser.set(m.userId, new Set());
    groupsByUser.get(m.userId)!.add(m.groupId);
  }
  let count = 0;
  for (const uid of userIds) {
    const g = groupsByUser.get(uid) ?? new Set();
    if (excluded.some((e) => g.has(e))) continue;
    if (allowed && allowed.length > 0 && !allowed.some((a) => g.has(a))) continue;
    count++;
  }
  return count;
}

/** Load ballots for result computation (filtered by phase). */
export async function loadResultBallots(
  sectionId: string,
  phaseId: string | null
): Promise<ResultBallot[]> {
  const votes = await prisma.vote.findMany({
    where: { sectionId, phaseId: phaseId ?? null },
    include: { selections: true },
  });
  return votes.map((v) => ({
    weight: v.weight,
    selections: v.selections.map((s) => ({
      optionId: s.optionId,
      rank: s.rank,
      score: s.score,
      approved: s.approved,
    })),
  }));
}

export interface ComputedSection {
  result: SectionResult;
  eligibleVoters: number;
  ballotsCast: number;
  turnout: number;
  tieRecommendation?: ReturnType<typeof resolveTieBreak>;
}

export async function computeSection(
  sectionId: string,
  phaseId: string | null = null,
  optionSubset?: string[],
  seatsOverride?: number | null,
  methodOverride?: string | null
): Promise<ComputedSection | null> {
  const section = await getSectionWithConfig(sectionId);
  if (!section) return null;

  let options = section.options.map((o) => ({ id: o.id, label: o.label }));
  if (optionSubset) options = options.filter((o) => optionSubset.includes(o.id));

  // A runoff fills only the seats left open by the previous round, and uses its
  // own voting method.
  const numWinners = seatsOverride ?? section.numWinners;
  const method = (methodOverride ?? section.method) as SectionConfig["method"];

  const ballots = await loadResultBallots(sectionId, phaseId);
  const result = computeResult(method, ballots, options, numWinners);
  const eligibleVoters = await countEligibleVoters(section);
  const ballotsCast = ballots.length;
  const turnout = eligibleVoters > 0 ? Math.round((ballotsCast / eligibleVoters) * 1000) / 10 : 0;

  let tieRecommendation;
  if (result.tie) {
    const ctx: TieBreakContext = {
      firstPlaceCounts: Object.fromEntries(result.options.map((o) => [o.optionId, o.weightedVotes])),
      approvalCounts: Object.fromEntries(result.options.map((o) => [o.optionId, o.weightedVotes])),
      seed: `${section.id}:${phaseId ?? "original"}`,
    };
    tieRecommendation = resolveTieBreak(section.tieBreakStrategy, result.tiedForLastSeat, ctx);
  }

  return { result, eligibleVoters, ballotsCast, turnout, tieRecommendation };
}

/** Validate then persist a vote. Returns errors if invalid. */
export async function submitVote(params: {
  sectionId: string;
  userId: string;
  phaseId?: string | null;
  ballot: Ballot;
}): Promise<{ ok: true; voteId: string; edited: boolean } | { ok: false; errors: string[] }> {
  const { sectionId, userId, ballot } = params;
  const phaseId = params.phaseId ?? null;

  let section: SectionWithConfig;
  let config: SectionConfig;
  let eligibility: VoterEligibility;

  if (phaseId) {
    // Runoff vote: use the phase's own voting config (method + uniform limits).
    const pe = await getPhaseEligibility(phaseId, userId);
    if (!pe) return { ok: false, errors: ["Runoff phase not found."] };
    if (pe.phase.status !== "OPEN") return { ok: false, errors: ["This phase is not open."] };
    section = pe.section;
    config = pe.config;
    eligibility = pe.eligibility;
  } else {
    const evaluated = await getEligibility(sectionId, userId);
    if (!evaluated) return { ok: false, errors: ["Section not found."] };
    section = evaluated.section;
    eligibility = evaluated.eligibility;
    config = toSectionConfig(section);

    if (section.poll.status !== "OPEN") return { ok: false, errors: ["This poll is not open for voting."] };
    if (section.poll.closesAt && section.poll.closesAt < new Date())
      return { ok: false, errors: ["Voting has closed."] };
    if (section.poll.opensAt && section.poll.opensAt > new Date())
      return { ok: false, errors: ["Voting has not opened yet."] };
    // Once a runoff exists for this section, the original round is locked so its
    // tally can't change underneath the tie-break.
    const runoffCount = await prisma.pollPhase.count({ where: { sectionId } });
    if (runoffCount > 0)
      return {
        ok: false,
        errors: ["This section is being resolved in a runoff; the original round is closed."],
      };
    // Sequential polls only accept votes for the active stage.
    if (section.poll.sequential && section.position !== section.poll.currentStage) {
      return {
        ok: false,
        errors: [
          section.position < section.poll.currentStage
            ? "This stage has already closed."
            : "This stage has not opened yet. Earlier stages must finish first.",
        ],
      };
    }
  }

  const validation = validateBallot(config, eligibility, ballot);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  const existing = await prisma.vote.findFirst({
    where: { sectionId, phaseId, userId },
  });
  if (existing && !section.allowVoteEdit && !phaseId)
    return { ok: false, errors: ["You have already voted and editing is disabled."] };

  const vote = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.voteSelection.deleteMany({ where: { voteId: existing.id } });
      await tx.vote.update({ where: { id: existing.id }, data: { weight: eligibility.voteWeight } });
      await tx.voteSelection.createMany({
        data: ballot.selections.map((s) => ({
          voteId: existing.id,
          optionId: s.optionId,
          rank: s.rank ?? null,
          score: s.score ?? null,
          approved: s.approved ?? true,
        })),
      });
      return existing;
    }
    const created = await tx.vote.create({
      data: {
        pollId: section.pollId,
        sectionId,
        phaseId,
        userId,
        weight: eligibility.voteWeight,
        selections: {
          create: ballot.selections.map((s) => ({
            optionId: s.optionId,
            rank: s.rank ?? null,
            score: s.score ?? null,
            approved: s.approved ?? true,
          })),
        },
      },
    });
    return created;
  });

  return { ok: true, voteId: vote.id, edited: Boolean(existing) };
}
