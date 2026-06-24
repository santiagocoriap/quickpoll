import { z } from "zod";

export const votingMethods = ["SINGLE", "MULTIPLE", "RANKED", "SCORE", "APPROVAL"] as const;
export const tieStrategies = [
  "MANUAL",
  "RUNOFF",
  "INSTANT_RUNOFF",
  "PREVIOUS_ROUND",
  "MOST_FIRST_PLACE",
  "MOST_APPROVALS",
  "RANDOM_SEED",
  "KEEP_TIE",
] as const;
export const conflictStrategies = ["HIGHEST", "LOWEST", "PRIORITY", "OVERRIDE"] as const;
export const resultVisibilities = ["ALWAYS", "AFTER_VOTE", "AFTER_CLOSE", "ADMIN_ONLY"] as const;
export const anonymityLevels = ["ANONYMOUS", "ADMIN_VISIBLE", "PUBLIC"] as const;

export const setupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const groupSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  color: z.string().max(20).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
});

export const userSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["SUPER_ADMIN", "POLL_ADMIN", "VOTER"]).default("VOTER"),
  groupIds: z.array(z.string()).default([]),
});

const groupLimitSchema = z.object({
  groupId: z.string(),
  maxSelections: z.number().int().min(0).nullable().optional(),
  minSelections: z.number().int().min(0).nullable().optional(),
  exactSelections: z.number().int().min(0).nullable().optional(),
  voteWeight: z.number().int().min(1).max(100).default(1),
  canVote: z.boolean().default(true),
});

const optionSchema = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  hiddenForGroupIds: z.array(z.string()).default([]),
  disabledForGroupIds: z.array(z.string()).default([]),
});

export const sectionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  method: z.enum(votingMethods),
  minSelections: z.number().int().min(0).nullable().optional(),
  maxSelections: z.number().int().min(0).nullable().optional(),
  exactSelections: z.number().int().min(0).nullable().optional(),
  minRanked: z.number().int().min(0).nullable().optional(),
  maxRanked: z.number().int().min(0).nullable().optional(),
  requireFullRank: z.boolean().default(false),
  scoreMin: z.number().int().default(0),
  scoreMax: z.number().int().default(5),
  allowSameScore: z.boolean().default(true),
  defaultWeight: z.number().int().min(1).default(1),
  numWinners: z.number().int().min(1).default(1),
  resultVisibility: z.enum(resultVisibilities).default("AFTER_CLOSE"),
  anonymity: z.enum(anonymityLevels).default("ADMIN_VISIBLE"),
  allowVoteEdit: z.boolean().default(true),
  conflictStrategy: z.enum(conflictStrategies).default("HIGHEST"),
  tieBreakStrategy: z.enum(tieStrategies).default("MANUAL"),
  allowedGroupIds: z.array(z.string()).default([]),
  excludedGroupIds: z.array(z.string()).default([]),
  advancedRule: z.unknown().optional().nullable(),
  options: z.array(optionSchema).min(1, "Add at least one option"),
  groupLimits: z.array(groupLimitSchema).default([]),
});

export const pollSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
  sequential: z.boolean().default(false),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  accessUserIds: z.array(z.string()).default([]),
  accessGroupIds: z.array(z.string()).default([]),
  sections: z.array(sectionSchema).min(1, "Add at least one section"),
});

export const ballotSchema = z.object({
  sectionId: z.string(),
  phaseId: z.string().nullable().optional(),
  selections: z
    .array(
      z.object({
        optionId: z.string(),
        rank: z.number().int().min(1).nullable().optional(),
        score: z.number().int().nullable().optional(),
        approved: z.boolean().optional(),
      })
    )
    .max(500),
});

export const inviteSchema = z.object({
  pollId: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(["POLL_ADMIN", "VOTER"]).default("VOTER"),
  groupIds: z.array(z.string()).default([]),
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const voterCodeSchema = z.object({
  pollId: z.string(),
  count: z.number().int().min(1).max(500).default(1),
  groupIds: z.array(z.string()).default([]),
  label: z.string().max(100).optional(),
});

export type PollInput = z.infer<typeof pollSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
