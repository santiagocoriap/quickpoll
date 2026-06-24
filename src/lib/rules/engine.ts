// Server-side rule engine.
//
// Two responsibilities:
//   1. evaluateEligibility() — given a voter and a section, decide whether they
//      may vote, their selection limits, vote weight, and which options they see.
//   2. validateBallot() — validate a submitted ballot against that eligibility
//      and the section's voting method. ALWAYS run on the server; client checks
//      are a convenience only.

import type {
  Ballot,
  GroupLimitInput,
  SectionConfig,
  ValidationResult,
  VoterContext,
  VoterEligibility,
} from "./types";

function intersect(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/**
 * Resolve a single numeric limit field across the voter's applicable group
 * limits according to the section's conflict strategy.
 */
function resolveLimit(
  values: { groupId: string; value: number | null; priority: number }[],
  strategy: SectionConfig["conflictStrategy"],
  fallback: number | null
): number | null {
  const present = values.filter((v) => v.value !== null) as {
    groupId: string;
    value: number;
    priority: number;
  }[];
  if (present.length === 0) return fallback;

  switch (strategy) {
    case "LOWEST":
      return Math.min(...present.map((v) => v.value));
    case "PRIORITY": {
      const top = present.slice().sort((a, b) => b.priority - a.priority)[0];
      return top.value;
    }
    case "HIGHEST":
    case "OVERRIDE":
    default:
      return Math.max(...present.map((v) => v.value));
  }
}

export function evaluateEligibility(
  section: SectionConfig,
  voter: VoterContext
): VoterEligibility {
  const voterGroupIds = voter.groups.map((g) => g.id);
  const priorityOf = new Map(voter.groups.map((g) => [g.id, g.priority]));

  // --- Voter eligibility ----------------------------------------------------
  let canVote = true;
  let reasonIfBlocked: string | undefined;

  if (section.excludedGroupIds && intersect(section.excludedGroupIds, voterGroupIds)) {
    canVote = false;
    reasonIfBlocked = "You are in a group that is excluded from this section.";
  }
  if (
    canVote &&
    section.allowedGroupIds &&
    section.allowedGroupIds.length > 0 &&
    !intersect(section.allowedGroupIds, voterGroupIds)
  ) {
    canVote = false;
    reasonIfBlocked = "Only specific groups may vote in this section.";
  }

  const applicable: GroupLimitInput[] = section.groupLimits.filter((l) =>
    voterGroupIds.includes(l.groupId)
  );

  if (canVote && applicable.length > 0 && applicable.every((l) => !l.canVote)) {
    canVote = false;
    reasonIfBlocked = "Your group is not permitted to vote in this section.";
  }

  // Manual per-user override takes precedence on eligibility if provided.
  const override = voter.override ?? null;
  if (override?.canVote != null) {
    canVote = override.canVote;
    if (!canVote) reasonIfBlocked = "Voting is disabled for your account in this section.";
  }

  // --- Numeric limits -------------------------------------------------------
  const useOverride = section.conflictStrategy === "OVERRIDE" && override != null;

  const mk = (pick: (l: GroupLimitInput) => number | null) =>
    applicable.map((l) => ({
      groupId: l.groupId,
      value: pick(l),
      priority: priorityOf.get(l.groupId) ?? 0,
    }));

  let maxSelections = resolveLimit(
    mk((l) => l.maxSelections),
    section.conflictStrategy,
    section.maxSelections
  );
  let minSelections = resolveLimit(
    mk((l) => l.minSelections),
    // min should generally be permissive -> take the lowest required min
    "LOWEST",
    section.minSelections
  );
  let exactSelections = resolveLimit(
    mk((l) => l.exactSelections),
    section.conflictStrategy,
    section.exactSelections
  );
  let voteWeight =
    resolveLimit(
      mk((l) => l.voteWeight),
      section.conflictStrategy,
      section.defaultWeight
    ) ?? section.defaultWeight;

  if (useOverride && override) {
    if (override.maxSelections != null) maxSelections = override.maxSelections;
    if (override.minSelections != null) minSelections = override.minSelections;
    if (override.exactSelections != null) exactSelections = override.exactSelections;
    if (override.voteWeight != null) voteWeight = override.voteWeight;
  }

  // SINGLE choice always caps at 1 selection.
  if (section.method === "SINGLE") {
    maxSelections = 1;
  }

  // --- Option visibility ----------------------------------------------------
  const hidden = new Set<string>();
  const disabled = new Set<string>();
  for (const rule of section.optionGroupRules) {
    if (!voterGroupIds.includes(rule.groupId)) continue;
    if (rule.hidden) hidden.add(rule.optionId);
    if (rule.disabled) disabled.add(rule.optionId);
  }
  const visibleOptionIds = section.options
    .map((o) => o.id)
    .filter((id) => !hidden.has(id));

  // --- Human-readable explanation ------------------------------------------
  const explanation = buildExplanation(section, voter, {
    canVote,
    minSelections: minSelections ?? 0,
    maxSelections,
    exactSelections,
    voteWeight,
    reasonIfBlocked,
  });

  return {
    canVote,
    minSelections: minSelections ?? 0,
    maxSelections,
    exactSelections,
    voteWeight,
    scoreMin: section.scoreMin,
    scoreMax: section.scoreMax,
    allowSameScore: section.allowSameScore,
    requireFullRank: section.requireFullRank,
    visibleOptionIds,
    disabledOptionIds: [...disabled],
    explanation,
    reasonIfBlocked,
  };
}

function buildExplanation(
  section: SectionConfig,
  voter: VoterContext,
  e: {
    canVote: boolean;
    minSelections: number;
    maxSelections: number | null;
    exactSelections: number | null;
    voteWeight: number;
    reasonIfBlocked?: string;
  }
): string {
  if (!e.canVote) return e.reasonIfBlocked ?? "You are not eligible to vote in this section.";

  // Find which group (if any) is driving the limit, for a friendlier message.
  const drivingGroup = voter.groups.find((g) =>
    section.groupLimits.some(
      (l) => l.groupId === g.id && (l.maxSelections != null || l.exactSelections != null)
    )
  );
  const groupClause = drivingGroup ? `You are in the ${drivingGroup.name} group, so ` : "";

  switch (section.method) {
    case "SINGLE":
      return `${groupClause}you can select exactly one option.`;
    case "RANKED": {
      const min = section.minRanked ?? 0;
      const max = section.maxRanked;
      const full = section.requireFullRank ? " You must rank every option." : "";
      const range = max ? `between ${min} and ${max}` : `at least ${min}`;
      return `Rank your preferred options (${range}).${full}`;
    }
    case "SCORE":
      return `${groupClause}give each option a score from ${section.scoreMin} to ${section.scoreMax}.`;
    case "APPROVAL":
    case "MULTIPLE":
    default: {
      if (e.exactSelections != null)
        return `${groupClause}you must select exactly ${e.exactSelections} option(s).`;
      const cap = e.maxSelections == null ? "any number of" : `up to ${e.maxSelections}`;
      const minPart = e.minSelections > 0 ? ` (at least ${e.minSelections})` : "";
      const weightPart = e.voteWeight !== 1 ? ` Your vote counts as ${e.voteWeight}.` : "";
      return `${groupClause}you can select ${cap} option(s)${minPart}.${weightPart}`;
    }
  }
}

export function validateBallot(
  section: SectionConfig,
  eligibility: VoterEligibility,
  ballot: Ballot
): ValidationResult {
  const errors: string[] = [];

  if (!eligibility.canVote) {
    return { valid: false, errors: [eligibility.reasonIfBlocked ?? "You cannot vote here."] };
  }

  const sel = ballot.selections;
  const visible = new Set(eligibility.visibleOptionIds);
  const disabled = new Set(eligibility.disabledOptionIds);

  // No duplicate options.
  const seen = new Set<string>();
  for (const s of sel) {
    if (seen.has(s.optionId)) errors.push("Duplicate option in ballot.");
    seen.add(s.optionId);
    if (!visible.has(s.optionId)) errors.push("Ballot references an option you cannot see.");
    if (disabled.has(s.optionId)) errors.push("Ballot references a disabled option.");
  }

  const count = sel.length;
  const { minSelections, maxSelections, exactSelections } = eligibility;

  const checkCount = () => {
    if (exactSelections != null && count !== exactSelections)
      errors.push(`You must select exactly ${exactSelections} option(s).`);
    if (exactSelections == null) {
      if (count < minSelections)
        errors.push(`Select at least ${minSelections} option(s).`);
      if (maxSelections != null && count > maxSelections)
        errors.push(`Select at most ${maxSelections} option(s).`);
    }
  };

  switch (section.method) {
    case "SINGLE":
      if (count > 1) errors.push("Select only one option.");
      if (minSelections >= 1 && count < 1) errors.push("Select one option.");
      break;

    case "MULTIPLE":
    case "APPROVAL":
      checkCount();
      break;

    case "RANKED": {
      const ranks = sel.map((s) => s.rank).filter((r): r is number => r != null);
      if (ranks.length !== sel.length)
        errors.push("Every ranked option needs a rank.");
      const uniq = new Set(ranks);
      if (uniq.size !== ranks.length) errors.push("Ranks must be unique.");
      const sorted = [...ranks].sort((a, b) => a - b);
      sorted.forEach((r, i) => {
        if (r !== i + 1) errors.push("Ranks must be consecutive starting at 1.");
      });
      const min = section.minRanked ?? minSelections;
      const max = section.maxRanked ?? maxSelections;
      if (count < min) errors.push(`Rank at least ${min} option(s).`);
      if (max != null && count > max) errors.push(`Rank at most ${max} option(s).`);
      if (section.requireFullRank && count !== visible.size)
        errors.push("You must rank every option.");
      break;
    }

    case "SCORE": {
      for (const s of sel) {
        if (s.score == null) {
          errors.push("Every scored option needs a score.");
          continue;
        }
        if (s.score < eligibility.scoreMin || s.score > eligibility.scoreMax)
          errors.push(`Scores must be between ${eligibility.scoreMin} and ${eligibility.scoreMax}.`);
      }
      if (!eligibility.allowSameScore) {
        const scores = sel.map((s) => s.score);
        if (new Set(scores).size !== scores.length)
          errors.push("Each option must get a different score.");
      }
      checkCount();
      break;
    }
  }

  // De-duplicate error messages.
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
