import type { Card, Rank, Suit } from "./cards";
import { compareScores, evaluate } from "./evaluator";

export interface LearningOut {
  description: string;
  count: number;
}

export interface LearningData {
  handName: string;
  winPct: number;
  tiePct: number;
  outs: LearningOut[];
  potOddsNeeded: number;
  profitable: boolean;
  coachTip: string;
}

export interface ComputeLearningArgs {
  holeCards: Card[];
  community: Card[];
  numOpponents: number;
  pot: number;
  callAmount: number;
  iterations?: number;
}

const RANK_NAMES_PL: Record<number, string> = {
  2: "2s", 3: "3s", 4: "4s", 5: "5s", 6: "6s", 7: "7s", 8: "8s", 9: "9s", 10: "10s",
  11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};
const RANK_SHORT: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "T",
  11: "J", 12: "Q", 13: "K", 14: "A",
};

function unbiasedIndex(bound: number): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const max = Math.floor(0xffffffff / bound) * bound;
    const buf = new Uint32Array(1);
    do {
      cryptoObj.getRandomValues(buf);
    } while (buf[0] >= max);
    return buf[0] % bound;
  }
  return Math.floor(Math.random() * bound);
}

function remainingDeck(used: Card[]): Card[] {
  const usedSet = new Set<string>();
  for (const c of used) usedSet.add(`${c.suit}${c.rank}`);
  const out: Card[] = [];
  const suits: Suit[] = ["s", "h", "d", "c"];
  for (const s of suits) {
    for (let r = 2; r <= 14; r++) {
      const key = `${s}${r}`;
      if (!usedSet.has(key)) out.push({ suit: s, rank: r as Rank });
    }
  }
  return out;
}

function preflopName(hole: Card[]): string {
  const sorted = [...hole].sort((a, b) => b.rank - a.rank);
  const a = sorted[0];
  const b = sorted[1];
  if (a.rank === b.rank) return `Pocket ${RANK_NAMES_PL[a.rank]}`;
  const suited = a.suit === b.suit ? "suited" : "offsuit";
  return `${RANK_SHORT[a.rank]}${RANK_SHORT[b.rank]} ${suited}`;
}

function detectOuts(hole: Card[], community: Card[]): LearningOut[] {
  const outs: LearningOut[] = [];
  // Only meaningful on flop or turn
  if (community.length < 3 || community.length > 4) return outs;
  const all = [...hole, ...community];
  const made = evaluate(all).score.rank;

  // Flush draw — 4 of one suit (only if not already a flush+)
  if (made < 5) {
    const suitCount: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
    for (const c of all) suitCount[c.suit]++;
    for (const s of Object.keys(suitCount)) {
      if (suitCount[s] === 4) {
        outs.push({ description: "Flush", count: 9 });
        break;
      }
    }
  }

  // Rank counts
  const rankCount: Record<number, number> = {};
  for (const c of all) rankCount[c.rank] = (rankCount[c.rank] ?? 0) + 1;
  const ranks = Object.keys(rankCount).map(Number);
  const uniq = new Set<number>(ranks);

  // Straight draws — only if not already a straight+
  if (made < 4) {
    let foundOESD = false;
    for (let r = 2; r <= 11; r++) {
      if (uniq.has(r) && uniq.has(r + 1) && uniq.has(r + 2) && uniq.has(r + 3)) {
        const both = r > 2 && r + 3 < 14;
        if (both) {
          outs.push({ description: "Straight", count: 8 });
          foundOESD = true;
          break;
        }
      }
    }
    if (!foundOESD) {
      let foundGutshot = false;
      // Gutshot: 4 out of any 5 consecutive ranks
      for (let r = 2; r <= 10; r++) {
        let cnt = 0;
        for (let k = 0; k < 5; k++) if (uniq.has(r + k)) cnt++;
        if (cnt === 4) {
          outs.push({ description: "Straight", count: 4 });
          foundGutshot = true;
          break;
        }
      }
      // Wheel partial draw (A-2-3-4-5)
      if (!foundGutshot && uniq.has(14)) {
        const w = [2, 3, 4, 5].filter((r) => uniq.has(r)).length;
        if (w === 4) outs.push({ description: "Straight (wheel)", count: 4 });
      }
    }
  }

  // Pair → trips (have exactly one pair, not yet trips)
  const pairs = ranks.filter((r) => rankCount[r] === 2);
  const trips = ranks.filter((r) => rankCount[r] >= 3).length;
  if (made < 3 && pairs.length === 1 && trips === 0) {
    outs.push({ description: "Trips", count: 2 });
  }
  // Two pair → full house
  if (made < 6 && pairs.length >= 2 && trips === 0) {
    outs.push({ description: "Full House", count: 4 });
  }

  return outs;
}

