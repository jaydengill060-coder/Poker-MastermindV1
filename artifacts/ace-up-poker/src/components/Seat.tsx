import type { Player, PokerState } from "@/engine/poker";
import { PlayingCard } from "./PlayingCard";

interface Props {
  player: Player;
  state: PokerState;
  reveal: boolean;
  isHero: boolean;
}

export function Seat({ player, state, reveal, isHero }: Props) {
  const isDealer = state.dealerIdx === state.players.indexOf(player);
  const isActive = state.toActIdx >= 0 && state.players[state.toActIdx]?.id === player.id;
  const showCards = reveal || isHero;

  return (
    <div
      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition ${
        isActive
          ? "border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
          : "border-white/10 bg-black/30"
      } ${player.folded ? "opacity-40" : ""}`}
    >
      {isDealer && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-300 text-zinc-900 text-xs font-bold flex items-center justify-center border-2 border-zinc-900">
          D
        </div>
      )}
      <div className="flex gap-1">
        {player.holeCards.length === 0 ? (
          <div className="h-12" />
        ) : (
          player.holeCards.map((c, i) => (
            <PlayingCard key={i} card={showCards ? c : undefined} faceDown={!showCards} size="sm" />
          ))
        )}
      </div>
      <div className="text-sm font-semibold text-white text-center">
        {player.name}
        {isHero && <span className="text-amber-300 text-xs ml-1">(you)</span>}
      </div>
      <div className="text-xs text-emerald-300 font-mono">
        {player.chips.toLocaleString()} chips
      </div>
      {player.bet > 0 && (
        <div className="text-xs text-amber-200 font-mono">
          bet: {player.bet}
        </div>
      )}
      {player.allIn && !player.folded && (
        <div className="text-[10px] uppercase tracking-wider text-rose-300 font-bold">All-in</div>
      )}
      {player.folded && !player.sittingOut && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-400">Folded</div>
      )}
      {player.sittingOut && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Out</div>
      )}
    </div>
  );
}
