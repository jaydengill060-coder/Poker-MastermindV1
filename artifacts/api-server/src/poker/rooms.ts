import {
  addPlayer,
  applyAction,
  newState,
  removePlayer,
  startHand,
  type ActionInput,
  type PokerState,
  type RakeMode,
  type RoomConfig,
} from "./poker";

export interface RoomSettings {
  buyInCents: number;
  rakeMode: RakeMode;
  smallBlindCents: number;
  bigBlindCents: number;
  anteCents: number;
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
  isHost: boolean;
  hasHoleCards: boolean;
  // Only present for the receiving player or at showdown
  holeCards?: { suit: string; rank: number }[];
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
  yourId: string;
  yourLegalActions: ReturnType<typeof import("./poker").legalActions>;
  isHost: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  settings: RoomSettings;
  state: PokerState;
  inGame: boolean;
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
    settings: opts.settings,
    state: newState(),
    inGame: false,
  };
  addPlayer(room.state, { id: opts.hostId, name: opts.hostName, chips: opts.settings.buyInCents });
  rooms.set(code, room);
  return room;
}

export function joinRoom(opts: { code: string; playerId: string; name: string }): { room?: Room; error?: string } {
  const room = rooms.get(opts.code.toUpperCase());
  if (!room) return { error: "Room not found" };
  if (room.state.players.length >= 9) return { error: "Room is full (max 9)" };
  if (room.state.players.find((p) => p.id === opts.playerId)) return { room };
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

export function updateSettings(room: Room, settings: Partial<RoomSettings>) {
  if (room.inGame) return;
  room.settings = { ...room.settings, ...settings };
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
      isHost: room.hostId === p.id,
      hasHoleCards: p.holeCards.length > 0,
      holeCards: (p.id === viewerId || (reveal && p.inHand && !p.folded)) ? p.holeCards : undefined,
    })),
    showdownResults: room.state.showdownResults,
    lastWinnerSummary: room.state.lastWinnerSummary,
    yourId: viewerId,
    yourLegalActions: legalActions(room.state, viewerId),
    isHost: room.hostId === viewerId,
  };
}
