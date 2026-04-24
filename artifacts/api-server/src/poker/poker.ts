import { freshDeck, type Card } from "./cards";
import { compareScores, evaluate, type BestHand } from "./evaluator";

export type Phase = "idle" | "preflop" | "flop" | "turn" | "river" | "showdown" | "handover";
export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";
export type RakeMode = "blinds" | "ante";

export interface Player {
  id: string; // socket id or persistent player id
  seat: number;
  name: string;
  chips: number; // in cents
  buyIns: number;
  buyBacks: number;
  pendingBuyBack: boolean;
  handsPlayed: number;
  handsWon: number;
  holeCards: Card[];
  bet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  sittingOut: boolean;
  inHand: boolean; // dealt this hand
  disconnected: boolean;
}

export interface ActionLogEntry { text: string; ts: number; }

export interface ShowdownEval { playerId: string; name: string; bestHand: BestHand; }
export interface ShowdownResult {
  potIndex: number;
  potAmount: number;
  winners: { playerId: string; name: string; share: number; bestHand?: BestHand }[];
  evaluations: ShowdownEval[];
}

export interface AllInEvent { playerId: string; name: string; amount: number; ts: number; }

export interface HandReviewAction {
  type: ActionType;
  raiseTo?: number;
  amount: number; // chips that left the player's stack on this action
}

export interface HandReviewSnapshot {
  playerId: string;
  phase: Phase; // preflop | flop | turn | river when the decision was made
  community: Card[]; // copy of the board at decision time
  holeCards: Card[]; // copy of the player's hole cards at decision time
  potBefore: number; // pot size before this action
  callAmount: number; // amount the player needed to call (capped at chips)
  numOpponents: number; // opponents still in the hand with hole cards
  action: HandReviewAction;
}

export interface PokerState {
  players: Player[];
  community: Card[];
  pot: number;
  currentBet: number;
  lastRaiseSize: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  rakeMode: RakeMode;
  dealerSeat: number;
  toActSeat: number; // -1 when none
  phase: Phase;
  log: ActionLogEntry[];
  handNumber: number;
  showdownResults?: ShowdownResult[];
  lastWinnerSummary?: string;
  lastAllInEvent: AllInEvent | null;
  // Per-decision snapshots for the most recent hand. Reset at the start of
  // each new hand. Used by the post-hand "Hand Review" coach view.
  handReviewSnapshots: HandReviewSnapshot[];
  // Hidden from clients except their own:
  deck: Card[];
}

export interface RoomConfig {
  buyInCents: number;
  rakeMode: RakeMode;
  smallBlindCents: number; // used if rakeMode == "blinds"
  bigBlindCents: number;
  anteCents: number; // used if rakeMode == "ante"
}

export function newState(): PokerState {
  return {
    players: [],
    community: [],
    pot: 0,
    currentBet: 0,
    lastRaiseSize: 0,
    smallBlind: 0,
    bigBlind: 0,
    ante: 0,
    rakeMode: "blinds",
    dealerSeat: -1,
    toActSeat: -1,
    phase: "idle",
    log: [],
    handNumber: 0,
    lastAllInEvent: null,
    handReviewSnapshots: [],
    deck: [],
  };
}

export interface LivePot { amount: number; eligibleIds: string[]; }

// Computes main + side pot breakdown from the current totalCommitted of each
// player. Players who have folded are NOT eligible to win, but their chips
// still go into the appropriate layer.
export function computeLivePots(s: PokerState): LivePot[] {
  const commits = s.players
    .filter((p) => p.totalCommitted > 0)
    .map((p) => ({ playerId: p.id, amount: p.totalCommitted, eligible: p.inHand && !p.folded }));
  if (commits.length === 0) return [];
  const distinct = Array.from(new Set(commits.map((c) => c.amount))).sort((a, b) => a - b);
  const pots: LivePot[] = [];
  let prev = 0;
  for (const lvl of distinct) {
    const layer = lvl - prev;
    const contributors = commits.filter((c) => c.amount >= lvl);
    const amount = layer * contributors.length;
    if (amount > 0) {
      const eligibleIds = contributors.filter((c) => c.eligible).map((c) => c.playerId);
      pots.push({ amount, eligibleIds: eligibleIds.length > 0 ? eligibleIds : contributors.map((c) => c.playerId) });
    }
    prev = lvl;
  }
  return pots;
}

