import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Card, Rank, Suit } from "./cards";
import { applyAction, newState, type PokerState, type Player } from "./poker";
import { computeViewerHandReview, type Room, type RoomSettings } from "./rooms";

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

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
  handNumber?: number;
}): Room {
  const state = newState();
  state.players = opts.players;
  state.toActSeat = opts.toActSeat;
  state.community = opts.community ?? [];
  state.pot = opts.pot ?? 0;
  state.currentBet = opts.currentBet ?? 0;
  state.phase = opts.phase ?? "preflop";
  state.handNumber = opts.handNumber ?? 1;
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

describe("hand review snapshots — recording in applyAction", () => {
  it("records a snapshot for a fold with the pre-action board and hole cards", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(7, "s"), card(2, "h")],
      }),
      makePlayer({
        id: "bob",
        seat: 1,
        name: "Bob",
        holeCards: [card(14, "s"), card(14, "h")],
        bet: 100,
        totalCommitted: 100,
      }),
    ];
    const room = makeRoom({
      toActSeat: 0,
      players,
      community: [card(9, "d"), card(5, "c"), card(3, "h")],
      pot: 150,
      currentBet: 100,
      phase: "flop",
    });
    const res = applyAction(room.state, "alice", { type: "fold" });
    assert.equal(res.ok, true);
    assert.equal(room.state.handReviewSnapshots.length, 1);
    const snap = room.state.handReviewSnapshots[0];
    assert.equal(snap.playerId, "alice");
    assert.equal(snap.phase, "flop");
    assert.equal(snap.community.length, 3);
    assert.deepEqual(snap.holeCards, [card(7, "s"), card(2, "h")]);
    assert.equal(snap.potBefore, 150);
    assert.equal(snap.callAmount, 100);
    assert.equal(snap.numOpponents, 1);
    assert.equal(snap.action.type, "fold");
    assert.equal(snap.action.amount, 0);
  });

  it("records a single snapshot when a check falls through to call", () => {
    // Alice tries to check but there's a bet she has to call → should record
    // exactly one snapshot, with type "call" and amount equal to the call.
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
        bet: 100,
        totalCommitted: 100,
        hasActed: true,
      }),
    ];
    const room = makeRoom({
      toActSeat: 0,
      players,
      pot: 150,
      currentBet: 100,
    });
    const res = applyAction(room.state, "alice", { type: "check" });
    assert.equal(res.ok, true);
    assert.equal(room.state.handReviewSnapshots.length, 1);
    const snap = room.state.handReviewSnapshots[0];
    assert.equal(snap.action.type, "call");
    assert.equal(snap.action.amount, 100);
    assert.equal(snap.potBefore, 150);
  });

  it("records bet/raise with raiseTo and the chips committed on this action", () => {
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
        bet: 100,
        totalCommitted: 100,
        hasActed: true,
      }),
    ];
    const room = makeRoom({
      toActSeat: 0,
      players,
      pot: 150,
      currentBet: 100,
    });
    const res = applyAction(room.state, "alice", { type: "raise", raiseTo: 300 });
    assert.equal(res.ok, true);
    assert.equal(room.state.handReviewSnapshots.length, 1);
    const snap = room.state.handReviewSnapshots[0];
    assert.equal(snap.action.type, "raise");
    assert.equal(snap.action.raiseTo, 300);
    assert.equal(snap.action.amount, 300);
  });
});

