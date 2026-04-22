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
  const [blindIdx, setBlindIdx] = useState(1);
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
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="w-full max-w-md bg-zinc-900/85 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-amber-300 tracking-wide">Ace Up Poker</h1>
          <p className="text-zinc-400 text-sm mt-1">Online No-Limit Texas Hold'em</p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-white focus:outline-none focus:border-amber-300"
          />
        </div>

        <div className="flex mt-5 mb-4 rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition ${
              tab === "create" ? "bg-amber-400 text-zinc-900" : "bg-black/30 text-zinc-300 hover:bg-black/50"
            }`}
          >
            Host a Lobby
          </button>
          <button
            onClick={() => setTab("join")}
            className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition ${
              tab === "join" ? "bg-amber-400 text-zinc-900" : "bg-black/30 text-zinc-300 hover:bg-black/50"
            }`}
          >
            Join With Code
          </button>
        </div>

        {tab === "create" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Buy-in</label>
              <div className="grid grid-cols-4 gap-2">
                {BUY_IN_OPTIONS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBuyIn(b)}
                    className={`py-2 rounded-md text-sm font-bold border ${
                      buyIn === b ? "bg-amber-400 text-zinc-900 border-amber-300" : "bg-black/40 text-white border-white/10 hover:bg-black/60"
                    }`}
                  >
                    {fmtCents(b)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Pay Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRakeMode("blinds")}
                  className={`py-2 rounded-md text-sm font-bold border ${
                    rakeMode === "blinds" ? "bg-amber-400 text-zinc-900 border-amber-300" : "bg-black/40 text-white border-white/10 hover:bg-black/60"
                  }`}
                >
                  Small / Big Blinds
                </button>
                <button
                  onClick={() => setRakeMode("ante")}
                  className={`py-2 rounded-md text-sm font-bold border ${
                    rakeMode === "ante" ? "bg-amber-400 text-zinc-900 border-amber-300" : "bg-black/40 text-white border-white/10 hover:bg-black/60"
                  }`}
                >
                  Flat Ante
                </button>
              </div>
            </div>

            {rakeMode === "blinds" ? (
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Blind Levels</label>
                <select
                  value={blindIdx}
                  onChange={(e) => setBlindIdx(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-white"
                >
                  {BLIND_OPTIONS.map((b, i) => (
                    <option key={i} value={i}>{b.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Ante per Hand (each player)</label>
                <div className="grid grid-cols-3 gap-2">
                  {ANTE_OPTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAnte(a)}
                      className={`py-2 rounded-md text-sm font-bold border ${
                        ante === a ? "bg-amber-400 text-zinc-900 border-amber-300" : "bg-black/40 text-white border-white/10 hover:bg-black/60"
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
              className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-zinc-900 font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Creating..." : "Create Lobby"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Lobby Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5))}
                placeholder="e.g. K9P3X"
                className="w-full px-3 py-3 rounded-md bg-black/40 border border-white/10 text-white text-center text-2xl font-mono tracking-[0.5em] uppercase focus:outline-none focus:border-amber-300"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!canJoin}
              className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-zinc-900 font-bold uppercase tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Joining..." : "Join Lobby"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-rose-900/40 border border-rose-700/50 text-rose-200 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
