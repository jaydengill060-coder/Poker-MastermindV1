import { type Card, RANK_LABELS, SUIT_SYMBOL } from "@/engine/cards";

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

export function PlayingCard({ card, faceDown, size = "md" }: Props) {
  const sizeClass =
    size === "sm" ? "w-9 h-12 text-sm" : size === "lg" ? "w-20 h-28 text-2xl" : "w-14 h-20 text-lg";

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeClass} rounded-md border border-white/20 shadow-md flex items-center justify-center`}
        style={{
          background:
            "repeating-linear-gradient(45deg, #4a1a2e 0 6px, #6b2440 6px 12px)",
        }}
      >
        <div className="text-amber-300/70 text-xs font-bold tracking-widest">A</div>
      </div>
    );
  }

  const isRed = card.suit === "h" || card.suit === "d";
  return (
    <div
      className={`${sizeClass} rounded-md border border-zinc-300 bg-white shadow-md flex flex-col items-center justify-center font-bold ${isRed ? "text-red-600" : "text-zinc-900"}`}
    >
      <div>{RANK_LABELS[card.rank]}</div>
      <div className="leading-none">{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}