describe("computeViewerHandReview — exposure rules", () => {
  it("returns null when phase is not handover (live hand)", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
    ];
    const room = makeRoom({ toActSeat: 0, players, phase: "flop" });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 100,
      numOpponents: 1,
      action: { type: "call", amount: 100 },
    });
    assert.equal(computeViewerHandReview(room, "alice"), null);
  });

  it("returns review steps only for the requesting viewer at handover", () => {
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
    const room = makeRoom({ toActSeat: -1, players, phase: "handover" });
    room.state.handReviewSnapshots.push(
      {
        playerId: "alice",
        phase: "preflop",
        community: [],
        holeCards: [card(14, "s"), card(14, "h")],
        potBefore: 150,
        callAmount: 0,
        numOpponents: 1,
        action: { type: "check", amount: 0 },
      },
      {
        playerId: "bob",
        phase: "preflop",
        community: [],
        holeCards: [card(2, "c"), card(7, "d")],
        potBefore: 150,
        callAmount: 0,
        numOpponents: 1,
        action: { type: "fold", amount: 0 },
      },
    );
    const aliceReview = computeViewerHandReview(room, "alice");
    assert.ok(aliceReview, "Alice should see a review");
    assert.equal(aliceReview!.length, 1);
    assert.equal(aliceReview![0].action.type, "check");
    // Sanity: AA preflop should be a strong favorite, surfacing a value-bet
    // suggestion rather than fold.
    assert.ok(aliceReview![0].learning.winPct >= 75);
    assert.notEqual(aliceReview![0].suggestedAction.type, "fold");

    const bobReview = computeViewerHandReview(room, "bob");
    assert.ok(bobReview);
    assert.equal(bobReview!.length, 1);
    assert.equal(bobReview![0].action.type, "fold");
    // The fold-only player must not see Alice's snapshot in their review.
    assert.equal(
      bobReview!.every((s) => s.holeCards.every((c) => c.rank !== 14)),
      true,
    );
  });

  it("returns null when learning mode is disabled even at handover", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
    ];
    const room = makeRoom({
      toActSeat: -1,
      players,
      phase: "handover",
      learningMode: false,
    });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 0,
      numOpponents: 1,
      action: { type: "check", amount: 0 },
    });
    assert.equal(computeViewerHandReview(room, "alice"), null);
  });

  it("returns null for a viewer with no snapshots in this hand", () => {
    const players: Player[] = [
      makePlayer({ id: "alice", seat: 0, name: "Alice" }),
      makePlayer({ id: "spectator", seat: 1, name: "Spec" }),
    ];
    const room = makeRoom({ toActSeat: -1, players, phase: "handover" });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 0,
      numOpponents: 1,
      action: { type: "check", amount: 0 },
    });
    assert.equal(computeViewerHandReview(room, "spectator"), null);
  });

  it("caches review steps per hand (same array identity across calls)", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
    ];
    const room = makeRoom({ toActSeat: -1, players, phase: "handover", handNumber: 5 });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 0,
      numOpponents: 1,
      action: { type: "check", amount: 0 },
    });
    const a = computeViewerHandReview(room, "alice");
    const b = computeViewerHandReview(room, "alice");
    assert.ok(a && b);
    // The cache returns the very same array reference until the hand changes.
    assert.equal(a, b);
  });

  it("invalidates the cache when a new hand starts", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
    ];
    const room = makeRoom({ toActSeat: -1, players, phase: "handover", handNumber: 5 });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 0,
      numOpponents: 1,
      action: { type: "check", amount: 0 },
    });
    const first = computeViewerHandReview(room, "alice");
    assert.ok(first);

    // Simulate the next hand: bump handNumber and replace snapshots.
    room.state.handNumber = 6;
    room.state.handReviewSnapshots = [
      {
        playerId: "alice",
        phase: "preflop",
        community: [],
        holeCards: [card(2, "s"), card(7, "h")],
        potBefore: 150,
        callAmount: 0,
        numOpponents: 1,
        action: { type: "fold", amount: 0 },
      },
    ];
    const second = computeViewerHandReview(room, "alice");
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second![0].action.type, "fold");
  });
});

describe("hand review — coach action comparison", () => {
  it("suggests folding 72 offsuit facing a big bet", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(7, "s"), card(2, "h")],
      }),
    ];
    const room = makeRoom({ toActSeat: -1, players, phase: "handover" });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(7, "s"), card(2, "h")],
      potBefore: 100,
      callAmount: 500, // huge call required, ~83% pot odds needed
      numOpponents: 1,
      action: { type: "call", amount: 500 },
    });
    const review = computeViewerHandReview(room, "alice");
    assert.ok(review);
    assert.equal(review![0].suggestedAction.type, "fold");
    // The coach should disagree with the actual call here.
    assert.notEqual(review![0].suggestedAction.type, review![0].action.type);
  });

  it("suggests value-betting/raising pocket aces preflop", () => {
    const players: Player[] = [
      makePlayer({
        id: "alice",
        seat: 0,
        name: "Alice",
        holeCards: [card(14, "s"), card(14, "h")],
      }),
    ];
    const room = makeRoom({ toActSeat: -1, players, phase: "handover" });
    room.state.handReviewSnapshots.push({
      playerId: "alice",
      phase: "preflop",
      community: [],
      holeCards: [card(14, "s"), card(14, "h")],
      potBefore: 150,
      callAmount: 100,
      numOpponents: 1,
      action: { type: "call", amount: 100 },
    });
    const review = computeViewerHandReview(room, "alice");
    assert.ok(review);
    // AA vs 1 opponent has ~85% equity → coach should want a raise.
    assert.equal(review![0].suggestedAction.type, "raise");
  });
});