function pushLog(s: PokerState, text: string) {
  s.log.push({ text, ts: Date.now() });
  if (s.log.length > 200) s.log.shift();
}

function recordHandReview(
  s: PokerState,
  playerId: string,
  ctx: {
    phase: Phase;
    community: Card[];
    holeCards: Card[];
    potBefore: number;
    callAmount: number;
    numOpponents: number;
  },
  action: HandReviewAction,
): void {
  // Only record decisions made during a real betting round. Showdown/handover
  // never reach applyAction so this is mostly defensive.
  if (ctx.phase !== "preflop" && ctx.phase !== "flop" && ctx.phase !== "turn" && ctx.phase !== "river") return;
  s.handReviewSnapshots.push({
    playerId,
    phase: ctx.phase,
    community: ctx.community,
    holeCards: ctx.holeCards,
    potBefore: ctx.potBefore,
    callAmount: ctx.callAmount,
    numOpponents: ctx.numOpponents,
    action,
  });
}

export function addPlayer(s: PokerState, opts: { id: string; name: string; chips: number }): Player {
  const seat = s.players.length;
  const p: Player = {
    id: opts.id, seat, name: opts.name, chips: opts.chips,
    buyIns: 1, buyBacks: 0, pendingBuyBack: false,
    handsPlayed: 0, handsWon: 0,
    holeCards: [], bet: 0, totalCommitted: 0,
    folded: false, allIn: false, hasActed: false,
    sittingOut: false, inHand: false, disconnected: false,
  };
  s.players.push(p);
  pushLog(s, `${opts.name} joined the table`);
  return p;
}

export function removePlayer(s: PokerState, id: string): void {
  const p = s.players.find((pl) => pl.id === id);
  if (!p) return;
  pushLog(s, `${p.name} left the table`);
  s.players = s.players.filter((pl) => pl.id !== id);
  // re-seat
  s.players.forEach((pl, i) => (pl.seat = i));
}

export function restorePlayer(s: PokerState, id: string): Player | undefined {
  return s.players.find((pl) => pl.id === id);
}

export function startHand(s: PokerState, cfg: RoomConfig): void {
  s.smallBlind = cfg.smallBlindCents;
  s.bigBlind = cfg.bigBlindCents;
  s.ante = cfg.anteCents;
  s.rakeMode = cfg.rakeMode;

  for (const p of s.players) {
    p.holeCards = [];
    p.bet = 0;
    p.totalCommitted = 0;
    p.folded = false;
    p.allIn = false;
    p.hasActed = false;
    p.inHand = false;
    if (p.chips <= 0 || p.disconnected) {
      p.sittingOut = true;
    } else {
      p.sittingOut = false;
    }
  }

  const inHand = s.players.filter((p) => !p.sittingOut);
  if (inHand.length < 2) {
    s.phase = "handover";
    s.lastWinnerSummary = "Waiting for more players...";
    return;
  }

  s.deck = freshDeck();
  s.community = [];
  s.pot = 0;
  s.currentBet = 0;
  s.lastRaiseSize = Math.max(s.bigBlind, 50);
  s.handNumber += 1;
  s.showdownResults = undefined;
  s.lastWinnerSummary = undefined;
  s.lastAllInEvent = null;
  s.handReviewSnapshots = [];

  // Advance dealer (or initialize)
  if (s.dealerSeat < 0) s.dealerSeat = inHand[0].seat;
  else s.dealerSeat = nextOccupiedSeat(s, s.dealerSeat);

  for (const p of inHand) {
    p.inHand = true;
    p.handsPlayed += 1;
  }

  if (s.rakeMode === "ante") {
    // Each player posts ante
    for (const p of inHand) {
      const amt = Math.min(s.ante, p.chips);
      p.chips -= amt;
      p.totalCommitted += amt;
      s.pot += amt;
      if (p.chips === 0) p.allIn = true;
    }
    pushLog(s, `Antes posted (${formatCents(s.ante)} each)`);
    s.currentBet = 0;
    // First to act: left of dealer
    s.toActSeat = nextActiveAfter(s, s.dealerSeat);
  } else {
    // Blinds
    let sbSeat: number;
    let bbSeat: number;
    if (inHand.length === 2) {
      sbSeat = s.dealerSeat;
      bbSeat = nextSeated(s, s.dealerSeat);
    } else {
      sbSeat = nextSeated(s, s.dealerSeat);
      bbSeat = nextSeated(s, sbSeat);
    }
    postBlind(s, sbSeat, s.smallBlind, "small blind");
    postBlind(s, bbSeat, s.bigBlind, "big blind");
    s.currentBet = s.bigBlind;
    s.toActSeat = nextActiveAfter(s, bbSeat);
  }

  // Deal hole cards
  for (let r = 0; r < 2; r++) {
    let seat = nextSeated(s, s.dealerSeat);
    for (let i = 0; i < inHand.length; i++) {
      seatPlayer(s, seat).holeCards.push(s.deck.pop()!);
      seat = nextSeated(s, seat);
    }
  }

  s.phase = "preflop";
  pushLog(s, `--- Hand #${s.handNumber} --- Dealer: ${seatPlayer(s, s.dealerSeat).name}`);
  maybeAdvance(s);
}

