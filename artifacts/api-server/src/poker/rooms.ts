import {
  addPlayer,
  applyAction,
  computeLivePots,
  newState,
  removePlayer,
  startHand,
  type ActionInput,
  type ActionType,
  type AllInEvent,
  type HandReviewAction,
  type LivePot,
  type PokerState,
  type RakeMode,
  type RoomConfig,
} from "./poker";
import { computeLearningData, type LearningData } from "./learningEngine";

export type { LearningData, LearningOut } from "./learningEngine";

export interface RoomSettings {
  buyInCents: number;
  rakeMode: RakeMode;
  smallBlindCents: number;
  bigBlindCents: number;
  anteCents: number;
  learningMode: boolean;
}

export interface PublicPlayer {
  id: string;
  seat: number;
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  inHand: boolean;
  disconnected: boolean;
  buyIns: number;
  buyBacks: number;
  pendingBuyBack: boolean;
  handsPlayed: number;
  handsWon: number;
  isHost: boolean;
  hasHoleCards: boolean;
  // Only present for the receiving player or at showdown
  holeCards?: { suit: string; rank: number }[];
}

export interface EndGameVote {
  initiatorId: string;
  initiatorName: string;
  votes: Record<string, "yes" | "no">;
  startedAt: number;
}

export interface PublicEndGameVote {
  initiatorName: string;
  yes: number;
  no: number;
  needed: number;
  total: number;
  voters: { playerId: string; name: string; vote: "yes" | "no" | null }[];
  yourVote: "yes" | "no" | null;
}

export interface SettlementTransfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cents: number;
}

export interface FinalSummaryPlayer {
  id: string;
  name: string;
  buyIns: number;
  buyBacks: number;
  totalInvestedCents: number;
  finalChipsCents: number;
  netCents: number;
  handsPlayed: number;
  handsWon: number;
  winRate: number;
}

export interface FinalSummary {
  endedAt: number;
  buyInCents: number;
  totalHands: number;
  players: FinalSummaryPlayer[];
  settlements: SettlementTransfer[];
}

export interface SuggestedReviewAction {
  type: ActionType;
  rationale: string;
}

export interface HandReviewStep {
  index: number;
  phase: PokerState["phase"];
  community: { suit: string; rank: number }[];
  holeCards: { suit: string; rank: number }[];
  potBefore: number;
  callAmount: number;
  numOpponents: number;
  action: HandReviewAction;
  learning: LearningData;
  suggestedAction: SuggestedReviewAction;
}

export interface PublicState {
  code: string;
  hostId: string;
  settings: RoomSettings;
  phase: PokerState["phase"];
  community: { suit: string; rank: number }[];
  pot: number;
  currentBet: number;
  toActSeat: number;
  dealerSeat: number;
  handNumber: number;
  log: { text: string; ts: number }[];
  players: PublicPlayer[];
  showdownResults?: PokerState["showdownResults"];
  lastWinnerSummary?: string;
  livePots: LivePot[];
  lastAllInEvent: AllInEvent | null;
  yourId: string;
  yourLegalActions: ReturnType<typeof import("./poker").legalActions>;
  isHost: boolean;
  endVote: PublicEndGameVote | null;
  gameEnded: boolean;
  finalSummary: FinalSummary | null;
  yourLearningData: LearningData | null;
  yourHandReview: HandReviewStep[] | null;
}

interface HandReviewCache {
  handNumber: number;
  perViewer: Map<string, HandReviewStep[]>;
}

export interface Room {
  code: string;
  hostId: string;
  settings: RoomSettings;
  state: PokerState;
  inGame: boolean;
  endVote: EndGameVote | null;
  gameEnded: boolean;
  finalSummary: FinalSummary | null;
  // Cached per-viewer hand reviews for the most recent hand. Avoids
  // re-running Monte Carlo on every state broadcast during handover.
  handReviewCache?: HandReviewCache;
}

const rooms = new Map<string, Room>();

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

