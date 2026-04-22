import type { Card, Rank } from "./cards";

export interface HandScore {
  rank: number; // 0=high card .. 9=royal flush
  tiebreakers: number[];
  name: string;
}

export interface BestHand {
  cards: Card[];
  score: HandScore;
  name: string;
}

const HAND_NAMES = [
  "High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight",
  "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush",
];

// Score 5 specific cards
function scoreFive(cards: Card[]): HandScore {
  const sorted = cards.slice().sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = checkStraight(ranks);
  const isStraight = straightHigh > 0;

  const counts: Record<number, number> = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const grouped = Object.entries(counts)
    .map(([r, c]) => ({ rank: Number(r) as Rank, count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const countVals = grouped.map((g) => g.count);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 9, tiebreakers: [14], name: HAND_NAMES[9] };
    return { rank: 8, tiebreakers: [straightHigh], name: HAND_NAMES[8] };
  }
  if (countVals[0] === 4) {
    return {
      rank: 7,
      tiebreakers: [grouped[0].rank, grouped[1].rank],
      name: HAND_NAMES[7],
    };
  }
  if (countVals[0] === 3 && countVals[1] === 2) {
    return {
      rank: 6,
      tiebreakers: [grouped[0].rank, grouped[1].rank],
      name: HAND_NAMES[6],
    };
  }
  if (isFlush) {
    return { rank: 5, tiebreakers: ranks, name: HAND_NAMES[5] };
  }
  if (isStraight) {
    return { rank: 4, tiebreakers: [straightHigh], name: HAND_NAMES[4] };
  }
  if (countVals[0] === 3) {
    const kickers = grouped.slice(1).map((g) => g.rank);
    return { rank: 3, tiebreakers: [grouped[0].rank, ...kickers], name: HAND_NAMES[3] };
  }
  if (countVals[0] === 2 && countVals[1] === 2) {
    const pairs = [grouped[0].rank, grouped[1].rank].sort((a, b) => b - a);
    const kicker = grouped[2].rank;
    return { rank: 2, tiebreakers: [...pairs, kicker], name: HAND_NAMES[2] };
  }
  if (countVals[0] === 2) {
    const kickers = grouped.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return { rank: 1, tiebreakers: [grouped[0].rank, ...kickers], name: HAND_NAMES[1] };
  }
  return { rank: 0, tiebreakers: ranks, name: HAND_NAMES[0] };
}

// returns the high card of the straight (5 for the wheel A-2-3-4-5), or 0 if none
function checkStraight(sortedDescRanks: number[]): number {
  const unique = Array.from(new Set(sortedDescRanks)).sort((a, b) => b - a);
  if (unique.length < 5) return 0;
  // standard straight
  for (let i = 0; i + 4 < unique.length; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  // wheel
  if (
    unique.includes(14) &&
    unique.includes(5) &&
    unique.includes(4) &&
    unique.includes(3) &&
    unique.includes(2)
  ) {
    return 5;
  }
  return 0;
}

export function compareScores(a: HandScore, b: HandScore): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Best 5-card hand from 5..7 cards
export function evaluate(cards: Card[]): BestHand {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate");
  }
  const combos = combinations(cards, 5);
  let best: BestHand | null = null;
  for (const combo of combos) {
    const score = scoreFive(combo);
    if (!best || compareScores(score, best.score) > 0) {
      best = { cards: combo, score, name: score.name };
    }
  }
  return best!;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return result;
}
