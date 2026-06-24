import type { SectionConfig, GroupInput } from "../src/lib/rules/types";

export const regularGroup: GroupInput = { id: "g-regular", name: "Regular Voter", priority: 0 };
export const championGroup: GroupInput = { id: "g-champion", name: "Previous Champion", priority: 10 };
export const stewardGroup: GroupInput = { id: "g-steward", name: "Steward", priority: 20 };

export function makeSection(overrides: Partial<SectionConfig> = {}): SectionConfig {
  return {
    id: "sec-tracks",
    method: "MULTIPLE",
    minSelections: 0,
    maxSelections: 3,
    exactSelections: null,
    minRanked: null,
    maxRanked: null,
    requireFullRank: false,
    scoreMin: 0,
    scoreMax: 5,
    allowSameScore: true,
    defaultWeight: 1,
    conflictStrategy: "HIGHEST",
    numWinners: 1,
    options: [
      { id: "o1", label: "Monza" },
      { id: "o2", label: "Spa" },
      { id: "o3", label: "Silverstone" },
      { id: "o4", label: "Suzuka" },
      { id: "o5", label: "Bathurst" },
    ],
    groupLimits: [
      { groupId: "g-regular", minSelections: null, maxSelections: 3, exactSelections: null, voteWeight: 1, canVote: true },
      { groupId: "g-champion", minSelections: null, maxSelections: 4, exactSelections: null, voteWeight: 1, canVote: true },
    ],
    optionGroupRules: [],
    ...overrides,
  };
}
