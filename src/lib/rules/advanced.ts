// Optional advanced JSON rule mode for power users.
//
// This is a SAFE, declarative DSL — it is parsed and interpreted, never
// executed as code. Conditions use a tiny whitelisted operator set and the
// only effects are limit/weight/eligibility overrides. Everything is validated
// with Zod before being saved.

import { z } from "zod";
import type { VoterEligibility } from "./types";

// ---- Condition DSL ---------------------------------------------------------
// Supported conditions:
//   { "hasGroup": "Steward" }
//   { "hasAnyGroup": ["Steward", "Team Captain"] }
//   { "hasAllGroups": ["Premium Member", "Steward"] }
//   { "not": <condition> }
//   { "and": [<condition>, ...] }
//   { "or":  [<condition>, ...] }
//   { "always": true }

export type Condition =
  | { hasGroup: string }
  | { hasAnyGroup: string[] }
  | { hasAllGroups: string[] }
  | { not: Condition }
  | { and: Condition[] }
  | { or: Condition[] }
  | { always: boolean };

const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ hasGroup: z.string().min(1) }).strict(),
    z.object({ hasAnyGroup: z.array(z.string().min(1)).min(1) }).strict(),
    z.object({ hasAllGroups: z.array(z.string().min(1)).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    z.object({ and: z.array(conditionSchema).min(1) }).strict(),
    z.object({ or: z.array(conditionSchema).min(1) }).strict(),
    z.object({ always: z.boolean() }).strict(),
  ])
);

const effectSchema = z
  .object({
    maxSelections: z.number().int().min(0).optional(),
    minSelections: z.number().int().min(0).optional(),
    exactSelections: z.number().int().min(0).optional(),
    voteWeight: z.number().int().min(1).optional(),
    canVote: z.boolean().optional(),
  })
  .strict();

const ruleSchema = z.object({ when: conditionSchema, then: effectSchema }).strict();

export const advancedRuleSchema = z.object({ rules: z.array(ruleSchema).max(50) }).strict();

export type AdvancedRule = z.infer<typeof advancedRuleSchema>;
export type AdvancedEffect = z.infer<typeof effectSchema>;

export function parseAdvancedRule(input: unknown):
  | { ok: true; rule: AdvancedRule }
  | { ok: false; error: string } {
  const res = advancedRuleSchema.safeParse(input);
  if (res.success) return { ok: true, rule: res.data };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export function evaluateCondition(cond: Condition, groupNames: string[]): boolean {
  const has = (g: string) => groupNames.includes(g);
  if ("hasGroup" in cond) return has(cond.hasGroup);
  if ("hasAnyGroup" in cond) return cond.hasAnyGroup.some(has);
  if ("hasAllGroups" in cond) return cond.hasAllGroups.every(has);
  if ("not" in cond) return !evaluateCondition(cond.not, groupNames);
  if ("and" in cond) return cond.and.every((c) => evaluateCondition(c, groupNames));
  if ("or" in cond) return cond.or.some((c) => evaluateCondition(c, groupNames));
  if ("always" in cond) return cond.always;
  return false;
}

/** Apply matching advanced-rule effects on top of an evaluated eligibility. */
export function applyAdvancedRule(
  eligibility: VoterEligibility,
  rule: AdvancedRule,
  groupNames: string[]
): VoterEligibility {
  const next = { ...eligibility };
  const applied: string[] = [];
  for (const r of rule.rules) {
    if (!evaluateCondition(r.when, groupNames)) continue;
    const t = r.then;
    if (t.canVote != null) next.canVote = t.canVote;
    if (t.maxSelections != null) next.maxSelections = t.maxSelections;
    if (t.minSelections != null) next.minSelections = t.minSelections;
    if (t.exactSelections != null) next.exactSelections = t.exactSelections;
    if (t.voteWeight != null) next.voteWeight = t.voteWeight;
    applied.push(describeRule(r));
  }
  if (applied.length > 0) {
    next.explanation = `${next.explanation} (Advanced rule applied: ${applied.join("; ")})`;
  }
  return next;
}

function describeCondition(cond: Condition): string {
  if ("hasGroup" in cond) return `in group "${cond.hasGroup}"`;
  if ("hasAnyGroup" in cond) return `in any of [${cond.hasAnyGroup.join(", ")}]`;
  if ("hasAllGroups" in cond) return `in all of [${cond.hasAllGroups.join(", ")}]`;
  if ("not" in cond) return `not (${describeCondition(cond.not)})`;
  if ("and" in cond) return cond.and.map(describeCondition).join(" AND ");
  if ("or" in cond) return cond.or.map(describeCondition).join(" OR ");
  if ("always" in cond) return cond.always ? "always" : "never";
  return "?";
}

function describeEffect(t: AdvancedEffect): string {
  const parts: string[] = [];
  if (t.canVote != null) parts.push(t.canVote ? "can vote" : "cannot vote");
  if (t.maxSelections != null) parts.push(`max ${t.maxSelections}`);
  if (t.minSelections != null) parts.push(`min ${t.minSelections}`);
  if (t.exactSelections != null) parts.push(`exactly ${t.exactSelections}`);
  if (t.voteWeight != null) parts.push(`weight ${t.voteWeight}`);
  return parts.join(", ");
}

function describeRule(r: { when: Condition; then: AdvancedEffect }): string {
  return `If ${describeCondition(r.when)} then ${describeEffect(r.then)}`;
}

/** Human-readable preview of what the whole advanced rule does. */
export function describeAdvancedRule(rule: AdvancedRule): string[] {
  return rule.rules.map(describeRule);
}
