import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "./socket";
import { fmtCents, type ActionInput, type PublicPlayer, type PublicState } from "./types";
import { PlayingCard } from "@/components/PlayingCard";
import { AllInBurst } from "./AllInBurst";

interface Props {
  state: PublicState;
  onLeave: () => void;
}

export function MultiTable({ state, onLeave }: Props) {
  const me = state.players.find((p) => p.id === state.yourId);
  const isMyTurn = state.toActSeat >= 0 && state.players[state.toActSeat]?.id === state.yourId;

  const positions = useMemo(() => {
    const meIdx = state.players.findIndex((p) => p.id === state.yourId);
    return seatPositions(state.players.length, meIdx >= 0 ? meIdx : 0);
  }, [state.players.length, state.yourId, state.players]);

  const phaseLabel = ({
    idle: "Waiting", preflop: "Pre-flop", flop: "Flop", turn: "Turn",
    river: "River", showdown: "Showdown", handover: "Hand complete",
  } as const)[state.phase];

  const reveal = state.phase === "handover" && !!state.showdownResults && state.showdownResults.some((r) => r.evaluations.length > 0);

  const send = (action: ActionInput) => {
    getSocket().emit("action", action);
  };

  const startHand = () => {
    getSocket().emit("start_hand", null);
  };

  const rebuy = () => {
    getSocket().emit("rebuy", null);
  };

  const confirmBuyBackIn = () => {
    getSocket().emit("confirm_buy_back_in", null);
  };

  const leave = () => {
    getSocket().emit("leave_room", null, () => onLeave());
  };

  const startEndVote = () => {
    getSocket().emit("start_end_game_vote", null);
  };

  const castVote = (agree: boolean) => {
    getSocket().emit("cast_end_game_vote", { agree });
  };

  const cancelEndVote = () => {
    getSocket().emit("cancel_end_game_vote", null);
  };

  const endVote = state.endVote;
  const myVote = endVote?.yourVote ?? null;
  const isVoteInitiator = endVote && state.players.find((p) => p.id === state.yourId)?.name === endVote.initiatorName;

  const canStartNext = state.phase === "handover" && state.players.filter((p) => p.chips > 0 && !p.disconnected).length >= 2;
  const opts = state.yourLegalActions;

  const [raiseAmt, setRaiseAmt] = useState<number>(opts.minRaiseTo);
  useEffect(() => { if (isMyTurn) setRaiseAmt(opts.minRaiseTo); }, [isMyTurn, opts.minRaiseTo, state.handNumber, state.phase]);

  // Detect new all-in events to trigger the dramatic burst.
  const lastAllInTsRef = useRef<number>(0);
  const [allInBurst, setAllInBurst] = useState<{ name: string; amount: number; key: number } | null>(null);
  useEffect(() => {
    const ev = state.lastAllInEvent;
    if (ev && ev.ts > lastAllInTsRef.current) {
      lastAllInTsRef.current = ev.ts;
      setAllInBurst({ name: ev.name, amount: ev.amount, key: ev.ts });
      const t = setTimeout(() => setAllInBurst((cur) => (cur && cur.key === ev.ts ? null : cur)), 2800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.lastAllInEvent]);

  const presets = useMemo(() => {
    const minTo = opts.minRaiseTo;
    const maxTo = opts.maxRaiseTo;
    const cur = state.currentBet;
    const half = Math.max(minTo, Math.min(maxTo, cur + Math.floor(state.pot * 0.5)));
    const pot = Math.max(minTo, Math.min(maxTo, cur + state.pot));
    return [
      { label: "Min", to: minTo },
      { label: "1/2 Pot", to: half },
      { label: "Pot", to: pot },
      { label: "All-in", to: maxTo },
    ];
  }, [opts.minRaiseTo, opts.maxRaiseTo, state.currentBet, state.pot]);

  return (
    <div className="min-h-screen text-white"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-300 tracking-wide">Ace Up Poker</h1>
            <div className="text-xs text-zinc-400">
              Lobby <span className="text-amber-300 font-mono">{state.code}</span> · Hand #{state.handNumber} ·{" "}
              {state.settings.rakeMode === "blinds"
                ? `${fmtCents(state.settings.smallBlindCents)}/${fmtCents(state.settings.bigBlindCents)} blinds`
                : `${fmtCents(state.settings.anteCents)} ante`} · {phaseLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!endVote && (
              <button
                onClick={startEndVote}
                className="px-3 py-1.5 text-sm rounded-md border border-rose-700/60 text-rose-200 hover:bg-rose-900/30"
              >
                End Game
              </button>
            )}
            <button onClick={leave} className="px-3 py-1.5 text-sm rounded-md border border-white/10 text-zinc-300 hover:bg-white/5">
              Leave
            </button>
          </div>
        </div>

        {endVote && (
          <div className="mb-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-amber-200 font-bold">
                  {endVote.initiatorName} called a vote to end the game
                </div>
                <div className="text-xs text-amber-100/70 mt-1">
                  Needs {endVote.needed} of {endVote.total} players to agree · {endVote.yes} yes · {endVote.no} no
                </div>
              </div>
              {isVoteInitiator && (
                <button
                  onClick={cancelEndVote}
                  className="text-xs text-amber-200/70 hover:text-amber-100 underline"
                >
                  Cancel vote
                </button>
              )}
            </div>
            {myVote === null ? (
              <div className="flex gap-2">
                <button
                  onClick={() => castVote(true)}
                  className="flex-1 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wide text-sm"
                >
                  Yes, end game
                </button>
                <button
                  onClick={() => castVote(false)}
                  className="flex-1 py-2 rounded-md bg-rose-700 hover:bg-rose-600 text-white font-bold uppercase tracking-wide text-sm"
                >
                  No, keep playing
                </button>
              </div>
            ) : (
              <div className="text-xs text-amber-100/80">
                You voted <span className="font-bold uppercase">{myVote}</span>. Waiting for the rest...
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
              {endVote.voters.map((v) => (
                <div key={v.playerId} className="flex items-center justify-between px-2 py-1 rounded bg-black/20">
                  <span className="truncate">{v.name}</span>
                  <span className={
                    v.vote === "yes" ? "text-emerald-300 font-bold"
                    : v.vote === "no" ? "text-rose-300 font-bold"
                    : "text-zinc-500"
                  }>
                    {v.vote === "yes" ? "YES" : v.vote === "no" ? "NO" : "..."}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_280px] gap-4">
          <div className="relative aspect-[16/10] rounded-[120px] border-[12px] border-amber-900/60 shadow-2xl overflow-visible"
            style={{ background: "radial-gradient(ellipse at center, #115c3f 0%, #0a3d2a 70%, #062719 100%)" }}
          >
            <div className="absolute inset-4 rounded-[100px] border border-emerald-900/50 pointer-events-none" />

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="text-xs uppercase tracking-widest text-amber-200/60">Total Pot</div>
              <div className="text-3xl font-bold text-amber-300 font-mono">{fmtCents(state.pot)}</div>
              {state.livePots.length > 1 && state.phase !== "handover" && (
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {state.livePots.map((pot, idx) => {
                    const label = idx === 0 ? "Main" : `Side ${idx}`;
                    return (
                      <div key={idx} className="px-2 py-1 rounded-md bg-black/40 border border-amber-300/30 text-[11px] text-amber-100">
                        <span className="font-bold">{label}</span>{" "}
                        <span className="font-mono">{fmtCents(pot.amount)}</span>
                        <span className="text-amber-200/60"> · {pot.eligibleIds.length} eligible</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
              {state.phase === "handover" && state.showdownResults && state.showdownResults.length > 1 && (
                <div className="mt-2 flex flex-col gap-1 text-xs text-amber-100/90">
                  {state.showdownResults.map((r) => (
                    <div key={r.potIndex} className="px-2 py-1 rounded bg-black/30 border border-amber-300/20">
                      <span className="font-bold">{r.potIndex === 0 ? "Main pot" : `Side pot ${r.potIndex}`}</span>{" "}
                      <span className="font-mono">{fmtCents(r.potAmount)}</span> →{" "}
                      {r.winners.map((w) => `${w.name} (${fmtCents(w.share)})`).join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {state.players.map((p, i) => (
              <div
                key={p.id}
                className="absolute"
                style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%`, transform: "translate(-50%, -50%)" }}
              >
                <SeatCard player={p} state={state} reveal={reveal} isMe={p.id === state.yourId} />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Your Stack</div>
              <div className="text-2xl font-bold text-emerald-300 font-mono">
                {me ? fmtCents(me.chips) : "$0.00"}
              </div>
              {me && me.bet > 0 && (
                <div className="text-xs text-amber-200 font-mono mt-1">In this round: {fmtCents(me.bet)}</div>
              )}
              {me && me.chips === 0 && !me.pendingBuyBack && (
                <button
                  onClick={rebuy}
                  className="mt-2 w-full py-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
                >
                  Request Buy Back-In {fmtCents(state.settings.buyInCents)}
                </button>
              )}
              {me && me.pendingBuyBack && (
                <button
                  onClick={confirmBuyBackIn}
                  className="mt-2 w-full py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white font-bold"
                >
                  Confirm Buy Back-In
                </button>
              )}
              {me && (
                <div className="mt-2 text-[11px] text-zinc-400">
                  Buy-ins: {me.buyIns} · Buy-backs: {me.buyBacks}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              {state.phase === "handover" ? (
                state.isHost ? (
                  <button
                    onClick={startHand}
                    disabled={!canStartNext}
                    className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-900 font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {canStartNext ? "Deal Next Hand" : "Need 2+ players"}
                  </button>
                ) : (
                  <div className="text-center text-sm text-zinc-400 italic py-3">
                    Waiting for host to deal next hand
                  </div>
                )
              ) : !isMyTurn ? (
                <div className="text-center text-sm text-zinc-400 italic py-3">
                  {state.toActSeat >= 0 && state.players[state.toActSeat]
                    ? `${state.players[state.toActSeat].name} is thinking...`
                    : "Waiting..."}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => send({ type: "fold" })}
                      className="flex-1 py-3 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold uppercase tracking-wide"
                    >
                      Fold
                    </button>
                    <button
                      onClick={() => send({ type: opts.canCheck ? "check" : "call" })}
                      className="flex-1 py-3 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-bold uppercase tracking-wide"
                    >
                      {opts.canCheck ? "Check" : `Call ${fmtCents(opts.callAmount)}`}
                    </button>
                    <button
                      disabled={!opts.canRaise}
                      onClick={() => send({ type: state.currentBet === 0 ? "bet" : "raise", raiseTo: raiseAmt })}
                      className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {state.currentBet === 0 ? `Bet ${fmtCents(raiseAmt)}` : `Raise ${fmtCents(raiseAmt)}`}
                    </button>
                  </div>
                  {opts.canRaise && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={opts.minRaiseTo}
                          max={opts.maxRaiseTo}
                          step={1}
                          value={Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseAmt))}
                          onChange={(e) => setRaiseAmt(Number(e.target.value))}
                          className="flex-1 accent-amber-300"
                        />
                        <input
                          type="number"
                          min={opts.minRaiseTo}
                          max={opts.maxRaiseTo}
                          value={raiseAmt}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v)) setRaiseAmt(Math.max(opts.minRaiseTo, Math.min(opts.maxRaiseTo, v)));
                          }}
                          className="w-24 px-2 py-1 rounded bg-black/40 border border-white/10 text-white text-sm font-mono"
                        />
                      </div>
                      <div className="flex gap-1">
                        {presets.map((p) => (
                          <button
                            key={p.label}
                            onClick={() => setRaiseAmt(p.to)}
                            className="flex-1 px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/5"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 max-h-72 overflow-y-auto">
              <div className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Hand Log</div>
              <div className="space-y-1 text-xs font-mono text-zinc-300">
                {state.log.slice(-30).reverse().map((entry, i) => (
                  <div key={i} className={
                    entry.text.includes("---") ? "text-amber-300 font-bold" :
                    entry.text.includes("wins") ? "text-emerald-300" : ""
                  }>
                    {entry.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {allInBurst && (
          <AllInBurst key={allInBurst.key} name={allInBurst.name} amount={allInBurst.amount} />
        )}

        {reveal && state.showdownResults && (
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
            <div className="text-xs uppercase tracking-wider text-amber-200/80 mb-2">Showdown</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {state.showdownResults[0]?.evaluations.map((ev) => {
                const p = state.players.find((pl) => pl.id === ev.playerId);
                const isWinner = state.showdownResults!.some((r) => r.winners.some((w) => w.playerId === ev.playerId));
                return (
                  <div key={ev.playerId} className={`rounded-lg p-3 border ${isWinner ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-black/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{ev.name}</div>
                      <div className={`text-xs ${isWinner ? "text-amber-300" : "text-zinc-400"}`}>{ev.bestHand.name}</div>
                    </div>
                    <div className="flex gap-1">
                      {p?.holeCards?.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)}
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

function SeatCard({ player, state, reveal, isMe }: { player: PublicPlayer; state: PublicState; reveal: boolean; isMe: boolean }) {
  const isDealer = state.dealerSeat === player.seat;
  const isActive = state.toActSeat === player.seat;
  const showCards = isMe || (reveal && player.inHand && !player.folded);
  const cards = player.holeCards;
  return (
    <div className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition ${
      isActive
        ? "border-amber-300 bg-amber-300/15 shadow-[0_0_28px_8px_rgba(251,191,36,0.55)] animate-[pulse_1.4s_ease-in-out_infinite] scale-[1.04]"
        : "border-white/10 bg-black/30"
    } ${player.folded ? "opacity-40" : ""} ${player.disconnected ? "ring-1 ring-rose-500/50" : ""}`}>
      {isActive && (
        <div className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-amber-300/70 animate-[ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
      )}
      {isDealer && (
        <div
          className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-white to-zinc-200 text-zinc-900 text-sm font-black flex items-center justify-center border-2 border-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          title="Dealer button"
        >
          D
        </div>
      )}
      <div className="flex gap-1">
        {!player.hasHoleCards ? <div className="h-12" /> :
          (showCards && cards
            ? cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
            : Array.from({ length: 2 }).map((_, i) => <PlayingCard key={i} faceDown size="sm" />))
        }
      </div>
      <div className="text-sm font-semibold text-white text-center">
        {player.name}
        {isMe && <span className="text-amber-300 text-xs ml-1">(you)</span>}
      </div>
      <div className="text-xs text-emerald-300 font-mono">{fmtCents(player.chips)}</div>
      {player.bet > 0 && <div className="text-xs text-amber-200 font-mono">bet: {fmtCents(player.bet)}</div>}
      {player.allIn && !player.folded && <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">All-in</div>}
      {player.folded && <div className="text-[10px] uppercase tracking-wider text-zinc-400">Folded</div>}
      {player.disconnected && <div className="text-[10px] uppercase tracking-wider text-rose-300">Offline</div>}
    </div>
  );
}

// Lay out seats with the local player at the bottom center.
function seatPositions(n: number, meIdx: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const cx = 50, cy = 50, rx = 44, ry = 44;
  for (let i = 0; i < n; i++) {
    const offset = ((i - meIdx) + n) % n;
    const angle = Math.PI / 2 + (offset * 2 * Math.PI) / n;
    positions.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return positions;
}
