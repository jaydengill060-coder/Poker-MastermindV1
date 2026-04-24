import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Card, Rank, Suit } from "./cards";
import { computeLearningData } from "./learningEngine";
import { newState, type PokerState, type Player } from "./poker";
import { computeViewerLearning, type Room, type RoomSettings } from "./rooms";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const ITER = 1500;

describe("computeLearningData — preflop equity sanity", () => {
  it("pocket aces are heavy favorites heads-up (≥ 80% win)", () => {
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(14, "h")],
      community: [],
      numOpponents: 1,
      pot: 0,
      callAmount: 0,
      iterations: ITER,
    });
    assert.equal(result.handName, "Pocket Aces");
    assert.ok(
      result.winPct >= 80,
      `expected AA win% >= 80, got ${result.winPct.toFixed(2)}`,
    );
  });

  it("72 offsuit is a dog heads-up (25% ≤ win < 40%)", () => {
    const result = computeLearningData({
      holeCards: [card(7, "s"), card(2, "h")],
      community: [],
      numOpponents: 1,
      pot: 0,
      callAmount: 0,
      iterations: ITER,
    });
    assert.equal(result.handName, "72 offsuit");
    assert.ok(
      result.winPct >= 25 && result.winPct < 40,
      `expected 72o win% in [25,40), got ${result.winPct.toFixed(2)}`,
    );
  });
});

describe("detectOuts (via computeLearningData)", () => {
  it("flush draw on flop → 9 outs", () => {
    // Hole: As Ks, board: 7s 2s 9d → 4 spades, no other made hand
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(13, "s")],
      community: [card(7, "s"), card(2, "s"), card(9, "d")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const flush = result.outs.find((o) => o.description === "Flush");
    assert.ok(flush, "expected a flush draw out");
    assert.equal(flush!.count, 9);
  });

  it("open-ended straight draw on flop → 8 outs", () => {
    // Hole: 9c 8d, board: 7h 6s 2c → OESD (5 or 10 completes)
    const result = computeLearningData({
      holeCards: [card(9, "c"), card(8, "d")],
      community: [card(7, "h"), card(6, "s"), card(2, "c")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const straight = result.outs.find((o) => o.description === "Straight");
    assert.ok(straight, "expected an OESD out");
    assert.equal(straight!.count, 8);
  });

  it("gutshot on flop → 4 outs", () => {
    // Hole: 9c 7d, board: 6h 5s 2c → gutshot (only 8 completes)
    const result = computeLearningData({
      holeCards: [card(9, "c"), card(7, "d")],
      community: [card(6, "h"), card(5, "s"), card(2, "c")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const straight = result.outs.find((o) => o.description === "Straight");
    assert.ok(straight, "expected a gutshot out");
    assert.equal(straight!.count, 4);
  });

  it("one pair → trips draw lists 2 outs", () => {
    // Hole: As Ks, board: Ah 7d 2c → pair of aces, 2 outs to trip aces
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(13, "s")],
      community: [card(14, "h"), card(7, "d"), card(2, "c")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const trips = result.outs.find((o) => o.description === "Trips");
    assert.ok(trips, "expected a trips draw out");
    assert.equal(trips!.count, 2);
  });

  it("two pair → full house draw lists 4 outs", () => {
    // Hole: As Kd, board: Ah Kh 2c → two pair (AA + KK), 4 outs to fill up
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(13, "d")],
      community: [card(14, "h"), card(13, "h"), card(2, "c")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const fh = result.outs.find((o) => o.description === "Full House");
    assert.ok(fh, "expected a full house draw out");
    assert.equal(fh!.count, 4);
  });

  it("already-made flush does NOT list a flush draw out", () => {
    // Hole: As Ks, board: 7s 2s 9s → completed flush
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(13, "s")],
      community: [card(7, "s"), card(2, "s"), card(9, "s")],
      numOpponents: 1,
      pot: 100,
      callAmount: 25,
      iterations: ITER,
    });
    const flush = result.outs.find((o) => o.description === "Flush");
    assert.equal(flush, undefined, "completed flush should not list flush draw");
  });
});

describe("pot odds formula", () => {
  it("computes callAmount / (pot + callAmount) as a percentage", () => {
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(14, "h")],
      community: [],
      numOpponents: 1,
      pot: 75,
      callAmount: 25,
      iterations: 1000,
    });
    // 25 / (75 + 25) = 0.25 → 25%
    assert.ok(
      Math.abs(result.potOddsNeeded - 25) < 1e-9,
      `expected potOddsNeeded ~= 25, got ${result.potOddsNeeded}`,
    );
  });

  it("returns 0 when there is no call to make", () => {
    const result = computeLearningData({
      holeCards: [card(14, "s"), card(14, "h")],
      community: [],
      numOpponents: 1,
      pot: 100,
      callAmount: 0,
      iterations: 1000,
    });
    assert.equal(result.potOddsNeeded, 0);
  });
});