export function createRoom(opts: { hostId: string; hostName: string; settings: RoomSettings }): Room {
  const code = genCode();
  const room: Room = {
    code,
    hostId: opts.hostId,
    settings: { ...opts.settings, learningMode: !!opts.settings.learningMode },
    state: newState(),
    inGame: false,
    endVote: null,
    gameEnded: false,
    finalSummary: null,
  };
  addPlayer(room.state, { id: opts.hostId, name: opts.hostName, chips: opts.settings.buyInCents });
  rooms.set(code, room);
  return room;
}

export function joinRoom(opts: { code: string; playerId: string; name: string }): { room?: Room; error?: string } {
  const room = rooms.get(opts.code.toUpperCase());
  if (!room) return { error: "Room not found" };
  if (room.state.players.length >= 9) return { error: "Room is full (max 9)" };
  const existing = room.state.players.find((p) => p.id === opts.playerId);
  if (existing) {
    existing.disconnected = false;
    existing.sittingOut = false;
    return { room };
  }
  // Check for name collision
  let name = opts.name;
  let suffix = 1;
  while (room.state.players.find((p) => p.name === name)) {
    suffix++;
    name = `${opts.name} (${suffix})`;
  }
  addPlayer(room.state, { id: opts.playerId, name, chips: room.settings.buyInCents });
  return { room };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomByPlayerId(playerId: string): Room | undefined {
  for (const r of rooms.values()) {
    if (r.state.players.find((p) => p.id === playerId)) return r;
  }
  return undefined;
}

export function leaveRoom(playerId: string): Room | undefined {
  const room = getRoomByPlayerId(playerId);
  if (!room) return undefined;
  removePlayer(room.state, playerId);
  if (room.state.players.length === 0) {
    rooms.delete(room.code);
    return undefined;
  }
  if (room.hostId === playerId) {
    room.hostId = room.state.players[0].id;
  }
  return room;
}

export function markDisconnected(playerId: string, disconnected: boolean): Room | undefined {
  const room = getRoomByPlayerId(playerId);
  if (!room) return undefined;
  const p = room.state.players.find((pl) => pl.id === playerId);
  if (p) p.disconnected = disconnected;
  return room;
}

// While the player whose turn it is is disconnected, auto-check (if free) or
// auto-fold so the table never stalls. Called whenever someone disconnects or
// after their action would otherwise be needed.
export function autoActDisconnected(room: Room): void {
  // Up to N safety iterations to advance through any chain of disconnected players.
  for (let i = 0; i < 20; i++) {
    const s = room.state;
    if (s.toActSeat < 0) return;
    const seat = s.players.find((p) => p.seat === s.toActSeat);
    if (!seat || !seat.disconnected) return;
    const opts = legalActions(s, seat.id);
    if (!opts.canFold && !opts.canCheck && !opts.canCall) return;
    const action: ActionInput = opts.canCheck ? { type: "check" } : { type: "fold" };
    const res = applyAction(s, seat.id, action);
    if (!res.ok) return;
  }
}

export function canBuyBackIn(room: Room, playerId: string): boolean {
  const p = room.state.players.find((pl) => pl.id === playerId);
  return !!p && p.chips <= 0 && !p.pendingBuyBack;
}

export function requestBuyBackIn(room: Room, playerId: string): { ok: boolean; error?: string } {
  const p = room.state.players.find((pl) => pl.id === playerId);
  if (!p) return { ok: false, error: "not seated" };
  if (p.chips > 0) return { ok: false, error: "player still has chips" };
  if (p.pendingBuyBack) return { ok: false, error: "buy-back already pending" };
  p.pendingBuyBack = true;
  return { ok: true };
}

export function confirmBuyBackIn(room: Room, playerId: string): { ok: boolean; error?: string } {
  const p = room.state.players.find((pl) => pl.id === playerId);
  if (!p) return { ok: false, error: "not seated" };
  if (!p.pendingBuyBack) return { ok: false, error: "no pending buy-back" };
  p.chips = room.settings.buyInCents;
  p.buyIns += 1;
  p.buyBacks += 1;
  p.pendingBuyBack = false;
  p.sittingOut = false;
  return { ok: true };
}

export function updateSettings(room: Room, settings: Partial<RoomSettings>) {
  if (room.inGame) return;
  const next: RoomSettings = { ...room.settings, ...settings };
  // Coerce optional boolean (defensive against older clients).
  next.learningMode = !!next.learningMode;
  // Clamp buy-in to at least 1 cent and ensure it is a whole number.
  next.buyInCents = Math.max(1, Math.round(next.buyInCents));
  room.settings = next;
  // Update each player's chips to new buy-in if not yet started
  for (const p of room.state.players) p.chips = room.settings.buyInCents;
}

export function dealNextHand(room: Room) {
  room.inGame = true;
  const cfg: RoomConfig = {
    buyInCents: room.settings.buyInCents,
    rakeMode: room.settings.rakeMode,
    smallBlindCents: room.settings.smallBlindCents,
    bigBlindCents: room.settings.bigBlindCents,
    anteCents: room.settings.anteCents,
  };
  startHand(room.state, cfg);
}

export function applyPlayerAction(room: Room, playerId: string, action: ActionInput) {
  return applyAction(room.state, playerId, action);
}

import { legalActions } from "./poker";

export function publicView(room: Room, viewerId: string): PublicState {
  const reveal = room.state.phase === "handover" && !!room.state.showdownResults && room.state.showdownResults.some((r) => r.evaluations.length > 0);
  return {
    code: room.code,
    hostId: room.hostId,
    settings: room.settings,
    phase: room.state.phase,
    community: room.state.community,
    pot: room.state.pot,
    currentBet: room.state.currentBet,
    toActSeat: room.state.toActSeat,
    dealerSeat: room.state.dealerSeat,
    handNumber: room.state.handNumber,
    log: room.state.log.slice(-50),
    players: room.state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      name: p.name,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      sittingOut: p.sittingOut,
      inHand: p.inHand,
      disconnected: p.disconnected,
      buyIns: p.buyIns,
      buyBacks: p.buyBacks,
      pendingBuyBack: p.pendingBuyBack,
      handsPlayed: p.handsPlayed,
      handsWon: p.handsWon,
      isHost: room.hostId === p.id,
      hasHoleCards: p.holeCards.length > 0,
      holeCards: (p.id === viewerId || (reveal && p.inHand && !p.folded)) ? p.holeCards : undefined,
    })),
    showdownResults: room.state.showdownResults,
    lastWinnerSummary: room.state.lastWinnerSummary,
    livePots: computeLivePots(room.state),
    lastAllInEvent: room.state.lastAllInEvent,
    yourId: viewerId,
    yourLegalActions: legalActions(room.state, viewerId),
    isHost: room.hostId === viewerId,
    endVote: publicEndVote(room, viewerId),
    gameEnded: room.gameEnded,
    finalSummary: room.finalSummary,
    yourLearningData: computeViewerLearning(room, viewerId),
    yourHandReview: computeViewerHandReview(room, viewerId),
  };
}

