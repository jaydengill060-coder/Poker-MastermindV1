import { freshDeck, type Card } from "./cards";
import { compareScores, evaluate, type BestHand } from "./evaluator";

export type Phase = "idle" | "preflop" | "flop" | "turn" | "river" | "showdown" | "handover";
export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  chips: number;
  holeCards: Card[];
  bet: number; // chips put in this betting round
  totalCommitted: number; // total chips committed this hand (for side-pot calc)
  folded: boolean;
  allIn: boolean;
  hasActed: boolean; // has acted at least once this betting round
  sittingOut: boolean; // out of chips
}

export interface ActionLogEntry {
  text: string;
  ts: number;
}

export interface ShowdownResult {
  potIndex: number;
  potAmount: number;
  winners: { playerId: number; name: string; share: number; bestHand?: BestHand }[];
  evaluations: { playerId: number; name: string; bestHand: BestHand }[];
}

export interface PokerState {
  players: Player[];
  deck: Card[];
  community: Card[];
  pot: number; // total in the middle (sum of all bets/totalCommitted)
  currentBet: number; // current bet level for this round
  lastRaiseSize: number; // for min-raise enforcement
  smallBlind: number;
  bigBlind: number;
  dealerIdx: number;
  toActIdx: number; // -1 when no action expected
  phase: Phase;
  log: ActionLogEntry[];
  handNumber: number;
  showdownResults?: ShowdownResult[];
  lastWinnerSummary?: string;
  // For min-raise enforcement: a player who only completes a short all-in does
  // NOT reopen action — track who made the last full raise.
  lastFullRaiserId: number | null;
}

export interface NewGameOpts {
  numOpponents: number; // 1..8
  startingChips: number;
  smallBlind: number;
  humanName?: string;
}

const BOT_NAMES = [
  "Slick", "Vegas", "Doc Holdem", "River Rat", "Bluff Master",
  "Calamity", "Cool Hand", "Lucky Lou",
];

export function newGame(opts: NewGameOpts): PokerState {
  const n = Math.max(1, Math.min(8, opts.numOpponents));
  const players: Player[] = [];
  players.push(makePlayer(0, opts.humanName?.trim() || "You", true, opts.startingChips));
  for (let i = 0; i < n; i++) {
    players.push(makePlayer(i + 1, BOT_NAMES[i], false, opts.startingChips));
  }
  return {
    players,
    deck: [],
    community: [],
    pot: 0,
    currentBet: 0,
    lastRaiseSize: opts.smallBlind * 2,
    smallBlind: opts.smallBlind,
    bigBlind: opts.smallBlind * 2,
    dealerIdx: 0,
    toActIdx: -1,
    phase: "idle",
    log: [{ text: `Game started: ${players.length} players, ${opts.startingChips} chips each.`, ts: Date.now() }],
    handNumber: 0,
    lastFullRaiserId: null,
  };
}

function makePlayer(id: number, name: string, isHuman: boolean, chips: number): Player {
  return {
    id, name, isHuman, chips,
    holeCards: [], bet: 0, totalCommitted: 0,
    folded: false, allIn: false, hasActed: false, sittingOut: chips <= 0,
  };
}

function pushLog(state: PokerState, text: string) {
  state.log.push({ text, ts: Date.now() });
  if (state.log.length > 200) state.log.shift();
}

