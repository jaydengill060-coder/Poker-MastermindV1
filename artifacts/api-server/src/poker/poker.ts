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
    deck: [],
  };
}

function pushLog(s: PokerState, text: string) {
  s.log.push({ text, ts: Date.now() });
  if (s.log.length > 200) s.log.shift();
}

export function addPlayer(s: PokerState, opts: { id: string; name: string; chips: number }): Player {
  const seat = s.players.length;
  const p: Player = {
    id: opts.id, seat, name: opts.name, chips: opts.chips,
    buyIns: 1, buyBacks: 0, pendingBuyBack: false,
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
  s.lastRaiseSize = Math.max(s.bigBlind, 1);
  s.handNumber += 1;
  s.showdownResults = undefined;
  s.lastWinnerSummary = undefined;

  // Advance dealer (or initialize)
  if (s.dealerSeat < 0) s.dealerSeat = inHand[0].seat;
  else s.dealerSeat = nextSeated(s, s.dealerSeat);

  for (const p of inHand) p.inHand = true;

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
  const minRaiseTo = Math.min(p.chips + p.bet, s.currentBet + Math.max(s.lastRaiseSize, s.bigBlind || 1));
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

  switch (action.type) {
    case "fold":
      p.folded = true;
      pushLog(s, `${p.name} folds`);
      break;
    case "check":
      if (callAmount > 0) return applyAction(s, playerId, { type: "call" });
      pushLog(s, `${p.name} checks`);
      break;
    case "call": {
      const pay = Math.min(callAmount, p.chips);
      p.chips -= pay; p.bet += pay; p.totalCommitted += pay; s.pot += pay;
      if (p.chips === 0) p.allIn = true;
      pushLog(s, `${p.name} calls ${formatCents(pay)}${p.allIn ? " (all-in)" : ""}`);
      break;
    }
    case "bet":
    case "raise":
    case "allin": {
      let raiseTo: number;
      if (action.type === "allin") raiseTo = p.chips + p.bet;
      else raiseTo = action.raiseTo ?? s.currentBet + Math.max(s.lastRaiseSize, s.bigBlind || 1);
      raiseTo = Math.min(raiseTo, p.chips + p.bet);
      const totalDelta = raiseTo - p.bet;
      if (totalDelta <= 0) return applyAction(s, playerId, { type: callAmount > 0 ? "call" : "check" });
      const raiseSize = raiseTo - s.currentBet;
      const isFullRaise = raiseSize >= Math.max(s.lastRaiseSize, s.bigBlind || 1);
      p.chips -= totalDelta; p.bet += totalDelta; p.totalCommitted += totalDelta; s.pot += totalDelta;
      if (p.chips === 0) p.allIn = true;
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
      pushLog(s, `${w.name} wins ${formatCents(w.share)} (${evals.get(w.playerId)?.name})${pots.length > 1 ? ` — pot #${idx + 1}` : ""}`);
    }
  });

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