export function computeViewerHandReview(room: Room, viewerId: string): HandReviewStep[] | null {
  if (!room.settings.learningMode) return null;
  if (room.state.phase !== "handover") return null;
  const snaps = room.state.handReviewSnapshots.filter((s) => s.playerId === viewerId);
  if (snaps.length === 0) return null;

  // Use a per-hand cache so we don't re-run Monte Carlo for every broadcast.
  const handNumber = room.state.handNumber;
  if (!room.handReviewCache || room.handReviewCache.handNumber !== handNumber) {
    room.handReviewCache = { handNumber, perViewer: new Map() };
  }
  const cache = room.handReviewCache;
  const cached = cache.perViewer.get(viewerId);
  if (cached) return cached;

  const steps: HandReviewStep[] = snaps.map((snap, i) => {
    const learning = computeLearningData({
      holeCards: snap.holeCards,
      community: snap.community,
      numOpponents: snap.numOpponents,
      pot: snap.potBefore,
      callAmount: snap.callAmount,
    });
    return {
      index: i,
      phase: snap.phase,
      community: snap.community,
      holeCards: snap.holeCards,
      potBefore: snap.potBefore,
      callAmount: snap.callAmount,
      numOpponents: snap.numOpponents,
      action: snap.action,
      learning,
      suggestedAction: suggestReviewAction(learning, snap.callAmount),
    };
  });
  cache.perViewer.set(viewerId, steps);
  return steps;
}