// --- Room helpers for computeViewerLearning privacy tests ---

const SETTINGS: RoomSettings = {
  buyInCents: 10000,
  rakeMode: "blinds",
  smallBlindCents: 50,
  bigBlindCents: 100,
  anteCents: 0,
  learningMode: true,
};

function makePlayer(overrides: Partial<Player> & Pick<Player, "id" | "seat" | "name">): Player {
  return {
    id: overrides.id,
    seat: overrides.seat,
    name: overrides.name,
    chips: overrides.chips ?? 10000,
    bet: overrides.bet ?? 0,
    totalCommitted: overrides.totalCommitted ?? 0,
    folded: overrides.folded ?? false,
    allIn: overrides.allIn ?? false,
    hasActed: overrides.hasActed ?? false,
    sittingOut: overrides.sittingOut ?? false,
    inHand: overrides.inHand ?? true,
    disconnected: overrides.disconnected ?? false,
    holeCards: overrides.holeCards ?? [],
    buyIns: overrides.buyIns ?? 1,
    buyBacks: overrides.buyBacks ?? 0,
    pendingBuyBack: overrides.pendingBuyBack ?? false,
    handsPlayed: overrides.handsPlayed ?? 0,
    handsWon: overrides.handsWon ?? 0,
  };
}

function makeRoom(opts: {
  toActSeat: number;
  players: Player[];
  community?: Card[];
  pot?: number;
  currentBet?: number;
  phase?: PokerState["phase"];
  learningMode?: boolean;
}): Room {
  const state = newState();
  state.players = opts.players;
  state.toActSeat = opts.toActSeat;
  state.community = opts.community ?? [];
  state.pot = opts.pot ?? 0;
  state.currentBet = opts.currentBet ?? 0;
  state.phase = opts.phase ?? "preflop";
  return {
    code: "TEST1",
    hostId: opts.players[0]?.id ?? "host",
    settings: { ...SETTINGS, learningMode: opts.learningMode ?? true },
    state,
    inGame: true,
    endVote: null,
    gameEnded: false,
    finalSummary: null,
  };
}

describe("computeViewerLearning — privacy boundary", () => {
  it("returns learning data for the player whose turn it is", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
      makePlayer({
        id: "bob",
        seat: 1,
        name: "Bob",
        holeCards: [card(2, "c"), card(7, "d")],
      }),
    ];
    const room = makeRoom({ toActSeat: 0, players, pot: 150, currentBet: 100 });
    const data = computeViewerLearning(room, "alice");
    assert.ok(data, "Alice (to act) should receive learning data");
    assert.equal(data!.handName, "Pocket Aces");
  });

  it("returns null for an opponent who is not the player to act", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
      makePlayer({
        id: "bob",
        seat: 1,
        name: "Bob",
        holeCards: [card(2, "c"), card(7, "d")],
      }),
    ];
    const room = makeRoom({ toActSeat: 0, players, pot: 150, currentBet: 100 });
    const data = computeViewerLearning(room, "bob");
    assert.equal(data, null, "Opponent must not receive learning data");
  });

  it("returns null when learning mode is disabled", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
      makePlayer({
        id: "bob",
        seat: 1,
        name: "Bob",
        holeCards: [card(2, "c"), card(7, "d")],
      }),
    ];
    const room = makeRoom({
      toActSeat: 0,
      players,
      pot: 150,
      currentBet: 100,
      learningMode: false,
    });
    assert.equal(computeViewerLearning(room, "alice"), null);
  });

  it("returns null for a folded player even on their nominal seat", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
        folded: true,
        inHand: false,
      }),
      makePlayer({
        id: "bob",
        seat: 1,
        name: "Bob",
        holeCards: [card(2, "c"), card(7, "d")],
      }),
    ];
    const room = makeRoom({ toActSeat: 0, players, pot: 150, currentBet: 100 });
    assert.equal(computeViewerLearning(room, "alice"), null);
  });
});