export function startHand(state: PokerState): PokerState {
  const s = cloneState(state);
  // remove sitting-out players who have 0 chips, but keep them seated as "out"
  for (const p of s.players) {
    p.holeCards = [];
    p.bet = 0;
    p.totalCommitted = 0;
    p.folded = false;
    p.allIn = false;
    p.hasActed = false;
    if (p.chips <= 0) {
      p.sittingOut = true;
      p.folded = true; // treat as out of this hand
    } else {
      p.sittingOut = false;
    }
  }

  const inHand = s.players.filter((p) => !p.sittingOut);
  if (inHand.length < 2) {
    s.phase = "handover";
    s.lastWinnerSummary = "Game over — not enough players with chips.";
    pushLog(s, s.lastWinnerSummary);
    return s;
  }

  s.deck = freshDeck();
  s.community = [];
  s.pot = 0;
  s.currentBet = 0;
  s.lastRaiseSize = s.bigBlind;
  s.handNumber += 1;
  s.showdownResults = undefined;
  s.lastWinnerSummary = undefined;
  s.lastFullRaiserId = null;

  // Advance dealer to next non-sitting-out player
  s.dealerIdx = nextSeatedFrom(s, s.dealerIdx);

  // Post blinds
  let sbIdx: number;
  let bbIdx: number;
  if (inHand.length === 2) {
    // Heads-up: dealer is small blind, other is big blind
    sbIdx = s.dealerIdx;
    bbIdx = nextSeatedFrom(s, s.dealerIdx);
  } else {
    sbIdx = nextSeatedFrom(s, s.dealerIdx);
    bbIdx = nextSeatedFrom(s, sbIdx);
  }
  postBlind(s, sbIdx, s.smallBlind, "small blind");
  postBlind(s, bbIdx, s.bigBlind, "big blind");
  s.currentBet = s.bigBlind;

  // Deal hole cards (one at a time, twice — proper dealing order)
  for (let r = 0; r < 2; r++) {
    let idx = nextSeatedFrom(s, s.dealerIdx);
    for (let i = 0; i < inHand.length; i++) {
      s.players[idx].holeCards.push(s.deck.pop()!);
      idx = nextSeatedFrom(s, idx);
    }
  }

  // First to act preflop = next seated after BB
  s.toActIdx = nextActiveAfter(s, bbIdx);
  s.phase = "preflop";
  pushLog(s, `--- Hand #${s.handNumber} --- Dealer: ${s.players[s.dealerIdx].name}`);

  // Edge case: if BB doesn't have chips left and only one player can act, etc.
  // The action loop will handle.
  return maybeAdvanceIfRoundComplete(s);
}

function postBlind(s: PokerState, idx: number, amount: number, label: string) {
  const p = s.players[idx];
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.bet += actual;
  p.totalCommitted += actual;
  s.pot += actual;
  if (p.chips === 0) p.allIn = true;
  pushLog(s, `${p.name} posts ${label} (${actual})`);
}

// next seated (chips > 0 OR already dealt in) player index, wrapping
function nextSeatedFrom(s: PokerState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!s.players[idx].sittingOut) return idx;
  }
  return from;
}

// next player who can still act this round (not folded, not all-in)
function nextActiveAfter(s: PokerState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (!p.sittingOut && !p.folded && !p.allIn) return idx;
  }
  return -1;
}

// next player who is in the hand (not folded), even if all-in (for showdown order)
function firstInHandAfter(s: PokerState, from: number): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (!p.sittingOut && !p.folded) return idx;
  }
  return -1;
}

export function legalActions(s: PokerState, playerId: number): {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
} {
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p || p.folded || p.allIn || s.toActIdx < 0 || s.players[s.toActIdx].id !== playerId) {
    return {
      canFold: false, canCheck: false, canCall: false, callAmount: 0,
      canRaise: false, minRaiseTo: 0, maxRaiseTo: 0,
    };
  }
  const callAmount = Math.max(0, s.currentBet - p.bet);
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && p.chips > 0;
  const minRaiseTo = Math.min(p.chips + p.bet, s.currentBet + s.lastRaiseSize);
  const maxRaiseTo = p.chips + p.bet;
  const canRaise = p.chips > callAmount; // must have chips beyond the call
  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount: Math.min(callAmount, p.chips),
    canRaise,
    minRaiseTo,
    maxRaiseTo,
  };
}

export interface ActionInput {
  type: ActionType;
  raiseTo?: number; // for "bet"/"raise" — the total bet level after raising
}

