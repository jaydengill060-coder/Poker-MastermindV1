import { type Card, RANK_LABELS, SUIT_SYMBOL } from "@/engine/cards";

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PlayingCard({ card, faceDown, size = "md" }: Props) {
  const dims =
    size === "sm"
      ? { box: "w-10 h-14", rank: "text-base", suit: "text-lg", center: "text-xl", pad: "p-1" }
      : size === "lg"
      ? { box: "w-20 h-28", rank: "text-2xl", suit: "text-3xl", center: "text-5xl", pad: "p-2" }
      : { box: "w-14 h-20", rank: "text-lg", suit: "text-xl", center: "text-3xl", pad: "p-1.5" };

  if (faceDown || !card) {
    return (
      <div
        className={`${dims.box} rounded-lg border border-amber-300/30 shadow-[0_4px_10px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden`}
        style={{
          background:
            "linear-gradient(135deg, #4a1a2e 0%, #6b2440 50%, #4a1a2e 100%)",
        }}
      >
        <div
          className="absolute inset-1 rounded-md border border-amber-300/20"
          style={{
            background:
              "repeating-linear-gradient(45deg, rgba(251,191,36,0.08) 0 4px, transparent 4px 9px), repeating-linear-gradient(-45deg, rgba(251,191,36,0.06) 0 4px, transparent 4px 9px)",
          }}
        />
        <div className="relative text-amber-300/80 font-black tracking-[0.2em] text-[10px]">A♠</div>
      </div>
    );
  }

  const isRed = card.suit === "h" || card.suit === "d";
  const colorClass = isRed ? "text-red-600" : "text-zinc-900";
  return (
    <div
      className={`${dims.box} ${dims.pad} rounded-lg border border-zinc-300 bg-gradient-to-br from-white to-zinc-50 shadow-[0_4px_10px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] flex flex-col justify-between font-bold relative overflow-hidden ${colorClass}`}
    >
      <div className={`flex flex-col items-start leading-none ${dims.rank}`}>
        <span>{RANK_LABELS[card.rank]}</span>
        <span className={`${dims.suit} -mt-0.5`}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${dims.center} opacity-95`}>
        {SUIT_SYMBOL[card.suit]}
      </div>
      <div className={`flex flex-col items-end leading-none rotate-180 ${dims.rank}`}>
        <span>{RANK_LABELS[card.rank]}</span>
        <span className={`${dims.suit} -mt-0.5`}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </div>
  );
}
