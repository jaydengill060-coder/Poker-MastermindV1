export type Suit = "s" | "h" | "d" | "c";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ["s", "h", "d", "c"];
export const RANK_LABELS: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "J", 12: "Q", 13: "K", 14: "A",
};
export const SUIT_SYMBOL: Record<Suit, string> = {
  s: "\u2660", h: "\u2665", d: "\u2666", c: "\u2663",
};

export function cardLabel(c: Card): string {
  return RANK_LABELS[c.rank] + SUIT_SYMBOL[c.suit];
}

export function freshDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2 as Rank; r <= 14; r = (r + 1) as Rank) {
      d.push({ suit: s, rank: r });
    }
  }
  return shuffle(d);
}

// Cryptographically-fair Fisher–Yates shuffle (uses crypto when available)
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  const n = a.length;
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  for (let i = n - 1; i > 0; i--) {
    let j: number;
    if (cryptoObj && cryptoObj.getRandomValues) {
      // unbiased index using rejection sampling
      const bound = i + 1;
      const max = Math.floor(0xffffffff / bound) * bound;
      const buf = new Uint32Array(1);
      do {
        cryptoObj.getRandomValues(buf);
      } while (buf[0] >= max);
      j = buf[0] % bound;
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
