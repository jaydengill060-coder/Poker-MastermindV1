import { useEffect, useMemo, useState } from "react";
import { legalActions, type ActionInput, type PokerState } from "@/engine/poker";

interface Props {
  state: PokerState;
  heroId: number;
  onAction: (a: ActionInput) => void;
  disabled?: boolean;
}

export function Controls({ state, heroId, onAction, disabled }: Props) {
  const opts = legalActions(state, heroId);
  const isHeroTurn =
    state.toActIdx >= 0 && state.players[state.toActIdx]?.id === heroId && !disabled;

  const [raiseAmt, setRaiseAmt] = useState<number>(opts.minRaiseTo);

  useEffect(() => {
    if (isHeroTurn) setRaiseAmt(opts.minRaiseTo);
  }, [isHeroTurn, opts.minRaiseTo]);

  const hero = state.players.find((p) => p.id === heroId);
  const potCommitted = state.pot;

  const presets = useMemo(() => {
    const cur = state.currentBet;
    const minTo = opts.minRaiseTo;
    const maxTo = opts.maxRaiseTo;
    const half = Math.max(minTo, Math.min(maxTo, cur + Math.floor(potCommitted * 0.5)));
    const pot = Math.max(minTo, Math.min(maxTo, cur + potCommitted));
    return [
      { label: "Min", to: minTo },
      { label: "1/2 Pot", to: half },
      { label: "Pot", to: pot },
      { label: "All-in", to: maxTo },
    ];
  }, [opts.minRaiseTo, opts.maxRaiseTo, state.currentBet, potCommitted]);

  if (!isHeroTurn || !hero) {
    let msg = "Waiting...";
    if (state.phase === "handover") msg = "Hand complete";
    else if (state.toActIdx >= 0 && state.players[state.toActIdx]) {
      const cur = state.players[state.toActIdx];
      if (cur.id !== heroId) msg = `${cur.name} is thinking...`;
    } else if (hero?.folded) msg = "You folded — watching showdown";
    else if (hero?.allIn) msg = "You're all-in";
    return (
      <div className="text-center text-sm text-zinc-400 italic py-4">{msg}</div>
    );
  }

  const callLabel = opts.canCheck
    ? "Check"
    : `Call ${opts.callAmount.toLocaleString()}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => onAction({ type: "fold" })}
          className="flex-1 py-3 rounded-lg bg-rose-700 hover:bg-rose-600 active:bg-rose-800 text-white font-bold uppercase tracking-wide transition"
        >
          Fold
        </button>
        <button
          onClick={() => onAction({ type: opts.canCheck ? "check" : "call" })}
          className="flex-1 py-3 rounded-lg bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-800 text-white font-bold uppercase tracking-wide transition"
        >
          {callLabel}
        </button>
        <button
          disabled={!opts.canRaise}
          onClick={() => onAction({ type: state.currentBet === 0 ? "bet" : "raise", raiseTo: raiseAmt })}
          className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.currentBet === 0 ? `Bet ${raiseAmt}` : `Raise to ${raiseAmt}`}
        </button>
      </div>

      {opts.canRaise && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={opts.minRaiseTo}
              max={opts.maxRaiseTo}
              step={Math.max(1, state.bigBlind)}
              value={raiseAmt}
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
                if (!Number.isNaN(v)) {
                  setRaiseAmt(Math.max(opts.minRaiseTo, Math.min(opts.maxRaiseTo, v)));
                }
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
  );
}
