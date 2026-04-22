import { useState } from "react";

interface Props {
  onStart: (opts: { numOpponents: number; startingChips: number; smallBlind: number; humanName: string }) => void;
}

export function SetupScreen({ onStart }: Props) {
  const [numOpponents, setNumOpponents] = useState(3);
  const [chips, setChips] = useState(2000);
  const [sb, setSb] = useState(10);
  const [name, setName] = useState("You");

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="w-full max-w-md bg-zinc-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-amber-300 tracking-wide">Ace Up Poker</h1>
          <p className="text-zinc-400 text-sm mt-1">No-Limit Texas Hold'em vs the bots</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-white focus:outline-none focus:border-amber-300"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-2">
              Opponents: <span className="text-amber-300 font-bold">{numOpponents}</span>
            </label>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={numOpponents}
              onChange={(e) => setNumOpponents(Number(e.target.value))}
              className="w-full accent-amber-300"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>1</span><span>8</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Starting Chips</label>
              <select
                value={chips}
                onChange={(e) => setChips(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-white"
              >
                <option value={1000}>1,000</option>
                <option value={2000}>2,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Small Blind</label>
              <select
                value={sb}
                onChange={(e) => setSb(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/10 text-white"
              >
                <option value={5}>5 / 10</option>
                <option value={10}>10 / 20</option>
                <option value={25}>25 / 50</option>
                <option value={50}>50 / 100</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => onStart({ numOpponents, startingChips: chips, smallBlind: sb, humanName: name })}
            className="w-full py-3 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-zinc-900 font-bold uppercase tracking-wide transition"
          >
            Sit at the Table
          </button>
        </div>
      </div>
    </div>
  );
}
