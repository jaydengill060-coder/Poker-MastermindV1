import { getSocket } from "./socket";
import { BLIND_OPTIONS, ANTE_OPTIONS, BUY_IN_OPTIONS, fmtCents, type PublicState, type RakeMode } from "./types";

interface Props {
  state: PublicState;
  onLeave: () => void;
}

export function Lobby({ state, onLeave }: Props) {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="w-full max-w-2xl bg-zinc-900/85 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-300">Lobby</h1>
            <div className="text-xs text-zinc-400 mt-1">Share this code so others can join</div>
          </div>
          <button onClick={leave} className="text-sm text-zinc-400 hover:text-white">
            Leave
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 py-4 rounded-xl bg-black/40 border border-amber-300/20">
          <div className="text-xs uppercase tracking-widest text-amber-300/70">Lobby Code</div>
          <div className="text-5xl font-mono font-bold text-amber-300 tracking-[0.5em]">{state.code}</div>
          <button
            onClick={() => navigator.clipboard?.writeText(inviteUrl)}
            className="mt-1 text-xs text-zinc-400 hover:text-amber-300 underline"
          >
            Copy invite link
          </button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
            Players ({state.players.length}/9)
          </div>
          <div className="space-y-1">
            {state.players.map((p) => (
              <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-md border ${p.disconnected ? "border-rose-800 bg-rose-950/30" : "border-white/10 bg-black/30"}`}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{p.name}</span>
                  {p.id === state.yourId && <span className="text-xs text-amber-300">(you)</span>}
                  {p.isHost && <span className="text-xs text-emerald-300">[host]</span>}
                  {p.disconnected && <span className="text-xs text-rose-300">[disconnected]</span>}
                </div>
                <div className="text-emerald-300 font-mono text-sm">{fmtCents(p.chips)}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Game Settings {isHost ? "" : "(host controls)"}</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Buy-in</div>
              {isHost ? (
                <div className="flex gap-1">
                  {BUY_IN_OPTIONS.map((b) => (
                    <button
                      key={b}
                      onClick={() => update({ buyInCents: b })}
                      className={`flex-1 py-1.5 text-xs rounded border ${
                        settings.buyInCents === b ? "bg-amber-400 text-zinc-900 border-amber-300 font-bold" : "bg-black/40 text-zinc-300 border-white/10 hover:bg-black/60"
                      }`}
                    >
                      {fmtCents(b)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-white font-mono">{fmtCents(settings.buyInCents)}</div>
              )}
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Pay Mode</div>
              {isHost ? (
                <div className="flex gap-1">
                  {(["blinds", "ante"] as RakeMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => update({ rakeMode: m })}
                      className={`flex-1 py-1.5 text-xs rounded border ${
                        settings.rakeMode === m ? "bg-amber-400 text-zinc-900 border-amber-300 font-bold" : "bg-black/40 text-zinc-300 border-white/10 hover:bg-black/60"
                      }`}
                    >
                      {m === "blinds" ? "Blinds" : "Flat Ante"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-white">{settings.rakeMode === "blinds" ? "Small/Big Blinds" : "Flat Ante"}</div>
              )}
            </div>

            {settings.rakeMode === "blinds" ? (
              <div className="sm:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Blind Levels</div>
                {isHost ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                    {BLIND_OPTIONS.map((b, i) => (
                      <button
                        key={i}
                        onClick={() => update({ smallBlindCents: b.sb, bigBlindCents: b.bb })}
                        className={`py-1.5 text-xs rounded border ${
                          safeBlindIdx === i ? "bg-amber-400 text-zinc-900 border-amber-300 font-bold" : "bg-black/40 text-zinc-300 border-white/10 hover:bg-black/60"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-white font-mono">
                    {fmtCents(settings.smallBlindCents)} / {fmtCents(settings.bigBlindCents)}
                  </div>
                )}
              </div>
            ) : (
              <div className="sm:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Ante per Hand</div>
                {isHost ? (
                  <div className="flex gap-1">
                    {ANTE_OPTIONS.map((a) => (
                      <button
                        key={a}
                        onClick={() => update({ anteCents: a })}
                        className={`flex-1 py-1.5 text-xs rounded border ${
                          settings.anteCents === a ? "bg-amber-400 text-zinc-900 border-amber-300 font-bold" : "bg-black/40 text-zinc-300 border-white/10 hover:bg-black/60"
                        }`}
                      >
                        {fmtCents(a)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-white font-mono">{fmtCents(settings.anteCents)} each</div>
                )}
              </div>
            )}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={start}
            disabled={!enoughPlayers}
            className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-900 font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enoughPlayers ? "Deal First Hand" : "Waiting for players (min 2)"}
          </button>
        ) : (
          <div className="text-center py-3 text-zinc-400 italic">
            Waiting for host to deal the first hand...
          </div>
        )}
      </div>
    </div>
  );
}
