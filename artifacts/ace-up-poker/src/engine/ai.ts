import type { Card } from "./cards";
import { evaluate } from "./evaluator";
import { legalActions, type ActionInput, type PokerState } from "./poker";

// Hand strength estimator (0..1).
// Preflop: a Chen-formula-like score normalized.
// Postflop: Monte Carlo equity vs N random opponents over a sample of trials.
export function handStrength(
  hole: Card[],
  community: Card[],
  numOpponents: number,
): number {
  if (community.length === 0) {
    return preflopStrength(hole);
  }
  return monteCarloEquity(hole, community, numOpponents);
}

function preflopStrength(hole: Card[]): number {
  if (hole.length !== 2) return 0;
  const [a, b] = hole;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const suited = a.suit === b.suit;
  const pair = a.rank === b.rank;

  // Chen formula
  let score: number;
  const hPts: Record<number, number> = { 14: 10, 13: 8, 12: 7, 11: 6 };
  score = hPts[high] ?? high / 2;

  if (pair) {
    score = Math.max(5, score * 2);
    if (high === 5) score = 6;
  }
  if (suited) score += 2;
  const gap = high - low - 1;
  if (!pair) {
    if (gap === 0) {
      // connectors
      if (high < 12) score += 1;
    } else if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && high < 12) score += 1;
  }
  // Normalize: Chen typically -1..20, AA=20, 72o≈-1
  const normalized = Math.max(0, Math.min(1, (score + 1) / 21));
  return normalized;
}

function monteCarloEquity(hole: Card[], community: Card[], numOpponents: number): number {
  const trials = numOpponents <= 2 ? 250 : numOpponents <= 4 ? 180 : 120;
  const used = new Set<string>();
  const key = (c: Card) => c.suit + c.rank;
  for (const c of [...hole, ...community]) used.add(key(c));

  // Build remaining deck
  const remaining: Card[] = [];
  const SUITS: Card["suit"][] = ["s", "h", "d", "c"];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) {
      const c = { suit: s, rank: r as Card["rank"] };
      if (!used.has(key(c))) remaining.push(c);
    }
  }

  let wins = 0;
  let ties = 0;

  for (let t = 0; t < trials; t++) {
    // shuffle remaining (Fisher-Yates on a copy)
    const deck = remaining.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let p = 0;
    // Deal to opponents
    const oppHands: Card[][] = [];
    for (let o = 0; o < numOpponents; o++) {
      oppHands.push([deck[p++], deck[p++]]);
    }
    // Complete board
    const board = community.slice();
    while (board.length < 5) board.push(deck[p++]);

    const myBest = evaluate([...hole, ...board]).score;
    let bestOpp = evaluate([...oppHands[0], ...board]).score;
    for (let i = 1; i < oppHands.length; i++) {
      const sc = evaluate([...oppHands[i], ...board]).score;
      if (compare(sc, bestOpp) > 0) bestOpp = sc;
    }
    const cmp = compare(myBest, bestOpp);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
  }
  return (wins + ties / 2) / trials;
}

function compare(a: { rank: number; tiebreakers: number[] }, b: { rank: number; tiebreakers: number[] }) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const d = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface BotProfile {
  aggression: number; // 0..1 — likelihood to raise on strong hands
  bluffRate: number; // 0..1 — chance to bluff with weak hand
  tightness: number; // 0..1 — fold threshold
}

const PROFILES: BotProfile[] = [
  { aggression: 0.5, bluffRate: 0.06, tightness: 0.4 },
  { aggression: 0.3, bluffRate: 0.02, tightness: 0.55 }, // tight
  { aggression: 0.7, bluffRate: 0.12, tightness: 0.3 },  // loose-aggressive
  { aggression: 0.55, bluffRate: 0.08, tightness: 0.45 },
  { aggression: 0.4, bluffRate: 0.04, tightness: 0.5 },
  { aggression: 0.65, bluffRate: 0.1, tightness: 0.35 },
  { aggression: 0.45, bluffRate: 0.05, tightness: 0.5 },
  { aggression: 0.6, bluffRate: 0.07, tightness: 0.4 },
];

export function profileFor(playerId: number): BotProfile {
  return PROFILES[(playerId - 1) % PROFILES.length];
}

// Decide bot action.
export function botDecide(state: PokerState, playerId: number): ActionInput {
  const player = state.players.find((p) => p.id === playerId)!;
  const opts = legalActions(state, playerId);
  const profile = profileFor(playerId);

  const oppCount = state.players.filter(
    (p) => p.id !== playerId && !p.folded && !p.sittingOut
  ).length;

  const equity = handStrength(player.holeCards, state.community, Math.max(1, oppCount));
  const callAmount = opts.callAmount;
  const potOdds = callAmount > 0 ? callAmount / (state.pot + callAmount) : 0;

  // Bluff occasionally on later streets when checked-to
  const canBluff = opts.canRaise && callAmount === 0 && state.community.length >= 3;
  const bluffNow = canBluff && Math.random() < profile.bluffRate;

  // Strong hand thresholds adjusted by aggression
  const strongThr = 0.72 - profile.aggression * 0.1; // raise/value bet
  const okThr = Math.max(0.4, profile.tightness);    // call/check
  const foldThr = profile.tightness * 0.6;

  // Decision tree
  if (equity >= strongThr || bluffNow) {
    // Raise / bet
    if (opts.canRaise) {
      let target = opts.minRaiseTo;
      // Sometimes overbet
      const sizing = 0.5 + Math.random() * 1.0; // 0.5x..1.5x pot
      const potRaise = Math.floor(state.pot * sizing) + state.currentBet;
      target = Math.max(target, Math.min(opts.maxRaiseTo, potRaise));
      // Strong hands occasionally shove
      if (equity > 0.85 && Math.random() < 0.25) target = opts.maxRaiseTo;
      return { type: "raise", raiseTo: target };
    }
    if (opts.canCall) return { type: "call" };
    if (opts.canCheck) return { type: "check" };
    return { type: "fold" };
  }

  if (callAmount === 0) {
    // Free to see — almost always check
    if (opts.canCheck) return { type: "check" };
  }

  // Pot odds based call decision
  if (equity >= okThr || equity > potOdds + 0.05) {
    if (opts.canCall) return { type: "call" };
    if (opts.canCheck) return { type: "check" };
  }

  // Weak hand
  if (callAmount === 0 && opts.canCheck) return { type: "check" };
  if (equity < foldThr || callAmount > player.chips * 0.25) return { type: "fold" };
  if (opts.canCall && callAmount <= state.bigBlind * 2) return { type: "call" };
  return { type: "fold" };
}