function postBlind(s: PokerState, seat: number, amount: number, label: string) {
  const p = seatPlayer(s, seat);
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.bet += actual;
  p.totalCommitted += actual;
  s.pot += actual;
  if (p.chips === 0) p.allIn = true;
  pushLog(s, `${p.name} posts ${label} (${formatCents(actual)})`);
}

function seatPlayer(s: PokerState, seat: number): Player {
  return s.players.find((p) => p.seat === seat)!;
}

function nextSeated(s: PokerState, fromSeat: number): number {
  const seats = s.players.filter((p) => !p.sittingOut).map((p) => p.seat).sort((a, b) => a - b);
  if (seats.length === 0) return fromSeat;
  const greater = seats.find((sn) => sn > fromSeat);
  return greater !== undefined ? greater : seats[0];
}

function nextOccupiedSeat(s: PokerState, fromSeat: number): number {
  const seats = s.players.filter((p) => p.chips > 0).map((p) => p.seat).sort((a, b) => a - b);
  if (seats.length === 0) return fromSeat;
  const greater = seats.find((sn) => sn > fromSeat);
  return greater !== undefined ? greater : seats[0];
}

function nextActiveAfter(s: PokerState, fromSeat: number): number {
  const eligible = s.players
    .filter((p) => !p.sittingOut && p.inHand && !p.folded && !p.allIn)
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  if (eligible.length === 0) return -1;
  const greater = eligible.find((sn) => sn > fromSeat);
  return greater !== undefined ? greater : eligible[0];
}

export function legalActions(s: PokerState, playerId: string) {
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p || p.folded || p.allIn || s.toActSeat < 0 || seatPlayer(s, s.toActSeat).id !== playerId) {
    return { canFold: false, canCheck: false, canCall: false, callAmount: 0, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0 };
  }
  const callAmount = Math.max(0, s.currentBet - p.bet);
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && p.chips > 0;
  const minRaiseTo = Math.min(p.chips + p.bet, s.currentBet + Math.max(s.lastRaiseSize, 50));
  const maxRaiseTo = p.chips + p.bet;
  const canRaise = p.chips > callAmount;
  return { canFold: true, canCheck, canCall, callAmount: Math.min(callAmount, p.chips), canRaise, minRaiseTo, maxRaiseTo };
}

export interface ActionInput { type: ActionType; raiseTo?: number; }

