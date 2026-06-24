import { describe, it, expect } from "vitest";
import { resolveTieBreak, seededShuffle } from "../src/lib/rules/tiebreak";

describe("tie-break strategies", () => {
  const tied = ["a", "b", "c"];

  it("MANUAL needs an admin decision", () => {
    const r = resolveTieBreak("MANUAL", tied);
    expect(r.resolved).toBe(false);
    expect(r.needsManual).toBe(true);
  });

  it("RUNOFF requests a runoff phase", () => {
    const r = resolveTieBreak("RUNOFF", tied);
    expect(r.needsRunoff).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it("MOST_FIRST_PLACE resolves by first-place counts", () => {
    const r = resolveTieBreak("MOST_FIRST_PLACE", tied, {
      firstPlaceCounts: { a: 5, b: 2, c: 3 },
    });
    expect(r.resolved).toBe(true);
    expect(r.winner).toBe("a");
  });

  it("MOST_APPROVALS falls back to manual when still tied", () => {
    const r = resolveTieBreak("MOST_APPROVALS", tied, {
      approvalCounts: { a: 4, b: 4, c: 1 },
    });
    expect(r.resolved).toBe(false);
    expect(r.needsManual).toBe(true);
  });

  it("RANDOM_SEED is deterministic for a given seed", () => {
    const r1 = resolveTieBreak("RANDOM_SEED", tied, { seed: "season-4" });
    const r2 = resolveTieBreak("RANDOM_SEED", tied, { seed: "season-4" });
    expect(r1.winner).toBe(r2.winner);
    expect(r1.resolved).toBe(true);
  });

  it("KEEP_TIE keeps the tie", () => {
    const r = resolveTieBreak("KEEP_TIE", tied);
    expect(r.keepTie).toBe(true);
    expect(r.resolved).toBe(true);
  });

  it("seededShuffle is reproducible", () => {
    expect(seededShuffle(tied, "x")).toEqual(seededShuffle(tied, "x"));
  });
});