function coachTipText(equity: number, profitable: boolean, hasCall: boolean, totalOuts: number): string {
  if (!hasCall) {
    if (equity >= 70) return "Strong hand — bet for value";
    if (equity >= 50) return "Decent equity — a small bet keeps control";
    if (totalOuts > 0) return "Drawing — checking is fine here";
    return "Weak hand — check and reassess";
  }
  if (equity >= 70) return "Strong hand — call or raise for value";
  if (profitable && equity >= 50) return "Ahead and getting odds — call or raise";
  if (profitable) return "Pot odds favor a call";
  if (totalOuts >= 8) return "Strong draw — borderline call";
  return "Unprofitable — folding is usually best";
}

export function computeLearningData(args: ComputeLearningArgs): LearningData {
  const { holeCards, community, numOpponents, pot, callAmount } = args;
  // Spec mandates a minimum of 1000 Monte Carlo iterations.
  const iterations = Math.max(1000, args.iterations ?? 1000);

  const handName = community.length === 0
    ? preflopName(holeCards)
    : evaluate([...holeCards, ...community]).name;

  const outs = detectOuts(holeCards, community);

  const potOddsNeeded = callAmount > 0 ? (callAmount / (pot + callAmount)) * 100 : 0;

  let wins = 0;
  let ties = 0;
  let losses = 0;

  if (numOpponents <= 0) {
    wins = iterations;
  } else {
    const baseRemaining = remainingDeck([...holeCards, ...community]);
    const cardsToCommunity = 5 - community.length;
    const draws = numOpponents * 2 + cardsToCommunity;
    if (baseRemaining.length >= draws) {
      const work = baseRemaining.slice();
      for (let it = 0; it < iterations; it++) {
        // Partial Fisher-Yates: only need first `draws` indices randomized
        for (let i = 0; i < draws; i++) {
          const j = i + unbiasedIndex(work.length - i);
          const tmp = work[i];
          work[i] = work[j];
          work[j] = tmp;
        }
        const completedCommunity: Card[] = community.slice();
        for (let k = 0; k < cardsToCommunity; k++) {
          completedCommunity.push(work[numOpponents * 2 + k]);
        }
        const my = evaluate([...holeCards, ...completedCommunity]).score;
        let outcome: 1 | 0 | -1 = 1; // win until proven otherwise
        for (let p = 0; p < numOpponents; p++) {
          const oppHole = [work[p * 2], work[p * 2 + 1]];
          const opp = evaluate([...oppHole, ...completedCommunity]).score;
          const cmp = compareScores(my, opp);
          if (cmp < 0) {
            outcome = -1;
            break;
          }
          if (cmp === 0) outcome = 0;
        }
        if (outcome === 1) wins++;
        else if (outcome === 0) ties++;
        else losses++;
      }
    }
  }

  const total = wins + ties + losses || 1;
  const winPct = (wins / total) * 100;
  const tiePct = (ties / total) * 100;
  const equity = winPct + tiePct / 2;
  const profitable = callAmount > 0 ? equity >= potOddsNeeded : true;
  const totalOuts = outs.reduce((sum, o) => sum + o.count, 0);
  const coachTip = coachTipText(equity, profitable, callAmount > 0, totalOuts);

  return {
    handName,
    winPct,
    tiePct,
    outs,
    potOddsNeeded,
    profitable,
    coachTip,
  };
}
