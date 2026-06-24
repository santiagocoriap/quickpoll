// Deterministic result-calculation engine.
//
// Supports: plurality (single), multiple-choice totals, approval totals,
// score voting, ranked-choice instant-runoff (single winner) and a sequential
// top-N extension for multi-winner ranked results. All counting is weight-aware.

import type { VotingMethod } from "./types";

export interface ResultBallot {
  weight: number;
  selections: { optionId: string; rank?: number | null; score?: number | null; approved?: boolean }[];
}

export interface OptionResult {
  optionId: string;
  label: string;
  // raw (unweighted) tally and weighted tally
  rawVotes: number;
  weightedVotes: number;
  // score-only fields
  totalScore?: number;
  averageScore?: number;
  scoreCount?: number;
}

export interface IrvRound {
  round: number;
  tallies: { optionId: string; label: string; votes: number }[];
  eliminated: string[];
  exhausted: number;
}

export interface SectionResult {
  method: VotingMethod;
  totalBallots: number;
  totalWeight: number;
  options: OptionResult[]; // sorted, best first
  winners: string[];
  tie: boolean;
  tiedForLastSeat: string[];
  rounds?: IrvRound[];
  explanation: string;
}

interface OptMeta {
  id: string;
  label: string;
}

function labelMap(options: OptMeta[]): Map<string, string> {
  return new Map(options.map((o) => [o.id, o.label]));
}

/**
 * Generic tie detection for "rank by a numeric value" methods.
 * Returns the definite winners and any options tied for the final seat.
 */
function detectWinnersByValue(
  ranked: { optionId: string; value: number }[],
  numWinners: number
): { winners: string[]; tie: boolean; tiedForLastSeat: string[] } {
  if (ranked.length === 0) return { winners: [], tie: false, tiedForLastSeat: [] };
  if (ranked.length <= numWinners) {
    // Everyone wins; still flag a tie only if values are all equal AND seats < options (not the case here).
    return { winners: ranked.map((r) => r.optionId), tie: false, tiedForLastSeat: [] };
  }
  const cutoff = ranked[numWinners - 1].value;
  const next = ranked[numWinners].value;
  if (cutoff === next) {
    const definite = ranked.filter((r) => r.value > cutoff).map((r) => r.optionId);
    const tied = ranked.filter((r) => r.value === cutoff).map((r) => r.optionId);
    return { winners: definite, tie: true, tiedForLastSeat: tied };
  }
  return { winners: ranked.slice(0, numWinners).map((r) => r.optionId), tie: false, tiedForLastSeat: [] };
}

function tallyCounts(
  ballots: ResultBallot[],
  options: OptMeta[]
): OptionResult[] {
  const raw = new Map<string, number>();
  const weighted = new Map<string, number>();
  for (const o of options) {
    raw.set(o.id, 0);
    weighted.set(o.id, 0);
  }
  for (const b of ballots) {
    for (const s of b.selections) {
      if (s.approved === false) continue;
      if (!raw.has(s.optionId)) continue;
      raw.set(s.optionId, (raw.get(s.optionId) ?? 0) + 1);
      weighted.set(s.optionId, (weighted.get(s.optionId) ?? 0) + b.weight);
    }
  }
  return options.map((o) => ({
    optionId: o.id,
    label: o.label,
    rawVotes: raw.get(o.id) ?? 0,
    weightedVotes: weighted.get(o.id) ?? 0,
  }));
}

function countResult(
  method: VotingMethod,
  ballots: ResultBallot[],
  options: OptMeta[],
  numWinners: number
): SectionResult {
  const results = tallyCounts(ballots, options).sort(
    (a, b) => b.weightedVotes - a.weightedVotes || a.label.localeCompare(b.label)
  );
  const { winners, tie, tiedForLastSeat } = detectWinnersByValue(
    results.map((r) => ({ optionId: r.optionId, value: r.weightedVotes })),
    numWinners
  );
  const totalWeight = ballots.reduce((s, b) => s + b.weight, 0);
  const top = results[0];
  const explanation = tie
    ? `There is a tie for the final winning slot between: ${tiedForLastSeat
        .map((id) => results.find((r) => r.optionId === id)?.label)
        .join(", ")}.`
    : top
      ? `Winner determined by ${method === "APPROVAL" ? "most approvals" : "highest vote total"}: ${results
          .filter((r) => winners.includes(r.optionId))
          .map((r) => `${r.label} (${r.weightedVotes})`)
          .join(", ")}.`
      : "No votes were cast.";

  return {
    method,
    totalBallots: ballots.length,
    totalWeight,
    options: results,
    winners,
    tie,
    tiedForLastSeat,
    explanation,
  };
}

