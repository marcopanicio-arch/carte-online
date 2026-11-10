// Carte napoletane disegnate in SVG: leggere, nitide su ogni schermo, nessuna immagine da scaricare.

import { useId } from "react";
import { type Card, type Suit, cardName, rankName } from "@/lib/carte/cards";

const INK = "#3b2a1a";
const GOLD = "#e0aa3e";
const GOLD_DARK = "#8a5a12";
const RED = "#b3261e";
const BLUE = "#2f5f9e";
const GREEN = "#3c7a3a";
const BROWN = "#8b5a2b";

const SUIT_TINT: Record<Suit, string> = {
  denari: "#f6e3b0",
  coppe: "#f3cfc8",
  spade: "#cfdcef",
  bastoni: "#d4e6c9",
};

/** Simbolo del seme centrato in (x, y), alto circa `s`. */
function SuitMark({ suit, x, y, s }: { suit: Suit; x: number; y: number; s: number }) {
  const k = s / 40; // i disegni sono pensati su un riquadro 40x40
  const t = `translate(${x} ${y}) scale(${k}) translate(-20 -20)`;
  switch (suit) {
    case "denari":
      return (
        <g transform={t}>
          <circle cx="20" cy="20" r="18" fill={GOLD} stroke={GOLD_DARK} strokeWidth="2" />
          <circle cx="20" cy="20" r="12" fill="none" stroke={GOLD_DARK} strokeWidth="1.5" />
          <path
            d="M20 11 L22.5 17.5 L29 20 L22.5 22.5 L20 29 L17.5 22.5 L11 20 L17.5 17.5 Z"
            fill={RED}
            stroke={GOLD_DARK}
            strokeWidth="0.8"
          />
        </g>
      );
    case "coppe":
      return (
        <g transform={t}>
          <path d="M6 4 H34 C34 16 28 22 20 23 C12 22 6 16 6 4 Z" fill={RED} stroke={INK} strokeWidth="1.5" />
          <rect x="5" y="2.5" width="30" height="4" rx="1.5" fill={GOLD} stroke={INK} strokeWidth="1.2" />
          <rect x="17.5" y="23" width="5" height="9" fill={GOLD} stroke={INK} strokeWidth="1.2" />
          <path d="M9 38 C11 32 15 31 20 31 C25 31 29 32 31 38 Z" fill={GOLD} stroke={INK} strokeWidth="1.5" />
        </g>
      );
    case "spade":
      return (
        <g transform={t}>
          <path d="M20 0 L24 6 L24 27 L16 27 L16 6 Z" fill={BLUE} stroke={INK} strokeWidth="1.3" />
          <line x1="20" y1="4" x2="20" y2="26" stroke="#dfe8f5" strokeWidth="1" />
          <rect x="8" y="26" width="24" height="4" rx="2" fill={GOLD} stroke={INK} strokeWidth="1.2" />
          <rect x="17.5" y="30" width="5" height="6" fill={RED} stroke={INK} strokeWidth="1" />
          <circle cx="20" cy="37.5" r="2.5" fill={GOLD} stroke={INK} strokeWidth="1" />
        </g>
      );
    case "bastoni":
      return (
        <g transform={t}>
          <path
            d="M15 39 C14 28 13 14 12 4 C12 1 16 0 19 1 C25 3 28 6 27 10 C25 20 24 30 23 39 Z"
            fill={GREEN}
            stroke={INK}
            strokeWidth="1.4"
          />
          <path d="M14 30 L22 29 M13 20 L25 18 M13 11 L26 9" stroke={BROWN} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
  }
}

/** Posizioni dei simboli per le carte numerate (riquadro 100x160). */
const PIPS: Record<number, [number, number][]> = {
  2: [[50, 52], [50, 108]],
  3: [[50, 40], [50, 80], [50, 120]],
  4: [[32, 52], [68, 52], [32, 108], [68, 108]],
  5: [[32, 46], [68, 46], [50, 80], [32, 114], [68, 114]],
  6: [[32, 42], [68, 42], [32, 80], [68, 80], [32, 118], [68, 118]],
  7: [[32, 40], [68, 40], [50, 62], [32, 85], [68, 85], [32, 122], [68, 122]],
};

function Crown() {
  return (
    <path
      d="M30 40 L34 24 L42 34 L50 20 L58 34 L66 24 L70 40 Z"
      fill={GOLD}
      stroke={INK}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}

function Horseshoe() {
  return (
    <path
      d="M40 40 C36 28 40 20 50 20 C60 20 64 28 60 40"
      fill="none"
      stroke={INK}
      strokeWidth="5"
      strokeLinecap="round"
    />
  );
}

function Feather() {
  return (
    <path
      d="M44 40 C44 30 52 22 60 20 C58 28 54 36 44 40 Z M44 40 L40 44"
      fill={RED}
      stroke={INK}
      strokeWidth="1.3"
    />
  );
}

function CardFace({ card }: { card: Card }) {
  const isFigure = card.rank >= 8;
  const label = card.rank === 1 ? "A" : String(card.rank);
  return (
    <>
      <rect x="1" y="1" width="98" height="158" rx="9" fill="#fbf6e8" stroke="#c9b892" strokeWidth="1.5" />
      <rect x="5" y="5" width="90" height="150" rx="6" fill="none" stroke={RED} strokeWidth="0.8" opacity="0.5" />

      {isFigure ? (
        <>
          <rect x="14" y="16" width="72" height="128" rx="5" fill={SUIT_TINT[card.suit]} stroke={INK} strokeWidth="1" />
          {card.rank === 10 && <Crown />}
          {card.rank === 9 && <Horseshoe />}
          {card.rank === 8 && <Feather />}
          <text
            x="50"
            y="86"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="38"
            fontWeight="700"
            fill={INK}
          >
            {card.rank === 8 ? "F" : card.rank === 9 ? "C" : "R"}
          </text>
          <SuitMark suit={card.suit} x={50} y={112} s={26} />
          <text x="50" y="138" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill={INK}>
            {rankName(card.rank).toUpperCase()}
          </text>
        </>
      ) : card.rank === 1 ? (
        <SuitMark suit={card.suit} x={50} y={80} s={58} />
      ) : (
        PIPS[card.rank].map(([x, y], i) => (
          <SuitMark key={i} suit={card.suit} x={x} y={y} s={card.rank >= 6 ? 26 : 30} />
        ))
      )}

      <text x="10" y="20" fontFamily="Georgia, serif" fontSize="15" fontWeight="700" fill={INK}>
        {label}
      </text>
      <text
        fontFamily="Georgia, serif"
        fontSize="15"
        fontWeight="700"
        fill={INK}
        transform="translate(90 140) rotate(180)"
      >
        {label}
      </text>
    </>
  );
}

function CardBack() {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <defs>
        <pattern id={`p${id}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#7d1d1d" />
          <path d="M0 5 H10 M5 0 V10" stroke="#a83a2e" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="158" rx="9" fill="#fbf6e8" stroke="#c9b892" strokeWidth="1.5" />
      <rect x="6" y="6" width="88" height="148" rx="6" fill={`url(#p${id})`} />
      <circle cx="50" cy="80" r="16" fill="#7d1d1d" stroke={GOLD} strokeWidth="2" />
      <circle cx="50" cy="80" r="9" fill="none" stroke={GOLD} strokeWidth="1.2" />
    </>
  );
}

export default function PlayingCard({ card, className }: { card: Card | null; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 160"
      className={className}
      role="img"
      aria-label={card ? cardName(card) : "Carta coperta"}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      {card ? <CardFace card={card} /> : <CardBack />}
    </svg>
  );
}
