import { describe, it, expect } from "vitest";
import { parseAdvancedRule, applyAdvancedRule, describeAdvancedRule } from "../src/lib/rules/advanced";
import { evaluateEligibility } from "../src/lib/rules/engine";
import { makeSection, regularGroup, stewardGroup } from "./helpers";

describe("advanced JSON rule DSL", () => {
  it("rejects malformed rules (no arbitrary code)", () => {
    const res = parseAdvancedRule({ rules: [{ when: { evil: "code" }, then: {} }] });
    expect(res.ok).toBe(false);
  });

  it("parses a valid rule and previews it", () => {
    const res = parseAdvancedRule({
      rules: [{ when: { hasGroup: "Steward" }, then: { voteWeight: 2 } }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const desc = describeAdvancedRule(res.rule);
      expect(desc[0]).toContain("Steward");
      expect(desc[0]).toContain("weight 2");
    }
  });

  it("applies effects on top of evaluated eligibility", () => {
    const parsed = parseAdvancedRule({
      rules: [{ when: { hasGroup: "Steward" }, then: { voteWeight: 2, maxSelections: 6 } }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const base = evaluateEligibility(makeSection(), { groups: [stewardGroup] });
    const after = applyAdvancedRule(base, parsed.rule, ["Steward"]);
    expect(after.voteWeight).toBe(2);
    expect(after.maxSelections).toBe(6);
  });

  it("does not apply when condition is false", () => {
    const parsed = parseAdvancedRule({
      rules: [{ when: { hasGroup: "Steward" }, then: { canVote: false } }],
    });
    if (!parsed.ok) throw new Error("should parse");
    const base = evaluateEligibility(makeSection(), { groups: [regularGroup] });
    const after = applyAdvancedRule(base, parsed.rule, ["Regular Voter"]);
    expect(after.canVote).toBe(true);
  });
});