// Apply an action for the current to-act player. Returns new state.
export function applyAction(state: PokerState, action: ActionInput): PokerState {
  const s = cloneState(state);
  if (s.toActIdx < 0) return s;
  const p = s.players[s.toActIdx];
  if (p.folded || p.allIn) return s;

  const callAmount = Math.max(0, s.currentBet - p.bet);

  switch (action.type) {
    case "fold":
      p.folded = true;
      pushLog(s, `${p.name} folds`);
      break;

    case "check":
      if (callAmount > 0) {
        // illegal — coerce to call
        return applyAction(state, { type: "call" });
      }
      pushLog(s, `${p.name} checks`);
      break;

    case "call": {
      const pay = Math.min(callAmount, p.chips);
      p.chips -= pay;
      p.bet += pay;
      p.totalCommitted += pay;
      s.pot += pay;
      if (p.chips === 0) p.allIn = true;
      pushLog(s, `${p.name} calls ${pay}${p.allIn ? " (all-in)" : ""}`);
      break;
    }

    case "bet":
    case "raise":
    case "allin": {
      let raiseTo: number;
      if (action.type === "allin") {
        raiseTo = p.chips + p.bet;
      } else {
        raiseTo = action.raiseTo ?? s.currentBet + s.lastRaiseSize;
      }
      // cap to player's stack
      raiseTo = Math.min(raiseTo, p.chips + p.bet);
      const totalDelta = raiseTo - p.bet;
      if (totalDelta <= 0) {
        // nothing to add — fall back to check/call
        return applyAction(state, { type: callAmount > 0 ? "call" : "check" });
      }
      const raiseSize = raiseTo - s.currentBet; // amount above prior bet
      const isFullRaise = raiseSize >= s.lastRaiseSize;
      p.chips -= totalDelta;
      p.bet += totalDelta;
      p.totalCommitted += totalDelta;
      s.pot += totalDelta;
      if (p.chips === 0) p.allIn = true;

      const wasOpen = s.currentBet === 0;
      if (raiseTo > s.currentBet) {
        if (isFullRaise) {
          s.lastRaiseSize = raiseSize;
          s.lastFullRaiserId = p.id;
          // Reopen action: every other player needs to act again
          for (const other of s.players) {
            if (other.id !== p.id && !other.folded && !other.allIn) other.hasActed = false;
          }
        } else {
          // Short all-in: does NOT reopen action for players already matched.
          // Only players who haven't yet matched the new amount need to act.
          // Simplest correct rule: do not reset hasActed of already-acted players.
        }
        s.currentBet = raiseTo;
      }
      const verb = wasOpen ? "bets" : "raises to";
      pushLog(s, `${p.name} ${verb} ${raiseTo}${p.allIn ? " (all-in)" : ""}`);
      break;
    }
  }

  p.hasActed = true;

  // Check if only one non-folded player remains -> award pot
  const nonFolded = s.players.filter((pl) => !pl.folded && !pl.sittingOut);
  if (nonFolded.length === 1) {
    return awardUncontested(s, nonFolded[0]);
  }

  // Check if betting round is complete
  return maybeAdvanceIfRoundComplete(s);
}

function maybeAdvanceIfRoundComplete(s: PokerState): PokerState {
  // Round is complete when:
  // - All non-folded, non-allin players have hasActed==true AND bet==currentBet
  // - OR only 0 or 1 players still able to act
  const inHand = s.players.filter((p) => !p.folded && !p.sittingOut);
  const ableToAct = inHand.filter((p) => !p.allIn);

  const allMatched = ableToAct.every((p) => p.bet === s.currentBet && p.hasActed);
  const noOneCanAct = ableToAct.length === 0;
  // If only one player can still act and everyone else is all-in or folded,
  // and that one player has matched, also advance.
  const onePlayerLeft = ableToAct.length === 1 && ableToAct[0].bet === s.currentBet && ableToAct[0].hasActed;

  if (allMatched || noOneCanAct || onePlayerLeft) {
    return advancePhase(s);
  }

  // Move to next active player
  s.toActIdx = nextActiveAfter(s, s.toActIdx);
  if (s.toActIdx < 0) return advancePhase(s);
  return s;
}

function advancePhase(s: PokerState): PokerState {
  // Reset bets for next round
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bigBlind;
  s.lastFullRaiserId = null;

  const order: Phase[] = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = order.indexOf(s.phase);
  const next = order[idx + 1] ?? "showdown";

  if (next === "flop") {
    // Burn one
    s.deck.pop();
    s.community.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
    pushLog(s, `--- FLOP --- ${s.community.slice(-3).map(c => c.suit + c.rank).join(" ")}`);
  } else if (next === "turn") {
    s.deck.pop();
    s.community.push(s.deck.pop()!);
    pushLog(s, `--- TURN ---`);
  } else if (next === "river") {
    s.deck.pop();
    s.community.push(s.deck.pop()!);
    pushLog(s, `--- RIVER ---`);
  }

  s.phase = next;

  if (next === "showdown") {
    return doShowdown(s);
  }

  // Determine first to act post-flop: first in-hand player after dealer
  const ableToAct = s.players.filter((p) => !p.folded && !p.sittingOut && !p.allIn);
  if (ableToAct.length <= 1) {
    // No more betting possible; deal remaining streets and go to showdown
    return advancePhase(s);
  }
  s.toActIdx = nextActiveAfter(s, s.dealerIdx);
  return s;
}

