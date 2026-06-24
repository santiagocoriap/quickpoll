// Tie-break engine. Deterministic and auditable.
//
// For random tie-breaks we use a seeded PRNG so the outcome can be reproduced
// and audited from the visible seed.

import type { TieBreakStrategy } from "./types";

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic given a numeric seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically shuffle ids using the seed (Fisher–Yates). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface TieBreakContext {
  firstPlaceCounts?: Record<string, number>; // for MOST_FIRST_PLACE
  approvalCounts?: Record<string, number>; // for MOST_APPROVALS
  previousRoundCounts?: Record<string, number>; // for PREVIOUS_ROUND
  seed?: string; // for RANDOM_SEED
}

export interface TieBreakResolution {
  strategy: TieBreakStrategy;
  resolved: boolean; // true if a single winner is determined automatically
  winner?: string;
  orderedRemaining?: string[]; // ranking of tied options, best first (when applicable)
  needsRunoff?: boolean;
  needsManual?: boolean;
  keepTie?: boolean;
  note: string;
}

function rankByCounts(tied: string[], counts: Record<string, number>): {
  ordered: string[];
  winner?: string;
  stillTied: string[];
} {
  const ordered = tied
    .slice()
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const topVal = counts[ordered[0]] ?? 0;
  const stillTied = ordered.filter((id) => (counts[id] ?? 0) === topVal);
  return { ordered, winner: stillTied.length === 1 ? ordered[0] : undefined, stillTied };
}

export function resolveTieBreak(
  strategy: TieBreakStrategy,
  tied: string[],
  ctx: TieBreakContext = {}
): TieBreakResolution {
  if (tied.length <= 1) {
    return { strategy, resolved: true, winner: tied[0], note: "No tie to resolve." };
  }

  switch (strategy) {
    case "MANUAL":
      return { strategy, resolved: false, needsManual: true, note: "An admin must choose the winner." };

    case "RUNOFF":
    case "INSTANT_RUNOFF":
      return {
        strategy,
        resolved: false,
        needsRunoff: true,
        note: "Create a runoff phase from the tied options.",
      };

    case "KEEP_TIE":
      return { strategy, resolved: true, keepTie: true, orderedRemaining: tied, note: "Tie is kept; all tied options share the slot." };

    case "MOST_FIRST_PLACE": {
      const { ordered, winner } = rankByCounts(tied, ctx.firstPlaceCounts ?? {});
      return winner
        ? { strategy, resolved: true, winner, orderedRemaining: ordered, note: `Resolved by most first-place rankings.` }
        : { strategy, resolved: false, needsManual: true, orderedRemaining: ordered, note: `Still tied on first-place rankings; manual decision needed.` };
    }

    case "MOST_APPROVALS": {
      const { ordered, winner } = rankByCounts(tied, ctx.approvalCounts ?? {});
      return winner
        ? { strategy, resolved: true, winner, orderedRemaining: ordered, note: `Resolved by most total approvals.` }
        : { strategy, resolved: false, needsManual: true, orderedRemaining: ordered, note: `Still tied on approvals; manual decision needed.` };
    }

    case "PREVIOUS_ROUND": {
      const { ordered, winner } = rankByCounts(tied, ctx.previousRoundCounts ?? {});
      return winner
        ? { strategy, resolved: true, winner, orderedRemaining: ordered, note: `Resolved by previous-round performance.` }
        : { strategy, resolved: false, needsManual: true, orderedRemaining: ordered, note: `Still tied on previous round; manual decision needed.` };
    }

    case "RANDOM_SEED": {
      const seed = ctx.seed ?? "pollforge";
      const shuffled = seededShuffle(tied, seed);
      return {
        strategy,
        resolved: true,
        winner: shuffled[0],
        orderedRemaining: shuffled,
        note: `Resolved by random draw using visible seed "${seed}".`,
      };
    }

    default:
      return { strategy, resolved: false, needsManual: true, note: "Unknown strategy; manual decision needed." };
  }
}