export function applyAction(s: PokerState, playerId: string, action: ActionInput): { ok: boolean; reason?: string } {
  if (s.toActSeat < 0) return { ok: false, reason: "no action expected" };
  const p = seatPlayer(s, s.toActSeat);
  if (p.id !== playerId) return { ok: false, reason: "not your turn" };
  if (p.folded || p.allIn) return { ok: false, reason: "cannot act" };

  const callAmount = Math.max(0, s.currentBet - p.bet);

  // Snapshot of board/hole/pot context BEFORE the action is applied. Used to
  // record this decision for the post-hand review. We compute it here once so
  // any recursive fall-through (check→call, raise→call/check) still records
  // correctly using the pre-action context.
  const reviewCtx = {
    phase: s.phase,
    community: s.community.slice(),
    holeCards: p.holeCards.slice(),
    potBefore: s.pot,
    callAmount: Math.min(callAmount, p.chips),
    numOpponents: s.players.filter(
      (o) => o.id !== p.id && o.inHand && !o.folded && o.holeCards.length > 0,
    ).length,
  };

  switch (action.type) {
    case "fold":
      p.folded = true;
      pushLog(s, `${p.name} folds`);
      recordHandReview(s, p.id, reviewCtx, { type: "fold", amount: 0 });
      break;
    case "check":
      if (callAmount > 0) return applyAction(s, playerId, { type: "call" });
      pushLog(s, `${p.name} checks`);
      recordHandReview(s, p.id, reviewCtx, { type: "check", amount: 0 });
      break;
    case "call": {
      const pay = Math.min(callAmount, p.chips);
      p.chips -= pay; p.bet += pay; p.totalCommitted += pay; s.pot += pay;
      if (p.chips === 0) {
        p.allIn = true;
        s.lastAllInEvent = { playerId: p.id, name: p.name, amount: p.totalCommitted, ts: Date.now() };
      }
      pushLog(s, `${p.name} calls ${formatCents(pay)}${p.allIn ? " (all-in)" : ""}`);
      recordHandReview(s, p.id, reviewCtx, { type: "call", amount: pay });
      break;
    }
    case "bet":
    case "raise":
    case "allin": {
      let raiseTo: number;
      if (action.type === "allin") raiseTo = p.chips + p.bet;
      else raiseTo = action.raiseTo ?? s.currentBet + Math.max(s.lastRaiseSize, 50);
      raiseTo = Math.min(raiseTo, p.chips + p.bet);
      const totalDelta = raiseTo - p.bet;
      if (totalDelta <= 0) return applyAction(s, playerId, { type: callAmount > 0 ? "call" : "check" });
      const raiseSize = raiseTo - s.currentBet;
      const isFullRaise = raiseSize >= Math.max(s.lastRaiseSize, 50);
      p.chips -= totalDelta; p.bet += totalDelta; p.totalCommitted += totalDelta; s.pot += totalDelta;
      if (p.chips === 0) {
        p.allIn = true;
        s.lastAllInEvent = { playerId: p.id, name: p.name, amount: p.totalCommitted, ts: Date.now() };
      }
      const wasOpen = s.currentBet === 0;
      if (raiseTo > s.currentBet) {
        if (isFullRaise) {
          s.lastRaiseSize = raiseSize;
          for (const other of s.players) {
            if (other.id !== p.id && p.inHand && !other.folded && !other.allIn) other.hasActed = false;
          }
        }
        s.currentBet = raiseTo;
      }
      pushLog(s, `${p.name} ${wasOpen ? "bets" : "raises to"} ${formatCents(raiseTo)}${p.allIn ? " (all-in)" : ""}`);
      recordHandReview(s, p.id, reviewCtx, {
        type: action.type === "allin" ? "allin" : (wasOpen ? "bet" : "raise"),
        raiseTo,
        amount: totalDelta,
      });
      break;
    }
    default:
      return { ok: false, reason: "unknown action" };
  }

  p.hasActed = true;

  const stillIn = s.players.filter((pl) => pl.inHand && !pl.folded);
  if (stillIn.length === 1) { awardUncontested(s, stillIn[0]); return { ok: true }; }

  maybeAdvance(s);
  return { ok: true };
}

function maybeAdvance(s: PokerState) {
  const inHand = s.players.filter((p) => p.inHand && !p.folded);
  const ableToAct = inHand.filter((p) => !p.allIn);
  const allMatched = ableToAct.every((p) => p.bet === s.currentBet && p.hasActed);
  const noOneCanAct = ableToAct.length === 0;
  const onePlayerLeft = ableToAct.length === 1 && ableToAct[0].bet === s.currentBet && ableToAct[0].hasActed;

  if (allMatched || noOneCanAct || onePlayerLeft) {
    advancePhase(s);
    return;
  }
  s.toActSeat = nextActiveAfter(s, s.toActSeat);
  if (s.toActSeat < 0) advancePhase(s);
}

