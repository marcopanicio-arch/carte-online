// Carte napoletane classiche (Wikimedia Commons, pubblico dominio — autore Trocche100).
// Le immagini sono in public/carte/<seme>-<numero>.webp, il retro in public/carte/retro.webp.

import { type Card, SUITS, RANKS, cardName } from "@/lib/carte/cards";
import styles from "./PlayingCard.module.css";

export const cardSrc = (card: Card | null) => (card ? `/carte/${card.id}.webp` : "/carte/retro.webp");

export const ALL_CARD_SRCS = [
  ...SUITS.flatMap((s) => RANKS.map((r) => `/carte/${s}-${r}.webp`)),
  "/carte/retro.webp",
];

/** Scarica in anticipo tutte le carte, così non "lampeggiano" quando compaiono la prima volta. */
export function preloadCards() {
  for (const src of ALL_CARD_SRCS) {
    const img = new Image();
    img.src = src;
  }
}

export default function PlayingCard({ card, className }: { card: Card | null; className?: string }) {
  return (
    <div className={`${styles.card} ${card ? styles.face : styles.back} ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- immagini statiche già ottimizzate */}
      <img src={cardSrc(card)} alt={card ? cardName(card) : "Carta coperta"} draggable={false} />
    </div>
  );
}