function suggestReviewAction(learning: LearningData, callAmount: number): SuggestedReviewAction {
  const equity = learning.winPct + learning.tiePct / 2;
  const totalOuts = learning.outs.reduce((sum, o) => sum + o.count, 0);
  if (callAmount > 0) {
    if (equity >= 70) return { type: "raise", rationale: "Strong hand — raise for value" };
    if (learning.profitable && equity >= 50) return { type: "raise", rationale: "Ahead and getting odds — raise" };
    if (learning.profitable) return { type: "call", rationale: "Pot odds favor a call" };
    if (totalOuts >= 8) return { type: "call", rationale: "Strong draw — borderline call" };
    return { type: "fold", rationale: "Unprofitable — folding is best" };
  }
  if (equity >= 70) return { type: "bet", rationale: "Strong hand — bet for value" };
  if (equity >= 50) return { type: "bet", rationale: "Decent equity — small bet keeps control" };
  if (totalOuts > 0) return { type: "check", rationale: "Drawing — checking is fine here" };
  return { type: "check", rationale: "Weak hand — check and reassess" };
}

export function computeViewerLearning(room: Room, viewerId: string): LearningData | null {
  if (!room.settings.learningMode) return null;
  const phase = room.state.phase;
  if (phase !== "preflop" && phase !== "flop" && phase !== "turn" && phase !== "river") return null;
  // Only render for the player whose turn it actually is — that's the only
  // moment the call/pot-odds and coach tip are decision-relevant.
  if (room.state.toActSeat < 0) return null;
  const me = room.state.players.find((p) => p.id === viewerId);
  if (!me) return null;
  if (!me.inHand || me.folded || me.allIn) return null;
  if (me.holeCards.length < 2) return null;
  if (room.state.players[room.state.toActSeat]?.id !== viewerId) return null;

  const opponents = room.state.players.filter(
    (p) => p.id !== viewerId && p.inHand && !p.folded && p.holeCards.length > 0,
  ).length;
  const callAmount = Math.max(0, room.state.currentBet - me.bet);
  const cappedCall = Math.min(callAmount, me.chips);

  return computeLearningData({
    holeCards: me.holeCards,
    community: room.state.community,
    numOpponents: opponents,
    pot: room.state.pot,
    callAmount: cappedCall,
  });
}

function eligibleVoters(room: Room): { id: string; name: string }[] {
  return room.state.players
    .filter((p) => !p.disconnected)
    .map((p) => ({ id: p.id, name: p.name }));
}

function publicEndVote(room: Room, viewerId: string): PublicEndGameVote | null {
  const v = room.endVote;
  if (!v) return null;
  const voters = eligibleVoters(room);
  const total = voters.length;
  const needed = Math.floor(total / 2) + 1;
  let yes = 0;
  let no = 0;
  for (const e of voters) {
    const cast = v.votes[e.id];
    if (cast === "yes") yes++;
    else if (cast === "no") no++;
  }
  return {
    initiatorName: v.initiatorName,
    yes,
    no,
    needed,
    total,
    voters: voters.map((e) => ({ playerId: e.id, name: e.name, vote: v.votes[e.id] ?? null })),
    yourVote: v.votes[viewerId] ?? null,
  };
}

export type VoteResolution = "passed" | "failed" | "pending";

