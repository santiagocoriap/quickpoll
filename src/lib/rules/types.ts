// Pure, framework-agnostic types for the rule + result engines.
// These deliberately do NOT import Prisma so the engines stay easy to unit test.

export type VotingMethod = "SINGLE" | "MULTIPLE" | "RANKED" | "SCORE" | "APPROVAL";

export type LimitConflictStrategy = "HIGHEST" | "LOWEST" | "PRIORITY" | "OVERRIDE";

export type TieBreakStrategy =
  | "MANUAL"
  | "RUNOFF"
  | "INSTANT_RUNOFF"
  | "PREVIOUS_ROUND"
  | "MOST_FIRST_PLACE"
  | "MOST_APPROVALS"
  | "RANDOM_SEED"
  | "KEEP_TIE";

export interface GroupInput {
  id: string;
  name: string;
  priority: number;
}

export interface GroupLimitInput {
  groupId: string;
  minSelections: number | null;
  maxSelections: number | null;
  exactSelections: number | null;
  voteWeight: number;
  canVote: boolean;
}

export interface UserOverrideInput {
  minSelections: number | null;
  maxSelections: number | null;
  exactSelections: number | null;
  voteWeight: number | null;
  canVote: boolean | null;
}

export interface OptionInput {
  id: string;
  label: string;
}

export interface OptionGroupRuleInput {
  optionId: string;
  groupId: string;
  hidden: boolean;
  disabled: boolean;
}

export interface SectionConfig {
  id: string;
  method: VotingMethod;
  minSelections: number | null;
  maxSelections: number | null;
  exactSelections: number | null;
  minRanked: number | null;
  maxRanked: number | null;
  requireFullRank: boolean;
  scoreMin: number;
  scoreMax: number;
  allowSameScore: boolean;
  defaultWeight: number;
  conflictStrategy: LimitConflictStrategy;
  numWinners: number;
  // Optional eligibility: if non-empty, ONLY these groups may vote.
  allowedGroupIds?: string[];
  // Groups explicitly excluded from voting.
  excludedGroupIds?: string[];
  options: OptionInput[];
  groupLimits: GroupLimitInput[];
  optionGroupRules: OptionGroupRuleInput[];
}

export interface VoterContext {
  groups: GroupInput[]; // the groups this voter belongs to
  override?: UserOverrideInput | null;
}

export interface VoterEligibility {
  canVote: boolean;
  minSelections: number;
  maxSelections: number | null; // null = unlimited
  exactSelections: number | null;
  voteWeight: number;
  scoreMin: number;
  scoreMax: number;
  allowSameScore: boolean;
  requireFullRank: boolean;
  visibleOptionIds: string[];
  disabledOptionIds: string[];
  explanation: string;
  reasonIfBlocked?: string;
}

// A submitted ballot in normalized form.
export interface BallotSelection {
  optionId: string;
  rank?: number | null;
  score?: number | null;
  approved?: boolean;
}

export interface Ballot {
  selections: BallotSelection[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
