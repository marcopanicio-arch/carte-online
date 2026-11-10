// Mazzo da 40 carte napoletane, condiviso da briscola e scopa.

export const SUITS = ["denari", "coppe", "spade", "bastoni"] as const;
export type Suit = (typeof SUITS)[number];

/** 1 = Asso, 2..7 = numeri, 8 = Fante, 9 = Cavallo, 10 = Re */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface Card {
  id: string; // es. "coppe-1"
  suit: Suit;
  rank: Rank;
}

export const SUIT_NAMES: Record<Suit, string> = {
  denari: "Denari",
  coppe: "Coppe",
  spade: "Spade",
  bastoni: "Bastoni",
};

const RANK_NAMES: Record<Rank, string> = {
  1: "Asso",
  2: "Due",
  3: "Tre",
  4: "Quattro",
  5: "Cinque",
  6: "Sei",
  7: "Sette",
  8: "Fante",
  9: "Cavallo",
  10: "Re",
};

export function rankName(rank: Rank): string {
  return RANK_NAMES[rank];
}

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} di ${SUIT_NAMES[card.suit]}`;
}

export function makeCard(suit: Suit, rank: Rank): Card {
  return { id: `${suit}-${rank}`, suit, rank };
}

export function fullDeck(): Card[] {
  return SUITS.flatMap((s) => RANKS.map((r) => makeCard(s, r)));
}

/** PRNG deterministico (mulberry32): stesso seed = stessa mescolata. Utile lato server. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