function awardUncontested(s: PokerState, winner: Player): PokerState {
  winner.chips += s.pot;
  pushLog(s, `${winner.name} wins ${s.pot} (everyone else folded)`);
  s.lastWinnerSummary = `${winner.name} wins ${s.pot}`;
  s.showdownResults = [{
    potIndex: 0,
    potAmount: s.pot,
    winners: [{ playerId: winner.id, name: winner.name, share: s.pot }],
    evaluations: [],
  }];
  s.pot = 0;
  s.toActIdx = -1;
  s.phase = "handover";
  return s;
}

function doShowdown(s: PokerState): PokerState {
  s.toActIdx = -1;

  const contenders = s.players.filter((p) => !p.folded && !p.sittingOut);

  // Compute side pots from totalCommitted
  const allCommits = s.players
    .filter((p) => p.totalCommitted > 0)
    .map((p) => ({ playerId: p.id, amount: p.totalCommitted, eligible: !p.folded }));

  const pots: { amount: number; eligibleIds: number[] }[] = [];
  // Sort distinct amounts ascending
  const distinct = Array.from(new Set(allCommits.map((c) => c.amount))).sort((a, b) => a - b);
  let prev = 0;
  for (const lvl of distinct) {
    const layer = lvl - prev;
    const contributors = allCommits.filter((c) => c.amount >= lvl);
    const amount = layer * contributors.length;
    if (amount <= 0) { prev = lvl; continue; }
    const eligibleIds = contributors.filter((c) => c.eligible).map((c) => c.playerId);
    if (eligibleIds.length > 0) {
      pots.push({ amount, eligibleIds });
    } else {
      // No eligible — return to last contributor (rare); just merge into next or keep
      pots.push({ amount, eligibleIds: contributors.map(c => c.playerId) });
    }
    prev = lvl;
  }

  // Evaluate each contender's best hand
  const evals = new Map<number, BestHand>();
  for (const p of contenders) {
    const all = [...p.holeCards, ...s.community];
    evals.set(p.id, evaluate(all));
  }

  const evaluationsList = contenders.map((p) => ({
    playerId: p.id,
    name: p.name,
    bestHand: evals.get(p.id)!,
  }));

  const results: ShowdownResult[] = [];
  pots.forEach((pot, idx) => {
    const eligibles = contenders.filter((c) => pot.eligibleIds.includes(c.id));
    if (eligibles.length === 0) return;
    let best = evals.get(eligibles[0].id)!;
    let winners = [eligibles[0]];
    for (let i = 1; i < eligibles.length; i++) {
      const sc = evals.get(eligibles[i].id)!;
      const cmp = compareScores(sc.score, best.score);
      if (cmp > 0) { best = sc; winners = [eligibles[i]]; }
      else if (cmp === 0) winners.push(eligibles[i]);
    }
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;
    const winnerEntries = winners.map((w, i) => {
      const amt = share + (i === 0 ? remainder : 0);
      const player = s.players.find((pl) => pl.id === w.id)!;
      player.chips += amt;
      return { playerId: w.id, name: w.name, share: amt, bestHand: evals.get(w.id) };
    });
    results.push({
      potIndex: idx,
      potAmount: pot.amount,
      winners: winnerEntries,
      evaluations: evaluationsList,
    });
    for (const w of winnerEntries) {
      pushLog(s, `${w.name} wins ${w.share} (${evals.get(w.playerId)?.name}) — ${pots.length > 1 ? `pot #${idx + 1}` : "main pot"}`);
    }
  });

  s.showdownResults = results;
  // Build a summary
  if (results.length > 0) {
    const main = results[0];
    s.lastWinnerSummary = main.winners
      .map((w) => `${w.name} wins ${w.share}${w.bestHand ? ` with ${w.bestHand.name}` : ""}`)
      .join(", ");
  }
  s.pot = 0;
  s.phase = "handover";
  return s;
}

function cloneState(s: PokerState): PokerState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, holeCards: p.holeCards.slice() })),
    deck: s.deck.slice(),
    community: s.community.slice(),
    log: s.log.slice(),
    showdownResults: s.showdownResults?.map((r) => ({
      ...r,
      winners: r.winners.slice(),
      evaluations: r.evaluations.slice(),
    })),
  };
}