export function startEndGameVote(room: Room, initiatorId: string): { ok: boolean; error?: string } {
  if (room.gameEnded) return { ok: false, error: "game already ended" };
  if (room.endVote) return { ok: false, error: "vote already in progress" };
  const initiator = room.state.players.find((p) => p.id === initiatorId);
  if (!initiator) return { ok: false, error: "not in this room" };
  const eligible = eligibleVoters(room);
  if (eligible.length < 2) return { ok: false, error: "need at least 2 connected players" };
  room.endVote = {
    initiatorId,
    initiatorName: initiator.name,
    votes: { [initiatorId]: "yes" },
    startedAt: Date.now(),
  };
  return { ok: true };
}

export function castEndGameVote(room: Room, voterId: string, agree: boolean): { ok: boolean; error?: string } {
  if (!room.endVote) return { ok: false, error: "no vote in progress" };
  const eligible = eligibleVoters(room);
  if (!eligible.find((e) => e.id === voterId)) return { ok: false, error: "not eligible to vote" };
  if (room.endVote.votes[voterId]) return { ok: false, error: "already voted" };
  room.endVote.votes[voterId] = agree ? "yes" : "no";
  return { ok: true };
}

export function resolveEndGameVote(room: Room): VoteResolution {
  if (!room.endVote) return "pending";
  const eligible = eligibleVoters(room);
  const total = eligible.length;
  const needed = Math.floor(total / 2) + 1;
  let yes = 0;
  let no = 0;
  let pending = 0;
  for (const e of eligible) {
    const v = room.endVote.votes[e.id];
    if (v === "yes") yes++;
    else if (v === "no") no++;
    else pending++;
  }
  const maxPossibleYes = yes + pending;
  if (yes >= needed) {
    room.endVote = null;
    finalizeGame(room);
    return "passed";
  }
  if (maxPossibleYes < needed) {
    room.endVote = null;
    return "failed";
  }
  return "pending";
}

export function cancelEndGameVote(room: Room, requesterId: string): { ok: boolean; error?: string } {
  if (!room.endVote) return { ok: false, error: "no vote in progress" };
  if (room.endVote.initiatorId !== requesterId) return { ok: false, error: "only initiator can cancel" };
  room.endVote = null;
  return { ok: true };
}

function finalizeGame(room: Room): void {
  const buyIn = room.settings.buyInCents;
  const players: FinalSummaryPlayer[] = room.state.players.map((p) => {
    const totalInvested = p.buyIns * buyIn;
    const net = p.chips - totalInvested;
    const winRate = p.handsPlayed > 0 ? p.handsWon / p.handsPlayed : 0;
    return {
      id: p.id,
      name: p.name,
      buyIns: p.buyIns,
      buyBacks: p.buyBacks,
      totalInvestedCents: totalInvested,
      finalChipsCents: p.chips,
      netCents: net,
      handsPlayed: p.handsPlayed,
      handsWon: p.handsWon,
      winRate,
    };
  });
  const settlements = computeSettlements(players);
  room.finalSummary = {
    endedAt: Date.now(),
    buyInCents: buyIn,
    totalHands: room.state.handNumber,
    players,
    settlements,
  };
  room.gameEnded = true;
  room.state.phase = "handover";
  room.state.toActSeat = -1;
}

function computeSettlements(players: FinalSummaryPlayer[]): SettlementTransfer[] {
  // Build creditors (positive net) and debtors (negative net)
  const creditors = players
    .filter((p) => p.netCents > 0)
    .map((p) => ({ id: p.id, name: p.name, remaining: p.netCents }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = players
    .filter((p) => p.netCents < 0)
    .map((p) => ({ id: p.id, name: p.name, remaining: -p.netCents }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.remaining, d.remaining);
    if (amount > 0) {
      transfers.push({ fromId: d.id, fromName: d.name, toId: c.id, toName: c.name, cents: amount });
    }
    c.remaining -= amount;
    d.remaining -= amount;
    if (c.remaining === 0) ci++;
    if (d.remaining === 0) di++;
  }
  return transfers;
}