function scoreResult(
  ballots: ResultBallot[],
  options: OptMeta[],
  numWinners: number
): SectionResult {
  const total = new Map<string, number>();
  const count = new Map<string, number>();
  const raw = new Map<string, number>();
  for (const o of options) {
    total.set(o.id, 0);
    count.set(o.id, 0);
    raw.set(o.id, 0);
  }
  for (const b of ballots) {
    for (const s of b.selections) {
      if (s.score == null || !total.has(s.optionId)) continue;
      total.set(s.optionId, (total.get(s.optionId) ?? 0) + s.score * b.weight);
      count.set(s.optionId, (count.get(s.optionId) ?? 0) + 1);
      raw.set(s.optionId, (raw.get(s.optionId) ?? 0) + s.score);
    }
  }
  const results: OptionResult[] = options
    .map((o) => {
      const c = count.get(o.id) ?? 0;
      const t = total.get(o.id) ?? 0;
      return {
        optionId: o.id,
        label: o.label,
        rawVotes: c,
        weightedVotes: t,
        totalScore: raw.get(o.id) ?? 0,
        scoreCount: c,
        averageScore: c === 0 ? 0 : Math.round((t / c) * 100) / 100,
      };
    })
    .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0) || a.label.localeCompare(b.label));

  const { winners, tie, tiedForLastSeat } = detectWinnersByValue(
    results.map((r) => ({ optionId: r.optionId, value: r.averageScore ?? 0 })),
    numWinners
  );

  return {
    method: "SCORE",
    totalBallots: ballots.length,
    totalWeight: ballots.reduce((s, b) => s + b.weight, 0),
    options: results,
    winners,
    tie,
    tiedForLastSeat,
    explanation: tie
      ? `Tie on average score between: ${tiedForLastSeat
          .map((id) => results.find((r) => r.optionId === id)?.label)
          .join(", ")}.`
      : `Winner(s) by highest average score: ${results
          .filter((r) => winners.includes(r.optionId))
          .map((r) => `${r.label} (avg ${r.averageScore})`)
          .join(", ")}.`,
  };
}

/** Single-winner instant-runoff with round-by-round elimination. */
function instantRunoff(
  ballots: ResultBallot[],
  options: OptMeta[]
): { winner: string | null; tie: boolean; tied: string[]; rounds: IrvRound[] } {
  const labels = labelMap(options);
  let active = new Set(options.map((o) => o.id));
  const rounds: IrvRound[] = [];

  // Pre-sort each ballot's selections by rank ascending.
  const ranked = ballots.map((b) => ({
    weight: b.weight,
    order: b.selections
      .filter((s) => s.rank != null)
      .sort((a, z) => (a.rank ?? 0) - (z.rank ?? 0))
      .map((s) => s.optionId),
  }));

  let roundNo = 0;
  while (active.size > 0) {
    roundNo++;
    const tally = new Map<string, number>();
    for (const id of active) tally.set(id, 0);
    let exhausted = 0;
    for (const b of ranked) {
      const top = b.order.find((id) => active.has(id));
      if (top == null) exhausted += b.weight;
      else tally.set(top, (tally.get(top) ?? 0) + b.weight);
    }
    const totalActive = [...tally.values()].reduce((a, c) => a + c, 0);
    const tallArr = [...tally.entries()].map(([optionId, votes]) => ({
      optionId,
      label: labels.get(optionId) ?? optionId,
      votes,
    }));

    const maxVotes = Math.max(...tallArr.map((t) => t.votes));
    const leaders = tallArr.filter((t) => t.votes === maxVotes);

    // Majority => winner.
    if (totalActive > 0 && maxVotes * 2 > totalActive) {
      rounds.push({ round: roundNo, tallies: tallArr, eliminated: [], exhausted });
      return { winner: leaders[0].optionId, tie: false, tied: [], rounds };
    }

    // Only one (or all-equal) candidate left.
    const minVotes = Math.min(...tallArr.map((t) => t.votes));
    if (active.size <= 1 || maxVotes === minVotes) {
      rounds.push({ round: roundNo, tallies: tallArr, eliminated: [], exhausted });
      if (active.size === 1) return { winner: [...active][0], tie: false, tied: [], rounds };
      // Everyone tied -> tie among leaders.
      return { winner: null, tie: true, tied: leaders.map((l) => l.optionId), rounds };
    }

    // Eliminate all candidates sharing the minimum tally.
    const losers = tallArr.filter((t) => t.votes === minVotes).map((t) => t.optionId);
    rounds.push({ round: roundNo, tallies: tallArr, eliminated: losers, exhausted });
    active = new Set([...active].filter((id) => !losers.includes(id)));
  }
  return { winner: null, tie: true, tied: [], rounds };
}

