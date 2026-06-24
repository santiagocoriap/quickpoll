import { describe, it, expect } from "vitest";
import { computeResult, type ResultBallot } from "../src/lib/rules/results";

const options = [
  { id: "a", label: "Monza" },
  { id: "b", label: "Spa" },
  { id: "c", label: "Silverstone" },
];

const b = (sel: ResultBallot["selections"], weight = 1): ResultBallot => ({ weight, selections: sel });

describe("plurality / multiple choice", () => {
  it("counts weighted votes and picks a winner", () => {
    const ballots = [
      b([{ optionId: "a" }, { optionId: "b" }]),
      b([{ optionId: "a" }]),
      b([{ optionId: "c" }]),
    ];
    const r = computeResult("MULTIPLE", ballots, options, 1);
    expect(r.winners).toEqual(["a"]);
    expect(r.tie).toBe(false);
    expect(r.options.find((o) => o.optionId === "a")?.weightedVotes).toBe(2);
  });

  it("detects a tie for the final slot", () => {
    const ballots = [b([{ optionId: "a" }]), b([{ optionId: "b" }])];
    const r = computeResult("MULTIPLE", ballots, options, 1);
    expect(r.tie).toBe(true);
    expect(r.tiedForLastSeat.sort()).toEqual(["a", "b"]);
  });

  it("respects vote weight", () => {
    const ballots = [b([{ optionId: "a" }], 1), b([{ optionId: "b" }], 3)];
    const r = computeResult("MULTIPLE", ballots, options, 1);
    expect(r.winners).toEqual(["b"]);
    expect(r.options.find((o) => o.optionId === "b")?.weightedVotes).toBe(3);
    expect(r.options.find((o) => o.optionId === "b")?.rawVotes).toBe(1);
  });
});

describe("approval voting", () => {
  it("totals approvals across ballots", () => {
    const ballots = [
      b([{ optionId: "a" }, { optionId: "b" }]),
      b([{ optionId: "a" }, { optionId: "c" }]),
    ];
    const r = computeResult("APPROVAL", ballots, options, 1);
    expect(r.winners).toEqual(["a"]);
  });
});

describe("score voting", () => {
  it("computes average score and total", () => {
    const ballots = [
      b([{ optionId: "a", score: 5 }, { optionId: "b", score: 1 }]),
      b([{ optionId: "a", score: 3 }, { optionId: "b", score: 1 }]),
    ];
    const r = computeResult("SCORE", ballots, options, 1);
    const a = r.options.find((o) => o.optionId === "a")!;
    expect(a.averageScore).toBe(4);
    expect(a.totalScore).toBe(8);
    expect(a.scoreCount).toBe(2);
    expect(r.winners).toEqual(["a"]);
  });
});

describe("top-N tie detection (boundary only)", () => {
  const six = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
    { id: "d", label: "D" },
    { id: "e", label: "E" },
    { id: "f", label: "F" },
  ];
  // weight encodes the vote count for that option
  const counts = (m: Record<string, number>): ResultBallot[] =>
    Object.entries(m).map(([id, n]) => b([{ optionId: id }], n));

  it("ignores a tie that is safely inside the winning set (2nd vs 3rd)", () => {
    // a=10, b=c=8 (tied, but both clearly top-5), d=6, e=4, f=2
    const r = computeResult("MULTIPLE", counts({ a: 10, b: 8, c: 8, d: 6, e: 4, f: 2 }), six, 5);
    expect(r.tie).toBe(false);
    expect(r.winners.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("detects a tie that straddles the boundary (5th vs 6th)", () => {
    // a=10,b=8,c=6,d=5, e=f=4 -> e and f tie for the 5th seat
    const r = computeResult("MULTIPLE", counts({ a: 10, b: 8, c: 6, d: 5, e: 4, f: 4 }), six, 5);
    expect(r.tie).toBe(true);
    expect(r.tiedForLastSeat.sort()).toEqual(["e", "f"]);
    // the four clear winners are locked in
    expect(r.winners.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("a runoff for the 1 remaining seat resolves to a single winner", () => {
    // only e and f carried, one seat to fill
    const r = computeResult("MULTIPLE", counts({ e: 3, f: 1 }), [six[4], six[5]], 1);
    expect(r.tie).toBe(false);
    expect(r.winners).toEqual(["e"]);
  });
});

describe("ranked-choice instant-runoff", () => {
  it("elects a majority winner and records rounds", () => {
    // a:2 first prefs, b:2, c:1 -> c eliminated, its vote flows to a -> a wins
    const ballots = [
      b([{ optionId: "a", rank: 1 }, { optionId: "c", rank: 2 }]),
      b([{ optionId: "a", rank: 1 }, { optionId: "b", rank: 2 }]),
      b([{ optionId: "b", rank: 1 }, { optionId: "a", rank: 2 }]),
      b([{ optionId: "b", rank: 1 }, { optionId: "c", rank: 2 }]),
      b([{ optionId: "c", rank: 1 }, { optionId: "a", rank: 2 }]),
    ];
    const r = computeResult("RANKED", ballots, options, 1);
    expect(r.winners).toEqual(["a"]);
    expect(r.rounds && r.rounds.length).toBeGreaterThanOrEqual(2);
  });

  it("detects a perfect tie", () => {
    const ballots = [
      b([{ optionId: "a", rank: 1 }]),
      b([{ optionId: "b", rank: 1 }]),
    ];
    const r = computeResult("RANKED", [...ballots], [options[0], options[1]], 1);
    expect(r.tie).toBe(true);
  });

  it("supports multi-winner top-N", () => {
    const ballots = [
      b([{ optionId: "a", rank: 1 }, { optionId: "b", rank: 2 }]),
      b([{ optionId: "a", rank: 1 }, { optionId: "b", rank: 2 }]),
      b([{ optionId: "b", rank: 1 }, { optionId: "a", rank: 2 }]),
      b([{ optionId: "c", rank: 1 }]),
    ];
    const r = computeResult("RANKED", ballots, options, 2);
    expect(r.winners.length).toBe(2);
    expect(r.winners).toContain("a");
  });
});
