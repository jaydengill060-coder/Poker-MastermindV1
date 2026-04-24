import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "./socket";
import { fmtCents, type ActionInput, type PublicPlayer, type PublicState } from "./types";
import { PlayingCard } from "@/components/PlayingCard";
import { AllInBurst } from "./AllInBurst";
import { TableMood } from "./TableMood";

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
      { label: "½ Pot", to: half },
      { label: "Pot", to: pot },
      { label: "All-in", to: maxTo },
    ];
  }, [opts.minRaiseTo, opts.maxRaiseTo, state.currentBet, state.pot]);

  return (
    <div
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0a3d2a 0%, #051a13 60%, #020a06 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-25 felt-noise" />
      <div className="relative max-w-7xl mx-auto p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-bold text-amber-300 tracking-wide leading-none">Ace Up Poker</h1>
            <div className="text-[11px] text-zinc-400 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Lobby</span>
                <span className="text-amber-300 font-mono font-bold">{state.code}</span>
              </span>
              <span className="text-zinc-600">·</span>
              <span>Hand <span className="text-zinc-300 font-mono">#{state.handNumber}</span></span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 font-mono">
                {state.settings.rakeMode === "blinds"
                  ? `${fmtCents(state.settings.smallBlindCents)}/${fmtCents(state.settings.bigBlindCents)}`
                  : `${fmtCents(state.settings.anteCents)} ante`}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] uppercase tracking-wider font-bold">
                {phaseLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!endVote && (
              <button
                onClick={startEndVote}
                className="btn-press px-3 py-1.5 text-xs rounded-md border border-rose-700/60 text-rose-200 hover:bg-rose-900/30 font-semibold uppercase tracking-wider"
              >
                End Game
              </button>
            )}
            <button
              onClick={leave}
              className="btn-press px-3 py-1.5 text-xs rounded-md border border-white/10 text-zinc-300 hover:bg-white/5 font-semibold uppercase tracking-wider"
            >
              Leave
            </button>
          </div>
        </div>

        {endVote && (
          <div className="mb-4 rounded-2xl border border-amber-300/40 bg-gradient-to-b from-amber-300/15 to-amber-300/5 p-4 backdrop-blur">
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
                  className="text-xs text-amber-200/70 hover:text-amber-100 underline underline-offset-4"
                >
                  Cancel vote
                </button>
              )}
            </div>
            {myVote === null ? (
              <div className="flex gap-2">
                <button
                  onClick={() => castVote(true)}
                  className="btn-press flex-1 py-2.5 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-bold uppercase tracking-wider text-sm chip-shadow"
                >
                  Yes, end game
                </button>
                <button
                  onClick={() => castVote(false)}
                  className="btn-press flex-1 py-2.5 rounded-lg bg-gradient-to-b from-rose-600 to-rose-800 hover:from-rose-500 hover:to-rose-700 text-white font-bold uppercase tracking-wider text-sm chip-shadow"
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
                <div key={v.playerId} className="flex items-center justify-between px-2 py-1 rounded bg-black/30 border border-white/5">
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

        <div className="grid lg:grid-cols-[1fr_300px] gap-4">
          <div
            className="relative aspect-[16/10] rounded-[120px] shadow-[0_30px_80px_rgba(0,0,0,0.7)] overflow-visible"
            style={{
              background: "radial-gradient(ellipse at center, #156a47 0%, #0c4d34 55%, #062719 100%)",
              border: "12px solid",
              borderImage: "linear-gradient(135deg, #6b3410 0%, #a05a1c 50%, #6b3410 100%) 1",
              borderRadius: "120px",
              boxShadow:
                "0 30px 80px rgba(0,0,0,0.7), inset 0 0 60px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(251,191,36,0.15)",
            }}
          >
            <TableMood />
            <div className="absolute inset-4 rounded-[100px] border border-amber-300/15 pointer-events-none" />
            <div className="absolute inset-6 rounded-[95px] border border-emerald-900/30 pointer-events-none" />

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="text-[10px] uppercase tracking-[0.4em] text-amber-200/70">Total Pot</div>
              <div className="text-4xl font-bold text-amber-300 font-mono drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)]">
                {fmtCents(state.pot)}
              </div>
              {state.livePots.length > 1 && state.phase !== "handover" && (
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {state.livePots.map((pot, idx) => {
                    const label = idx === 0 ? "Main" : `Side ${idx}`;
                    return (
                      <div key={idx} className="px-2 py-1 rounded-md bg-black/50 border border-amber-300/30 text-[11px] text-amber-100">
                        <span className="font-bold">{label}</span>{" "}
                        <span className="font-mono">{fmtCents(pot.amount)}</span>
                        <span className="text-amber-200/60"> · {pot.eligibleIds.length} eligible</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                {Array.from({ length: 5 }).map((_, i) => {
                  const c = state.community[i];
                  return c
                    ? <PlayingCard key={i} card={c} size="md" />
                    : (
                      <div
                        key={i}
                        className="w-14 h-20 rounded-lg border border-white/5 bg-black/15 backdrop-blur-[1px]"
                        style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.4)" }}
                      />
                    );
                })}
              </div>
              {state.lastWinnerSummary && state.phase === "handover" && (
                <div className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-b from-amber-300/25 to-amber-300/10 border border-amber-300/50 text-amber-100 text-sm font-semibold text-center max-w-md shadow-[0_4px_16px_rgba(251,191,36,0.2)]">
                  {state.lastWinnerSummary}
                </div>
              )}
              {state.phase === "handover" && state.showdownResults && state.showdownResults.length > 1 && (
                <div className="mt-2 flex flex-col gap-1 text-xs text-amber-100/90 max-w-md">
                  {state.showdownResults.map((r) => (
                    <div key={r.potIndex} className="px-2 py-1 rounded bg-black/40 border border-amber-300/20">
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
                className="absolute z-10"
                style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%`, transform: "translate(-50%, -50%)" }}
              >
                <SeatCard player={p} state={state} reveal={reveal} isMe={p.id === state.yourId} />
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/60 to-black/50 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-300/80 mb-1">Your Stack</div>
              <div className="text-3xl font-bold text-emerald-300 font-mono drop-shadow-[0_2px_6px_rgba(16,185,129,0.3)]">
                {me ? fmtCents(me.chips) : "$0.00"}
              </div>
              {me && me.bet > 0 && (
                <div className="text-xs text-amber-200 font-mono mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                  In this round: <span className="font-bold">{fmtCents(me.bet)}</span>
                </div>
              )}
              {me && me.chips === 0 && !me.pendingBuyBack && (
                <button
                  onClick={rebuy}
                  className="btn-press mt-2.5 w-full py-2 text-xs rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-bold uppercase tracking-wider chip-shadow"
                >
                  Request Buy Back-In {fmtCents(state.settings.buyInCents)}
                </button>
              )}
              {me && me.pendingBuyBack && (
                <button
                  onClick={confirmBuyBackIn}
                  className="btn-press mt-2.5 w-full py-2 text-xs rounded-lg bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold uppercase tracking-wider chip-shadow"
                >
                  Confirm Buy Back-In
                </button>
              )}
              {me && (
                <div className="mt-2.5 text-[11px] text-zinc-500">
                  Buy-ins: <span className="text-zinc-300">{me.buyIns}</span> · Buy-backs: <span className="text-zinc-300">{me.buyBacks}</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              {state.phase === "handover" ? (
                state.isHost ? (
                  <button
                    onClick={startHand}
                    disabled={!canStartNext}
                    className="btn-press w-full py-3.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-900 font-black uppercase tracking-[0.2em] text-sm chip-shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
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
                    ? <>
                        <span className="text-amber-200 font-semibold not-italic">
                          {state.players[state.toActSeat].name}
                        </span> is thinking...
                      </>
                    : "Waiting..."}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => send({ type: "fold" })}
                      className="btn-press flex-1 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase tracking-wider text-sm border border-zinc-700"
                    >
                      Fold
                    </button>
                    <button
                      onClick={() => send({ type: opts.canCheck ? "check" : "call" })}
                      className="btn-press flex-1 py-3 rounded-lg bg-gradient-to-b from-zinc-600 to-zinc-800 hover:from-zinc-500 hover:to-zinc-700 text-white font-bold uppercase tracking-wider text-sm border border-zinc-500/40 chip-shadow"
                    >
                      {opts.canCheck ? "Check" : `Call ${fmtCents(opts.callAmount)}`}
                    </button>
                    <button
                      disabled={!opts.canRaise}
                      onClick={() => send({ type: state.currentBet === 0 ? "bet" : "raise", raiseTo: raiseAmt })}
                      className="btn-press flex-1 py-3 rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-900 font-black uppercase tracking-wider text-sm chip-shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      {state.currentBet === 0 ? `Bet ${fmtCents(raiseAmt)}` : `Raise ${fmtCents(raiseAmt)}`}
                    </button>
                  </div>
                  {opts.canRaise && (
                    <div className="space-y-2 rounded-lg bg-black/30 border border-white/5 p-2.5">
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
                          className="w-24 px-2 py-1 rounded bg-black/50 border border-white/10 text-amber-200 text-sm font-mono text-right focus:outline-none focus:border-amber-300"
                        />
                      </div>
                      <div className="flex gap-1">
                        {presets.map((p) => (
                          <button
                            key={p.label}
                            onClick={() => setRaiseAmt(p.to)}
                            className="btn-press flex-1 px-2 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-amber-200 border border-white/5 font-semibold uppercase tracking-wider"
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

            <div className="rounded-2xl border border-white/10 bg-black/40 p-3 max-h-72 overflow-y-auto shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 mb-2">Hand Log</div>
              <div className="space-y-1 text-xs font-mono text-zinc-300">
                {state.log.slice(-30).reverse().map((entry, i) => (
                  <div key={i} className={
                    entry.text.includes("---") ? "text-amber-300 font-bold border-t border-amber-300/20 pt-1 mt-1 first:mt-0 first:border-0 first:pt-0" :
                    entry.text.includes("wins") ? "text-emerald-300 font-semibold" :
                    entry.text.includes("folds") ? "text-zinc-500" :
                    entry.text.includes("all-in") || entry.text.includes("All-in") ? "text-rose-300 font-bold" :
                    ""
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
          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-gradient-to-b from-amber-300/10 to-amber-300/5 p-4 backdrop-blur">
            <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80 mb-3">Showdown</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {state.showdownResults[0]?.evaluations.map((ev) => {
                const p = state.players.find((pl) => pl.id === ev.playerId);
                const isWinner = state.showdownResults!.some((r) => r.winners.some((w) => w.playerId === ev.playerId));
                return (
                  <div
                    key={ev.playerId}
                    className={`rounded-lg p-3 border ${
                      isWinner
                        ? "border-amber-300/60 bg-gradient-to-b from-amber-300/20 to-amber-300/5 shadow-[0_4px_16px_rgba(251,191,36,0.2)]"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        {isWinner && <span className="text-amber-300">★</span>}
                        {ev.name}
                      </div>
                      <div className={`text-xs font-bold ${isWinner ? "text-amber-300" : "text-zinc-400"}`}>{ev.bestHand.name}</div>
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
    <div
      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border transition-all duration-200 backdrop-blur-sm ${
        isActive
          ? "border-amber-300 bg-gradient-to-b from-amber-300/25 to-amber-300/10 shadow-[0_0_28px_8px_rgba(251,191,36,0.55)] animate-[pulse_1.4s_ease-in-out_infinite] scale-[1.05]"
          : "border-white/10 bg-black/55"
      } ${player.folded ? "opacity-40 grayscale" : ""} ${player.disconnected ? "ring-1 ring-rose-500/50" : ""}`}
    >
      {isActive && (
        <div className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-amber-300/70 animate-[ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
      )}
      {isDealer && (
        <div
          className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-white via-zinc-100 to-zinc-300 text-zinc-900 text-sm font-black flex items-center justify-center border-2 border-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.8)]"
          title="Dealer button"
        >
          D
        </div>
      )}
      <div className="flex gap-1">
        {!player.hasHoleCards ? <div className="h-14" /> :
          (showCards && cards
            ? cards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
            : Array.from({ length: 2 }).map((_, i) => <PlayingCard key={i} faceDown size="sm" />))
        }
      </div>
      <div className="text-sm font-semibold text-white text-center leading-tight max-w-[110px] truncate">
        {player.name}
        {isMe && <span className="text-amber-300 text-[10px] ml-1 align-middle">(you)</span>}
      </div>
      <div className="flex items-center gap-1 text-xs text-emerald-300 font-mono font-semibold">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
        {fmtCents(player.chips)}
      </div>
      {player.bet > 0 && (
        <div className="px-1.5 py-0.5 rounded-full bg-amber-300/15 border border-amber-300/40 text-[10px] text-amber-200 font-mono font-bold">
          bet {fmtCents(player.bet)}
        </div>
      )}
      {player.allIn && !player.folded && (
        <div className="text-[10px] uppercase tracking-wider text-rose-300 font-black">All-in</div>
      )}
      {player.folded && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Folded</div>
      )}
      {player.disconnected && (
        <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">Offline</div>
      )}
    </div>
  );
}

// Lay out seats with the local player at the bottom center.
function seatPositions(n: number, meIdx: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const cx = 50, cy = 50, rx = 46, ry = 46;
  for (let i = 0; i < n; i++) {
    const offset = ((i - meIdx) + n) % n;
    const angle = Math.PI / 2 + (offset * 2 * Math.PI) / n;
    positions.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return positions;
}
