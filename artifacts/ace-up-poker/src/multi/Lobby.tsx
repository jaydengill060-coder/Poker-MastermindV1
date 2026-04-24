import { useState } from "react";
import { getSocket } from "./socket";
import { BLIND_OPTIONS, ANTE_OPTIONS, BUY_IN_OPTIONS, fmtCents, type PublicState, type RakeMode } from "./types";

const EXTENDED_BUY_IN_OPTIONS = [50, 100, 500, 1000, 2500, 5000, 10000];

interface Props {
  state: PublicState;
  onLeave: () => void;
}

export function Lobby({ state, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const [buyInStr, setBuyInStr] = useState(() => (state.settings.buyInCents / 100).toFixed(2));
  const isHost = state.isHost;
  const settings = state.settings;
  const blindIdx = BLIND_OPTIONS.findIndex(
    (b) => b.sb === settings.smallBlindCents && b.bb === settings.bigBlindCents,
  );
  const safeBlindIdx = blindIdx >= 0 ? blindIdx : 0;

  const update = (patch: Partial<PublicState["settings"]>) => {
    getSocket().emit("update_settings", patch);
  };

  const start = () => {
    getSocket().emit("start_hand", null);
  };

  const leave = () => {
    getSocket().emit("leave_room", null, () => onLeave());
  };

  const enoughPlayers = state.players.filter((p) => !p.disconnected).length >= 2;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?code=${state.code}`;

  const onCopy = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard failed (permission denied, insecure context, etc.) — leave label unchanged
    }
  };

  const pillBase =
    "btn-press py-1.5 text-xs rounded-lg border transition font-semibold";
  const pillActive =
    "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 border-amber-200 chip-shadow";
  const pillIdle =
    "bg-black/40 text-zinc-300 border-white/10 hover:border-amber-300/40 hover:bg-black/60";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0a3d2a 0%, #051a13 60%, #020a06 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 felt-noise" />
      <div className="relative w-full max-w-2xl">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-300/40 via-amber-200/10 to-emerald-400/30 blur-sm" />
        <div className="relative bg-zinc-950/85 border border-amber-300/20 rounded-2xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-amber-300">Lobby</h1>
              <div className="text-xs text-zinc-400 mt-1 tracking-wide">Share this code so others can join</div>
            </div>
            <button
              onClick={leave}
              className="btn-press text-xs px-3 py-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
            >
              Leave
            </button>
          </div>

          <div className="relative flex flex-col items-center gap-2 py-5 rounded-2xl bg-gradient-to-b from-black/60 to-black/20 border border-amber-300/30 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.15),transparent_60%)]" />
            <div className="relative text-[10px] uppercase tracking-[0.35em] text-amber-300/70">Lobby Code</div>
            <div className="relative text-5xl font-mono font-bold text-amber-300 tracking-[0.5em] drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)]">
              {state.code}
            </div>
            <button
              onClick={onCopy}
              className="relative mt-1 text-xs text-zinc-400 hover:text-amber-300 underline underline-offset-4 transition"
            >
              {copied ? "Copied!" : "Copy invite link"}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80">
                Players
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">
                {state.players.length}/9
              </div>
            </div>
            <div className="space-y-1.5">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition ${
                    p.disconnected
                      ? "border-rose-800/60 bg-rose-950/30"
                      : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-200">
                      {p.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="font-semibold text-white">{p.name}</span>
                    {p.id === state.yourId && (
                      <span className="text-[10px] uppercase tracking-wider text-amber-300/90 px-1.5 py-0.5 rounded bg-amber-300/10 border border-amber-300/30">
                        you
                      </span>
                    )}
                    {p.isHost && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                        host
                      </span>
                    )}
                    {p.disconnected && (
                      <span className="text-[10px] uppercase tracking-wider text-rose-300">
                        offline
                      </span>
                    )}
                  </div>
                  <div className="text-emerald-300 font-mono text-sm font-semibold">
                    {fmtCents(p.chips)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-200/80">
                Game Settings
              </div>
              {!isHost && (
                <div className="text-[10px] text-zinc-500 italic">host controls</div>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="sm:col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Buy-in Amount</div>
                {isHost ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-200 font-mono text-sm font-bold">$</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={buyInStr}
                        onChange={(e) => {
                          setBuyInStr(e.target.value);
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.01) update({ buyInCents: Math.round(v * 100) });
                        }}
                        onBlur={() => {
                          const v = parseFloat(buyInStr);
                          const cents = isNaN(v) || v < 0.01 ? settings.buyInCents : Math.round(v * 100);
                          setBuyInStr((cents / 100).toFixed(2));
                          update({ buyInCents: cents });
                        }}
                        className="w-32 px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-amber-200 text-sm font-mono focus:outline-none focus:border-amber-300 transition"
                        placeholder="0.00"
                      />
                      <span className="text-xs text-zinc-500 font-mono">
                        = {fmtCents(settings.buyInCents)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {EXTENDED_BUY_IN_OPTIONS.map((b) => (
                        <button
                          key={b}
                          onClick={() => {
                            setBuyInStr((b / 100).toFixed(2));
                            update({ buyInCents: b });
                          }}
                          className={`${pillBase} px-2.5 ${settings.buyInCents === b ? pillActive : pillIdle}`}
                        >
                          {fmtCents(b)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-200 font-mono text-lg">{fmtCents(settings.buyInCents)}</div>
                )}
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Pay Mode</div>
                {isHost ? (
                  <div className="flex gap-1.5">
                    {(["blinds", "ante"] as RakeMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => update({ rakeMode: m })}
                        className={`flex-1 ${pillBase} ${
                          settings.rakeMode === m ? pillActive : pillIdle
                        }`}
                      >
                        {m === "blinds" ? "Blinds" : "Flat Ante"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-amber-200">
                    {settings.rakeMode === "blinds" ? "Small/Big Blinds" : "Flat Ante"}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Learning Mode</div>
                  {state.handNumber > 0 && (
                    <div className="text-[10px] text-zinc-500 italic">Locked once dealt</div>
                  )}
                </div>
                {isHost && state.handNumber === 0 ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => update({ learningMode: true })}
                      className={`flex-1 ${pillBase} ${
                        settings.learningMode ? pillActive : pillIdle
                      }`}
                    >
                      On
                    </button>
                    <button
                      onClick={() => update({ learningMode: false })}
                      className={`flex-1 ${pillBase} ${
                        !settings.learningMode ? pillActive : pillIdle
                      }`}
                    >
                      Off
                    </button>
                  </div>
                ) : (
                  <div className="text-amber-200 text-sm">
                    {settings.learningMode ? "On — coach panel during your turn" : "Off"}
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 mt-1.5 leading-snug">
                  Shows each player a private analysis panel (hand, win%, pot odds, outs) on their turn. Must be set before the first hand.
                </div>
              </div>

              {settings.rakeMode === "blinds" ? (
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Blind Levels</div>
                  {isHost ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      {BLIND_OPTIONS.map((b, i) => (
                        <button
                          key={i}
                          onClick={() => update({ smallBlindCents: b.sb, bigBlindCents: b.bb })}
                          className={`${pillBase} ${
                            safeBlindIdx === i ? pillActive : pillIdle
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-amber-200 font-mono">
                      {fmtCents(settings.smallBlindCents)} / {fmtCents(settings.bigBlindCents)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Ante per Hand</div>
                  {isHost ? (
                    <div className="flex gap-1.5">
                      {ANTE_OPTIONS.map((a) => (
                        <button
                          key={a}
                          onClick={() => update({ anteCents: a })}
                          className={`flex-1 ${pillBase} ${
                            settings.anteCents === a ? pillActive : pillIdle
                          }`}
                        >
                          {fmtCents(a)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-amber-200 font-mono">{fmtCents(settings.anteCents)} each</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {isHost ? (
            <button
              onClick={start}
              disabled={!enoughPlayers}
              className="btn-press w-full py-3.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-900 font-black uppercase tracking-[0.2em] text-sm chip-shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {enoughPlayers ? "Deal First Hand" : "Waiting for players (min 2)"}
            </button>
          ) : (
            <div className="text-center py-3 text-zinc-400 italic text-sm">
              Waiting for host to deal the first hand...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
