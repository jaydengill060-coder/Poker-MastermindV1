import { fmtCents, type FinalSummary } from "./types";

interface Props {
  summary: FinalSummary;
  code: string;
  onLeave: () => void;
}

export function EndGameSummary({ summary, code, onLeave }: Props) {
  const sortedPlayers = [...summary.players].sort((a, b) => b.netCents - a.netCents);
  const winner = sortedPlayers[0];

  return (
    <div
      className="min-h-screen p-6 text-white relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, #0a3d2a 0%, #051a13 60%, #020a06 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 felt-noise" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.4em] text-amber-300/70 mb-1">Game Over</div>
            <h1 className="font-display text-4xl font-bold shimmer-gold leading-none">
              Final Tally
            </h1>
            <div className="text-sm text-zinc-400 mt-2">
              Lobby <span className="font-mono text-amber-300">{code}</span> · {summary.totalHands} hand{summary.totalHands === 1 ? "" : "s"} played · Buy-in {fmtCents(summary.buyInCents)}
            </div>
          </div>
          <button
            onClick={onLeave}
            className="btn-press px-4 py-2 text-sm rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 font-semibold uppercase tracking-wider"
          >
            Back to Home
          </button>
        </div>

        {winner && winner.netCents > 0 && (
          <div className="relative rounded-2xl border border-amber-300/40 bg-gradient-to-b from-amber-300/15 to-amber-300/5 p-5 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.2),transparent_60%)]" />
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 border-2 border-amber-200 chip-shadow flex items-center justify-center text-2xl">
                ★
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/80">Top Winner</div>
                <div className="font-display text-2xl font-bold text-amber-100">{winner.name}</div>
                <div className="font-mono text-emerald-300 font-bold text-lg">+{fmtCents(winner.netCents)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80 mb-3">Player Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/10">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Player</th>
                  <th className="text-right py-2 px-3">Invested</th>
                  <th className="text-right py-2 px-3">Final</th>
                  <th className="text-right py-2 px-3">Net</th>
                  <th className="text-right py-2 px-3">Hands Won</th>
                  <th className="text-right py-2 pl-3">Win %</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, idx) => {
                  const positive = p.netCents > 0;
                  const negative = p.netCents < 0;
                  return (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                      <td className="py-2.5 pr-3 text-zinc-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 pr-3 font-semibold">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 border border-emerald-500/40 flex items-center justify-center text-[11px] font-bold text-emerald-200">
                            {p.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div>{p.name}</div>
                            {p.buyBacks > 0 && (
                              <div className="text-[10px] text-zinc-500 font-normal">
                                {p.buyIns}× buy-in, {p.buyBacks} buy-back{p.buyBacks === 1 ? "" : "s"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{fmtCents(p.totalInvestedCents)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{fmtCents(p.finalChipsCents)}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${positive ? "text-emerald-300" : negative ? "text-rose-300" : "text-zinc-400"}`}>
                        {positive ? "+" : ""}{fmtCents(p.netCents)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                        {p.handsWon} / {p.handsPlayed}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono text-zinc-300">
                        {(p.winRate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <h2 className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80 mb-3">Settle Up</h2>
          {summary.settlements.length === 0 ? (
            <div className="text-zinc-400 text-sm italic py-2">Everyone broke even. No payments needed.</div>
          ) : (
            <ul className="space-y-2">
              {summary.settlements.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-4 py-3 hover:border-amber-300/30 transition"
                >
                  <div className="text-sm flex items-center gap-2">
                    <span className="text-rose-300 font-semibold">{s.fromName}</span>
                    <span className="text-zinc-500">→</span>
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
