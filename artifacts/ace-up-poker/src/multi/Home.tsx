import { useState } from "react";
import { getSocket } from "./socket";
import { BUY_IN_OPTIONS, BLIND_OPTIONS, ANTE_OPTIONS, type RakeMode, type RoomSettings, fmtCents } from "./types";

interface Props {
  onJoined: (code: string, name: string) => void;
}

export function Home({ onJoined }: Props) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"create" | "join">("create");

  const [buyIn, setBuyIn] = useState(100);
  const [rakeMode, setRakeMode] = useState<RakeMode>("blinds");
  const [blindIdx, setBlindIdx] = useState(0);
  const [ante, setAnte] = useState(50);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && !busy;
  const canJoin = trimmedName.length > 0 && joinCode.trim().length >= 4 && !busy;

  const handleCreate = () => {
    setError(null);
    setBusy(true);
    const settings: RoomSettings = {
      buyInCents: buyIn,
      rakeMode,
      smallBlindCents: BLIND_OPTIONS[blindIdx].sb,
      bigBlindCents: BLIND_OPTIONS[blindIdx].bb,
      anteCents: ante,
    };
    getSocket().emit(
      "create_room",
      { name: trimmedName, settings },
      (res: { ok: boolean; code?: string; error?: string }) => {
        setBusy(false);
        if (!res.ok || !res.code) {
          setError(res.error || "Failed to create room");
          return;
        }
        onJoined(res.code, trimmedName);
      },
    );
  };

  const handleJoin = () => {
    setError(null);
    setBusy(true);
    getSocket().emit(
      "join_room",
      { name: trimmedName, code: joinCode.trim().toUpperCase() },
      (res: { ok: boolean; code?: string; error?: string }) => {
        setBusy(false);
        if (!res.ok || !res.code) {
          setError(res.error || "Failed to join");
          return;
        }
        onJoined(res.code, trimmedName);
      },
    );
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0a3d2a 0%, #051a13 60%, #020a06 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 felt-noise" />
      <div className="pointer-events-none absolute -top-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-300/40 via-amber-200/10 to-emerald-400/30 blur-sm" />
        <div className="relative bg-zinc-950/85 border border-amber-300/20 rounded-2xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 mb-1 text-2xl">
              <span className="text-rose-500">♥</span>
              <span className="text-zinc-100">♠</span>
              <span className="text-rose-500">♦</span>
              <span className="text-zinc-100">♣</span>
            </div>
            <h1 className="font-display text-5xl font-bold shimmer-gold leading-none">Ace Up Poker</h1>
            <p className="text-zinc-400 text-xs mt-2 tracking-[0.3em] uppercase">Online No-Limit Hold&apos;em</p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full px-4 py-2.5 rounded-lg bg-black/50 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 transition"
            />
          </div>

          <div className="flex mt-6 mb-5 rounded-xl overflow-hidden border border-white/10 p-1 bg-black/40">
            <button
              onClick={() => setTab("create")}
              className={`btn-press flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] rounded-lg transition ${
                tab === "create" ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 chip-shadow" : "text-zinc-400 hover:text-amber-200"
              }`}
            >
              Host a Lobby
            </button>
            <button
              onClick={() => setTab("join")}
              className={`btn-press flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] rounded-lg transition ${
                tab === "join" ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 chip-shadow" : "text-zinc-400 hover:text-amber-200"
              }`}
            >
              Join With Code
            </button>
          </div>

          {tab === "create" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Buy-in</label>
                <div className="grid grid-cols-4 gap-2">
                  {BUY_IN_OPTIONS.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBuyIn(b)}
                      className={`btn-press py-2 rounded-lg text-sm font-bold border transition ${
                        buyIn === b
                          ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 border-amber-200 chip-shadow"
                          : "bg-black/40 text-zinc-200 border-white/10 hover:border-amber-300/40 hover:bg-black/60"
                      }`}
                    >
                      {fmtCents(b)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Pay Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRakeMode("blinds")}
                    className={`btn-press py-2 rounded-lg text-sm font-bold border transition ${
                      rakeMode === "blinds"
                        ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 border-amber-200 chip-shadow"
                        : "bg-black/40 text-zinc-200 border-white/10 hover:border-amber-300/40 hover:bg-black/60"
                    }`}
                  >
                    Small / Big Blinds
                  </button>
                  <button
                    onClick={() => setRakeMode("ante")}
                    className={`btn-press py-2 rounded-lg text-sm font-bold border transition ${
                      rakeMode === "ante"
                        ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 border-amber-200 chip-shadow"
                        : "bg-black/40 text-zinc-200 border-white/10 hover:border-amber-300/40 hover:bg-black/60"
                    }`}
                  >
                    Flat Ante
                  </button>
                </div>
              </div>

              {rakeMode === "blinds" ? (
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Blind Levels</label>
                  <select
                    value={blindIdx}
                    onChange={(e) => setBlindIdx(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg bg-black/50 border border-white/10 text-white focus:outline-none focus:border-amber-300"
                  >
                    {BLIND_OPTIONS.map((b, i) => (
                      <option key={i} value={i}>{b.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Ante per Hand (each player)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ANTE_OPTIONS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAnte(a)}
                        className={`btn-press py-2 rounded-lg text-sm font-bold border transition ${
                          ante === a
                            ? "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-900 border-amber-200 chip-shadow"
                            : "bg-black/40 text-zinc-200 border-white/10 hover:border-amber-300/40 hover:bg-black/60"
                        }`}
                      >
                        {fmtCents(a)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="btn-press w-full py-3.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-900 font-black uppercase tracking-[0.2em] text-sm chip-shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {busy ? "Creating..." : "Create Lobby"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-1.5">Lobby Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5))}
                  placeholder="K9P3X"
                  className="w-full px-3 py-3.5 rounded-lg bg-black/50 border border-white/10 text-amber-200 text-center text-3xl font-mono tracking-[0.5em] uppercase focus:outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={!canJoin}
                className="btn-press w-full py-3.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-900 font-black uppercase tracking-[0.2em] text-sm chip-shadow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {busy ? "Joining..." : "Join Lobby"}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-rose-900/40 border border-rose-700/50 text-rose-200 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
