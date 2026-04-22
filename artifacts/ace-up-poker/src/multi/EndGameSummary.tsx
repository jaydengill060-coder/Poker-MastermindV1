import { fmtCents, type FinalSummary } from "./types";

interface Props {
  summary: FinalSummary;
  code: string;
  onLeave: () => void;
}

export function EndGameSummary({ summary, code, onLeave }: Props) {
  const sortedPlayers = [...summary.players].sort((a, b) => b.netCents - a.netCents);

  return (
    <div className="min-h-screen p-6 text-white"
      style={{ background: "radial-gradient(circle at center, #0a3d2a 0%, #051a13 70%)" }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-amber-300 tracking-wide">Game Over</h1>
            <div className="text-sm text-zinc-400 mt-1">
              Lobby <span className="font-mono text-amber-300">{code}</span> · {summary.totalHands} hand{summary.totalHands === 1 ? "" : "s"} played · Buy-in {fmtCents(summary.buyInCents)}
            </div>
          </div>
          <button
            onClick={onLeave}
            className="px-4 py-2 text-sm rounded-md border border-white/10 text-zinc-300 hover:bg-white/5"
          >
            Back to Home
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur p-5">
          <h2 className="text-lg font-bold text-amber-300 mb-3">Player Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-zinc-400 border-b border-white/10">
                  <th className="text-left py-2 pr-3">Player</th>
                  <th className="text-right py-2 px-3">Invested</th>
                  <th className="text-right py-2 px-3">Final</th>
                  <th className="text-right py-2 px-3">Net</th>
                  <th className="text-right py-2 px-3">Hands Won</th>
                  <th className="text-right py-2 pl-3">Win %</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p) => {
                  const positive = p.netCents > 0;
                  const negative = p.netCents < 0;
                  return (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-semibold">
                        {p.name}
                        {p.buyBacks > 0 && (
                          <span className="ml-2 text-xs text-zinc-500">
                            ({p.buyIns}× buy-in, {p.buyBacks} buy-back{p.buyBacks === 1 ? "" : "s"})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmtCents(p.totalInvestedCents)}</td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-300">{fmtCents(p.finalChipsCents)}</td>
                      <td className={`py-2 px-3 text-right font-mono font-bold ${positive ? "text-emerald-300" : negative ? "text-rose-300" : "text-zinc-300"}`}>
                        {positive ? "+" : ""}{fmtCents(p.netCents)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-300">
                        {p.handsWon} / {p.handsPlayed}
                      </td>
                      <td className="py-2 pl-3 text-right font-mono text-zinc-300">
                        {(p.winRate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/70 backdrop-blur p-5">
          <h2 className="text-lg font-bold text-amber-300 mb-3">Settle Up</h2>
          {summary.settlements.length === 0 ? (
            <div className="text-zinc-400 text-sm italic">Everyone broke even. No payments needed.</div>
          ) : (
            <ul className="space-y-2">
              {summary.settlements.map((s, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-black/30 border border-white/10 px-4 py-3">
                  <div className="text-sm">
                    <span className="text-rose-300 font-semibold">{s.fromName}</span>
                    <span className="text-zinc-400"> owes </span>
                    <span className="text-emerald-300 font-semibold">{s.toName}</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-amber-300">{fmtCents(s.cents)}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-zinc-500 italic">
            Amounts shown are exact based on chip totals.
          </p>
        </div>
      </div>
    </div>
  );
}
