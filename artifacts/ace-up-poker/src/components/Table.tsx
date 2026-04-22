import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyAction,
  newGame,
  startHand,
  type ActionInput,
  type NewGameOpts,
  type PokerState,
} from "@/engine/poker";
import { botDecide } from "@/engine/ai";
import { Seat } from "./Seat";
import { PlayingCard } from "./PlayingCard";
import { Controls } from "./Controls";

interface Props {
  opts: NewGameOpts;
  onExit: () => void;
}

export function Table({ opts, onExit }: Props) {
  const [state, setState] = useState<PokerState>(() => startHand(newGame(opts)));
  const heroId = 0;
  const hero = state.players.find((p) => p.id === heroId)!;

  // Bot turn driver
  const turnRef = useRef<number | null>(null);
  useEffect(() => {
    if (turnRef.current) {
      window.clearTimeout(turnRef.current);
      turnRef.current = null;
    }
    if (state.phase === "handover") return;
    if (state.toActIdx < 0) return;
    const cur = state.players[state.toActIdx];
    if (!cur || cur.isHuman) return;
    turnRef.current = window.setTimeout(() => {
      const action = botDecide(state, cur.id);
      setState((s) => applyAction(s, action));
    }, 700 + Math.random() * 600);
    return () => {
      if (turnRef.current) window.clearTimeout(turnRef.current);
    };
  }, [state]);

  const handleAction = (a: ActionInput) => {
    setState((s) => applyAction(s, a));
  };

  const nextHand = () => {
    setState((s) => startHand(s));
  };

  const showdownReveal = state.phase === "handover" && !!state.showdownResults && state.showdownResults.some(r => r.evaluations.length > 0);

  // Layout seats around the table.
  const seats = state.players;
  const positions = useMemo(() => seatPositions(seats.length), [seats.length]);

  const phaseLabel = useMemo(() => {
    return ({
      idle: "Waiting",
      preflop: "Pre-flop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      showdown: "Showdown",
      handover: "Hand complete",
    } as const)[state.phase];
  }, [state.phase]);

  const canStartNext = state.phase === "handover" && state.players.filter(p => p.chips > 0).length >= 2;
  const gameOver = state.phase === "handover" && state.players.filter(p => p.chips > 0).length < 2;

  return (
    <div className="min-h-screen text-white"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-300 tracking-wide">Ace Up Poker</h1>
            <div className="text-xs text-zinc-400">
              Hand #{state.handNumber} · Blinds {state.smallBlind}/{state.bigBlind} · {phaseLabel}
            </div>
          </div>
          <button
            onClick={onExit}
            className="px-3 py-1.5 text-sm rounded-md border border-white/10 text-zinc-300 hover:bg-white/5"
          >
            Leave Table
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_280px] gap-4">
          {/* Table */}
          <div className="relative aspect-[16/10] rounded-[120px] border-[12px] border-amber-900/60 shadow-2xl overflow-visible"
            style={{ background: "radial-gradient(ellipse at center, #115c3f 0%, #0a3d2a 70%, #062719 100%)" }}
          >
            {/* Felt accents */}
            <div className="absolute inset-4 rounded-[100px] border border-emerald-900/50 pointer-events-none" />

            {/* Pot + community */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="text-xs uppercase tracking-widest text-amber-200/60">Pot</div>
              <div className="text-3xl font-bold text-amber-300 font-mono">
                {state.pot.toLocaleString()}
              </div>
              <div className="flex gap-2 mt-2">
                {Array.from({ length: 5 }).map((_, i) => {
                  const c = state.community[i];
                  return c
                    ? <PlayingCard key={i} card={c} size="md" />
                    : <div key={i} className="w-14 h-20 rounded-md border border-white/10 bg-black/20" />;
                })}
              </div>
              {state.lastWinnerSummary && state.phase === "handover" && (
                <div className="mt-3 px-4 py-2 rounded-lg bg-amber-300/20 border border-amber-300/40 text-amber-100 text-sm font-semibold text-center max-w-md">
                  {state.lastWinnerSummary}
                </div>
              )}
            </div>

            {/* Seats */}
            {seats.map((p, i) => (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${positions[i].x}%`,
                  top: `${positions[i].y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <Seat
                  player={p}
                  state={state}
                  reveal={showdownReveal}
                  isHero={p.id === heroId}
                />
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Your Stack</div>
              <div className="text-2xl font-bold text-emerald-300 font-mono">
                {hero.chips.toLocaleString()}
              </div>
              {hero.bet > 0 && (
                <div className="text-xs text-amber-200 font-mono mt-1">
                  In this round: {hero.bet}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              {gameOver ? (
                <div className="text-center space-y-3">
                  <div className="text-amber-300 font-bold text-lg">Game Over</div>
                  <div className="text-sm text-zinc-300">
                    {hero.chips > 0 ? "You're the last player standing!" : "You're out of chips."}
                  </div>
                  <button
                    onClick={onExit}
                    className="w-full py-2 rounded-lg bg-amber-400 text-zinc-900 font-bold uppercase tracking-wide"
                  >
                    New Game
                  </button>
                </div>
              ) : canStartNext ? (
                <button
                  onClick={nextHand}
                  className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-900 font-bold uppercase tracking-wide transition"
                >
                  Deal Next Hand
                </button>
              ) : (
                <Controls state={state} heroId={heroId} onAction={handleAction} />
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 max-h-72 overflow-y-auto">
              <div className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Hand Log</div>
              <div className="space-y-1 text-xs font-mono text-zinc-300">
                {state.log.slice(-30).reverse().map((entry, i) => (
                  <div
                    key={i}
                    className={
                      entry.text.includes("---") ? "text-amber-300 font-bold" :
                      entry.text.includes("wins") ? "text-emerald-300" : ""
                    }
                  >
                    {entry.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Showdown details */}
        {showdownReveal && state.showdownResults && (
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
            <div className="text-xs uppercase tracking-wider text-amber-200/80 mb-2">Showdown</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {state.showdownResults[0]?.evaluations.map((ev) => {
                const player = state.players.find(p => p.id === ev.playerId)!;
                const isWinner = state.showdownResults!.some(r => r.winners.some(w => w.playerId === ev.playerId));
                return (
                  <div key={ev.playerId} className={`rounded-lg p-3 border ${isWinner ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-black/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{ev.name}</div>
                      <div className={`text-xs ${isWinner ? "text-amber-300" : "text-zinc-400"}`}>
                        {ev.bestHand.name}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {player.holeCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Returns x,y percentages for n seats around an oval (seat 0 at bottom = hero)
function seatPositions(n: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const cx = 50, cy = 50;
  const rx = 44, ry = 44;
  // Start at bottom (90deg) and go counter-clockwise
  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    positions.push({ x, y });
  }
  return positions;
}