function rankedResult(
  ballots: ResultBallot[],
  options: OptMeta[],
  numWinners: number
): SectionResult {
  // First-preference tallies for the options table.
  const firstPref = new Map<string, number>();
  const rawFirst = new Map<string, number>();
  for (const o of options) {
    firstPref.set(o.id, 0);
    rawFirst.set(o.id, 0);
  }
  for (const b of ballots) {
    const ordered = b.selections
      .filter((s) => s.rank != null)
      .sort((a, z) => (a.rank ?? 0) - (z.rank ?? 0));
    if (ordered[0]) {
      firstPref.set(ordered[0].optionId, (firstPref.get(ordered[0].optionId) ?? 0) + b.weight);
      rawFirst.set(ordered[0].optionId, (rawFirst.get(ordered[0].optionId) ?? 0) + 1);
    }
  }
  const optionResults: OptionResult[] = options
    .map((o) => ({
      optionId: o.id,
      label: o.label,
      rawVotes: rawFirst.get(o.id) ?? 0,
      weightedVotes: firstPref.get(o.id) ?? 0,
    }))
    .sort((a, b) => b.weightedVotes - a.weightedVotes || a.label.localeCompare(b.label));

  if (numWinners <= 1) {
    const irv = instantRunoff(ballots, options);
    return {
      method: "RANKED",
      totalBallots: ballots.length,
      totalWeight: ballots.reduce((s, b) => s + b.weight, 0),
      options: optionResults,
      winners: irv.winner ? [irv.winner] : [],
      tie: irv.tie,
      tiedForLastSeat: irv.tied,
      rounds: irv.rounds,
      explanation: irv.tie
        ? `Instant-runoff ended in a tie between ${irv.tied
            .map((id) => options.find((o) => o.id === id)?.label)
            .join(", ")}.`
        : `Instant-runoff winner: ${options.find((o) => o.id === irv.winner)?.label}. ` +
          `Resolved over ${irv.rounds.length} round(s) of elimination.`,
    };
  }

  // Multi-winner: sequential IRV (extract one winner at a time).
  const winners: string[] = [];
  let pool = options.slice();
  let working = ballots;
  let lastRounds: IrvRound[] = [];
  let tie = false;
  let tied: string[] = [];
  for (let i = 0; i < numWinners && pool.length > 0; i++) {
    const irv = instantRunoff(working, pool);
    lastRounds = irv.rounds;
    if (irv.winner) {
      winners.push(irv.winner);
      pool = pool.filter((o) => o.id !== irv.winner);
      working = working.map((b) => ({
        weight: b.weight,
        selections: b.selections.filter((s) => s.optionId !== irv.winner),
      }));
    } else {
      tie = true;
      tied = irv.tied;
      break;
    }
  }
  return {
    method: "RANKED",
    totalBallots: ballots.length,
    totalWeight: ballots.reduce((s, b) => s + b.weight, 0),
    options: optionResults,
    winners,
    tie,
    tiedForLastSeat: tied,
    rounds: lastRounds,
    explanation: tie
      ? `Filled ${winners.length}/${numWinners} seats; remaining seat tied between ${tied
          .map((id) => options.find((o) => o.id === id)?.label)
          .join(", ")}.`
      : `Top-${numWinners} winners by sequential instant-runoff: ${winners
          .map((id) => options.find((o) => o.id === id)?.label)
          .join(", ")}.`,
  };
}

export function computeResult(
  method: VotingMethod,
  ballots: ResultBallot[],
  options: OptMeta[],
  numWinners = 1
): SectionResult {
  switch (method) {
    case "RANKED":
      return rankedResult(ballots, options, numWinners);
    case "SCORE":
      return scoreResult(ballots, options, numWinners);
    case "SINGLE":
      return countResult("SINGLE", ballots, options, 1);
    case "APPROVAL":
      return countResult("APPROVAL", ballots, options, numWinners);
    case "MULTIPLE":
    default:
      return countResult("MULTIPLE", ballots, options, numWinners);
  }
}