function advancePhase(s: PokerState) {
  for (const p of s.players) { p.bet = 0; p.hasActed = false; }
  s.currentBet = 0;
  s.lastRaiseSize = Math.max(s.bigBlind, 1);

  const order: Phase[] = ["preflop", "flop", "turn", "river", "showdown"];
  const idx = order.indexOf(s.phase);
  const next = order[idx + 1] ?? "showdown";

  if (next === "flop") {
    s.deck.pop();
    s.community.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!);
    pushLog(s, `--- FLOP ---`);
  } else if (next === "turn") {
    s.deck.pop(); s.community.push(s.deck.pop()!);
    pushLog(s, `--- TURN ---`);
  } else if (next === "river") {
    s.deck.pop(); s.community.push(s.deck.pop()!);
    pushLog(s, `--- RIVER ---`);
  }
  s.phase = next;

  if (next === "showdown") { doShowdown(s); return; }

  const ableToAct = s.players.filter((p) => p.inHand && !p.folded && !p.allIn);
  if (ableToAct.length <= 1) { advancePhase(s); return; }
  s.toActSeat = nextActiveAfter(s, s.dealerSeat);
}

function awardUncontested(s: PokerState, winner: Player) {
  winner.chips += s.pot;
  winner.handsWon += 1;
  pushLog(s, `${winner.name} wins ${formatCents(s.pot)} (everyone else folded)`);
  s.lastWinnerSummary = `${winner.name} wins ${formatCents(s.pot)}`;
  s.showdownResults = [{
    potIndex: 0, potAmount: s.pot,
    winners: [{ playerId: winner.id, name: winner.name, share: s.pot }],
    evaluations: [],
  }];
  s.pot = 0;
  s.toActSeat = -1;
  s.phase = "handover";
}

function doShowdown(s: PokerState) {
  s.toActSeat = -1;
  const contenders = s.players.filter((p) => p.inHand && !p.folded);
  const allCommits = s.players
    .filter((p) => p.totalCommitted > 0)
    .map((p) => ({ playerId: p.id, amount: p.totalCommitted, eligible: p.inHand && !p.folded }));

  const pots: { amount: number; eligibleIds: string[] }[] = [];
  const distinct = Array.from(new Set(allCommits.map((c) => c.amount))).sort((a, b) => a - b);
  let prev = 0;
  for (const lvl of distinct) {
    const layer = lvl - prev;
    const contributors = allCommits.filter((c) => c.amount >= lvl);
    const amount = layer * contributors.length;
    if (amount <= 0) { prev = lvl; continue; }
    const eligibleIds = contributors.filter((c) => c.eligible).map((c) => c.playerId);
    if (eligibleIds.length > 0) pots.push({ amount, eligibleIds });
    else pots.push({ amount, eligibleIds: contributors.map((c) => c.playerId) });
    prev = lvl;
  }

  const evals = new Map<string, BestHand>();
  for (const p of contenders) evals.set(p.id, evaluate([...p.holeCards, ...s.community]));
  const evaluationsList: ShowdownEval[] = contenders.map((p) => ({ playerId: p.id, name: p.name, bestHand: evals.get(p.id)! }));

  const results: ShowdownResult[] = [];
  const winnersThisHand = new Set<string>();
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
    const entries = winners.map((w, i) => {
      const amt = share + (i === 0 ? remainder : 0);
      const player = s.players.find((pl) => pl.id === w.id)!;
      player.chips += amt;
      return { playerId: w.id, name: w.name, share: amt, bestHand: evals.get(w.id) };
    });
    results.push({ potIndex: idx, potAmount: pot.amount, winners: entries, evaluations: evaluationsList });
    for (const w of entries) {
      winnersThisHand.add(w.playerId);
      pushLog(s, `${w.name} wins ${formatCents(w.share)} (${evals.get(w.playerId)?.name})${pots.length > 1 ? ` — pot #${idx + 1}` : ""}`);
    }
  });
  for (const id of winnersThisHand) {
    const p = s.players.find((pl) => pl.id === id);
    if (p) p.handsWon += 1;
  }

  s.showdownResults = results;
  if (results.length > 0) {
    s.lastWinnerSummary = results[0].winners
      .map((w) => `${w.name} wins ${formatCents(w.share)}${w.bestHand ? ` with ${w.bestHand.name}` : ""}`)
      .join(", ");
  }
  s.pot = 0;
  s.phase = "handover";
}

function formatCents(c: number): string {
  return "$" + (c / 100).toFixed(2);
}
