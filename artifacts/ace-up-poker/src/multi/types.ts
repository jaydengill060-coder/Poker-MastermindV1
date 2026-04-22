// Mirror of server-side public types
import type { Card } from "@/engine/cards";

export type Phase = "idle" | "preflop" | "flop" | "turn" | "river" | "showdown" | "handover";
export type RakeMode = "blinds" | "ante";

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
  holeCards?: Card[];
}

export interface BestHand {
  cards: Card[];
  score: { rank: number; tiebreakers: number[] };
  name: string;
}

export interface ShowdownResult {
  potIndex: number;
  potAmount: number;
  winners: { playerId: string; name: string; share: number; bestHand?: BestHand }[];
  evaluations: { playerId: string; name: string; bestHand: BestHand }[];
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export interface PublicState {
  code: string;
  hostId: string;
  settings: RoomSettings;
  phase: Phase;
  community: Card[];
  pot: number;
  currentBet: number;
  toActSeat: number;
  dealerSeat: number;
  handNumber: number;
  log: { text: string; ts: number }[];
  players: PublicPlayer[];
  showdownResults?: ShowdownResult[];
  lastWinnerSummary?: string;
  yourId: string;
  yourLegalActions: LegalActions;
  isHost: boolean;
}

export type ActionInput =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; raiseTo: number }
  | { type: "raise"; raiseTo: number }
  | { type: "allin" };

export function fmtCents(c: number): string {
  return "$" + (c / 100).toFixed(2);
}

export const BUY_IN_OPTIONS = [50, 100, 500, 1000];
export const BLIND_OPTIONS: { sb: number; bb: number; label: string }[] = [
  { sb: 1, bb: 2, label: "$0.01 / $0.02" },
  { sb: 5, bb: 10, label: "$0.05 / $0.10" },
  { sb: 10, bb: 25, label: "$0.10 / $0.25" },
  { sb: 25, bb: 50, label: "$0.25 / $0.50" },
];
export const ANTE_OPTIONS = [10, 25, 50];
