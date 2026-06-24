import { describe, it, expect } from "vitest";
import { evaluateEligibility, validateBallot } from "../src/lib/rules/engine";
import { makeSection, regularGroup, championGroup, stewardGroup } from "./helpers";

describe("per-group selection limits", () => {
  it("regular voter gets max 3 tracks", () => {
    const e = evaluateEligibility(makeSection(), { groups: [regularGroup] });
    expect(e.canVote).toBe(true);
    expect(e.maxSelections).toBe(3);
    expect(e.voteWeight).toBe(1);
  });

  it("previous champion gets max 4 tracks", () => {
    const e = evaluateEligibility(makeSection(), { groups: [championGroup] });
    expect(e.maxSelections).toBe(4);
    expect(e.explanation).toContain("Previous Champion");
  });

  it("HIGHEST conflict strategy picks the most generous limit", () => {
    const e = evaluateEligibility(makeSection({ conflictStrategy: "HIGHEST" }), {
      groups: [regularGroup, championGroup],
    });
    expect(e.maxSelections).toBe(4);
  });

  it("LOWEST conflict strategy picks the strictest limit", () => {
    const e = evaluateEligibility(makeSection({ conflictStrategy: "LOWEST" }), {
      groups: [regularGroup, championGroup],
    });
    expect(e.maxSelections).toBe(3);
  });

  it("PRIORITY conflict strategy picks the highest-priority group's limit", () => {
    const section = makeSection({
      conflictStrategy: "PRIORITY",
      groupLimits: [
        { groupId: "g-regular", minSelections: null, maxSelections: 3, exactSelections: null, voteWeight: 1, canVote: true },
        { groupId: "g-steward", minSelections: null, maxSelections: 5, exactSelections: null, voteWeight: 1, canVote: true },
      ],
    });
    const e = evaluateEligibility(section, { groups: [regularGroup, stewardGroup] });
    expect(e.maxSelections).toBe(5); // steward priority 20 wins
  });
});

describe("vote validation (the required sim-racing scenario)", () => {
  const section = makeSection();
  const tracks = (n: number) =>
    ({ selections: Array.from({ length: n }, (_, i) => ({ optionId: `o${i + 1}` })) });

  it("rejects a regular voter submitting 4 tracks", () => {
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    const res = validateBallot(section, e, tracks(4));
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toContain("at most 3");
  });

  it("accepts a regular voter submitting 3 tracks", () => {
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(validateBallot(section, e, tracks(3)).valid).toBe(true);
  });

  it("accepts a previous champion submitting 4 tracks", () => {
    const e = evaluateEligibility(section, { groups: [championGroup] });
    expect(validateBallot(section, e, tracks(4)).valid).toBe(true);
  });

  it("rejects a previous champion submitting 5 tracks", () => {
    const e = evaluateEligibility(section, { groups: [championGroup] });
    expect(validateBallot(section, e, tracks(5)).valid).toBe(false);
  });
});

describe("option eligibility & voter eligibility", () => {
  it("hides an option for a specific group", () => {
    const section = makeSection({
      optionGroupRules: [{ optionId: "o5", groupId: "g-regular", hidden: true, disabled: false }],
    });
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(e.visibleOptionIds).not.toContain("o5");
    expect(e.visibleOptionIds).toHaveLength(4);
  });

  it("blocks voters not in the allowed groups", () => {
    const section = makeSection({ allowedGroupIds: ["g-champion"] });
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(e.canVote).toBe(false);
  });

  it("blocks excluded groups", () => {
    const section = makeSection({ excludedGroupIds: ["g-regular"] });
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(e.canVote).toBe(false);
  });
});

describe("single choice", () => {
  const section = makeSection({ method: "SINGLE", maxSelections: null });
  it("caps selection at 1", () => {
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(e.maxSelections).toBe(1);
    expect(validateBallot(section, e, { selections: [{ optionId: "o1" }, { optionId: "o2" }] }).valid).toBe(false);
    expect(validateBallot(section, e, { selections: [{ optionId: "o1" }] }).valid).toBe(true);
  });
});

describe("ranked validation", () => {
  const section = makeSection({ method: "RANKED", minRanked: 2, maxRanked: 3, maxSelections: null });
  it("requires unique consecutive ranks", () => {
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(
      validateBallot(section, e, { selections: [{ optionId: "o1", rank: 1 }, { optionId: "o2", rank: 1 }] }).valid
    ).toBe(false);
    expect(
      validateBallot(section, e, { selections: [{ optionId: "o1", rank: 1 }, { optionId: "o2", rank: 2 }] }).valid
    ).toBe(true);
  });
});

describe("score validation", () => {
  const section = makeSection({ method: "SCORE", scoreMin: 0, scoreMax: 5, allowSameScore: false, maxSelections: null });
  it("enforces score bounds and uniqueness", () => {
    const e = evaluateEligibility(section, { groups: [regularGroup] });
    expect(validateBallot(section, e, { selections: [{ optionId: "o1", score: 9 }] }).valid).toBe(false);
    expect(
      validateBallot(section, e, { selections: [{ optionId: "o1", score: 3 }, { optionId: "o2", score: 3 }] }).valid
    ).toBe(false);
    expect(
      validateBallot(section, e, { selections: [{ optionId: "o1", score: 3 }, { optionId: "o2", score: 4 }] }).valid
    ).toBe(true);
  });
});

describe("weighted voting", () => {
  it("steward votes carry weight 2 without extra selections", () => {
    const section = makeSection({
      groupLimits: [
        { groupId: "g-steward", minSelections: null, maxSelections: 3, exactSelections: null, voteWeight: 2, canVote: true },
      ],
    });
    const e = evaluateEligibility(section, { groups: [stewardGroup] });
    expect(e.voteWeight).toBe(2);
    expect(e.maxSelections).toBe(3); // weight is separate from selection count
  });
});
