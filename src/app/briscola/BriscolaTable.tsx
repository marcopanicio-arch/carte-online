"use client";

// Il tavolo da gioco, solo grafica: lo usano sia la partita contro il computer sia quella online.

import { type ReactNode, useRef } from "react";
import MuteButton from "@/components/MuteButton";
import PlayingCard from "@/components/PlayingCard";
import { useCardMotion } from "@/components/useCardMotion";
import type { Card, Suit } from "@/lib/carte/cards";
import styles from "./briscola.module.css";

export interface TablePlay {
  mine: boolean;
  card: Card;
}

export interface BriscolaTableProps {
  title: string;
  info?: string;
  onExit: () => void;
  exitLabel?: string;
  oppName: string;
  oppStatus?: string;
  oppCount: number;
  oppCaptured: number;
  myCaptured: number;
  deckCount: number;
  briscola: Card;
  trump: Suit;
  plays: TablePlay[];
  /** Verso chi vanno le carte raccolte, mentre la mano viene portata via. */
  collectingTo: "me" | "opp" | null;
  /** Chi pesca per primo (chi ha preso l'ultima mano). */
  drawFirst: "me" | "opp";
  message: string;
  myTurn: boolean;
  myHand: Card[];
  onPlay: (cardId: string) => void;
  children?: ReactNode;
}

export default function BriscolaTable(p: BriscolaTableProps) {
  const rootRef = useRef<HTMLElement>(null);
  useCardMotion(rootRef, { dealOrder: p.drawFirst === "me" ? "me-first" : "opp-first" });

  const collectClass = p.collectingTo === "me" ? styles.toBottom : p.collectingTo === "opp" ? styles.toTop : "";

  return (
    <main className={styles.table} ref={rootRef}>
      <header className={styles.bar}>
        <button className={styles.barBtn} onClick={p.onExit}>
          ‹ {p.exitLabel ?? "Esci"}
        </button>
        <span className={styles.barTitle}>{p.title}</span>
        <span className={styles.barInfo}>
          {p.info}
          <MuteButton className={styles.muteBtn} />
        </span>
      </header>

      <section className={styles.opponent} aria-label={`Mano di ${p.oppName}`}>
        <div className={styles.oppHand} data-anchor="opp">
          {Array.from({ length: p.oppCount }, (_, i) => (
            <div key={i} className={styles.oppCard} data-flip={`opp-${i}`} data-from="deck" data-deal data-owner="opp">
              <PlayingCard card={null} />
            </div>
          ))}
        </div>
        <div className={styles.label}>
          {p.oppName}
          {p.oppStatus ? ` · ${p.oppStatus}` : ""} · {p.oppCaptured} carte prese
        </div>
      </section>

      <section className={styles.middle}>
        <div className={styles.deckArea} aria-label={`Mazzo: ${p.deckCount} carte`}>
          {p.deckCount > 0 && (
            <div className={styles.briscola}>
              <PlayingCard card={p.briscola} />
            </div>
          )}
          <div className={styles.deck} data-anchor="deck" style={{ visibility: p.deckCount > 1 ? "visible" : "hidden" }}>
            <PlayingCard card={null} />
            <span className={styles.deckCount}>{p.deckCount}</span>
          </div>
          <div className={styles.trumpTag}>
            Briscola: <strong>{p.trump}</strong>
          </div>
        </div>

        <div className={styles.trick}>
          {p.plays.map((play) => (
            <div
              key={play.card.id}
              data-flip={play.card.id}
              data-from={play.mine ? undefined : "opp"}
              className={`${styles.trickCard} ${play.mine ? styles.fromBottom : styles.fromTop} ${collectClass}`}
            >
              <PlayingCard card={play.card} />
            </div>
          ))}
        </div>
      </section>

      <div className={`${styles.message} ${p.myTurn ? styles.messageActive : ""}`} aria-live="polite">
        {p.message}
      </div>

      <section className={styles.myHand} aria-label="La tua mano">
        {p.myHand.map((c) => (
          <button
            key={c.id}
            data-flip={c.id}
            data-from="deck"
            data-deal
            data-owner="me"
            className={`${styles.myCard} ${p.myTurn ? styles.playable : ""}`}
            onClick={() => p.onPlay(c.id)}
            disabled={!p.myTurn}
          >
            <PlayingCard card={c} />
          </button>
        ))}
      </section>
      <div className={styles.label}>Tu · {p.myCaptured} carte prese</div>

      {p.children}
    </main>
  );
}

export function vibrate() {
  try {
    navigator.vibrate?.(12);
  } catch {}
}
