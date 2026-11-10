"use client";

// Tavolo della scopa, solo grafica: lo usano la partita contro il computer e quella online.

import { type ReactNode, useRef } from "react";
import MuteButton from "@/components/MuteButton";
import PlayingCard from "@/components/PlayingCard";
import { useCardMotion } from "@/components/useCardMotion";
import type { Card } from "@/lib/carte/cards";
import type { RoundScore } from "@/lib/scopa/engine";
import t from "../briscola/briscola.module.css";
import s from "./scopa.module.css";

export interface ScopaTableProps {
  title: string;
  info?: string;
  onExit: () => void;
  exitLabel?: string;
  oppName: string;
  oppStatus?: string;
  oppCount: number;
  /** Carte prese e scope: [io, avversario]. */
  captured: [number, number];
  scope: [number, number];
  /** Ultima presa di ciascuno: [io, avversario]. */
  piles: [Card[], Card[]];
  deckCount: number;
  table: Card[];
  /** Carta appena giocata (appoggiata in tavola prima della presa) e chi l'ha giocata. */
  played: { card: Card; byMe: boolean } | null;
  takingIds: string[];
  selectableIds: Set<string>;
  pickedIds: string[];
  selectedCardId: string | null;
  message: string;
  myTurn: boolean;
  myHand: Card[];
  onHandCard: (cardId: string) => void;
  onTableCard: (cardId: string) => void;
  /** Cambia a ogni scopa: fa comparire la scritta. */
  scopaBanner: number;
  dealOrder: "me-first" | "opp-first";
  children?: ReactNode;
}

export default function ScopaTable(p: ScopaTableProps) {
  const rootRef = useRef<HTMLElement>(null);
  useCardMotion(rootRef, { dealOrder: p.dealOrder });

  const tableCards = p.played ? [...p.table, p.played.card] : p.table;

  const pile = (cards: Card[], count: number) => (
    <div className={s.pile} aria-label={`Carte prese: ${count}`}>
      {cards.map((c, i) => (
        <div key={c.id} className={s.pileCard} data-flip={c.id} style={{ translate: `${i * 2}px ${-i * 2}px` }}>
          <PlayingCard card={c} />
        </div>
      ))}
    </div>
  );
  const scopeTag = (n: number) =>
    n > 0 && <span className={s.scopeTag}>{n} scop{n > 1 ? "e" : "a"}</span>;

  return (
    <main ref={rootRef} className={`${t.table} ${s.vars} ${tableCards.length > 8 ? s.compact : ""}`}>
      <header className={t.bar}>
        <button className={t.barBtn} onClick={p.onExit}>
          ‹ {p.exitLabel ?? "Esci"}
        </button>
        <span className={t.barTitle}>{p.title}</span>
        <span className={t.barInfo}>
          {p.info}
          <MuteButton className={t.muteBtn} />
        </span>
      </header>

      <section className={t.opponent} aria-label={`Mano di ${p.oppName}`}>
        <div className={t.oppHand} data-anchor="opp">
          {Array.from({ length: p.oppCount }, (_, i) => (
            <div key={i} className={t.oppCard} data-flip={`opp-${i}`} data-from="deck" data-deal data-owner="opp">
              <PlayingCard card={null} />
            </div>
          ))}
        </div>
        <div className={s.labelRow}>
          <span className={s.labelText}>
            {p.oppName}
            {p.oppStatus ? ` · ${p.oppStatus}` : ""} · {p.captured[1]} carte
            {scopeTag(p.scope[1])}
          </span>
          {pile(p.piles[1], p.captured[1])}
        </div>
      </section>

      <section className={s.middle}>
        <div className={s.deckBox} aria-label={`Mazzo: ${p.deckCount} carte`}>
          <div data-anchor="deck" style={{ visibility: p.deckCount ? "visible" : "hidden" }}>
            <PlayingCard card={null} />
          </div>
          {p.deckCount > 0 && <span className={s.deckCount}>{p.deckCount}</span>}
        </div>
        <div className={s.tableArea} aria-label="Carte in tavola">
          {tableCards.map((c) => {
            const isPlayed = p.played?.card.id === c.id;
            const canPick = p.selectableIds.has(c.id);
            return (
              <button
                key={c.id}
                data-flip={c.id}
                data-from={isPlayed && !p.played?.byMe ? "opp" : "deck"}
                className={[
                  s.tableCard,
                  canPick ? s.selectable : "",
                  p.pickedIds.includes(c.id) ? s.picked : "",
                  p.takingIds.includes(c.id) ? s.taking : "",
                  isPlayed ? s.played : "",
                ].join(" ")}
                disabled={!canPick}
                onClick={() => p.onTableCard(c.id)}
              >
                <PlayingCard card={c} />
              </button>
            );
          })}
        </div>
      </section>

      <div className={`${t.message} ${p.myTurn ? t.messageActive : ""}`} aria-live="polite">
        {p.message}
      </div>

      <section className={t.myHand} aria-label="La tua mano">
        {p.myHand.map((c) => (
          <button
            key={c.id}
            data-flip={c.id}
            data-from="deck"
            data-deal
            data-owner="me"
            className={`${t.myCard} ${p.myTurn ? t.playable : ""} ${p.selectedCardId === c.id ? s.selected : ""}`}
            onClick={() => p.onHandCard(c.id)}
            disabled={!p.myTurn}
          >
            <PlayingCard card={c} />
          </button>
        ))}
      </section>
      <div className={s.labelRow}>
        <span className={s.labelText}>
          Tu · {p.captured[0]} carte
          {scopeTag(p.scope[0])}
        </span>
        {pile(p.piles[0], p.captured[0])}
      </div>

      {p.scopaBanner > 0 && (
        <div key={p.scopaBanner} className={s.banner}>
          Scopa!
        </div>
      )}

      {p.children}
    </main>
  );
}

/** Tabella dei punti di fine mano. `me` è il mio indice di giocatore (0 o 1). */
export function ScoreTable({
  score,
  totals,
  me,
  oppName,
}: {
  score: RoundScore;
  totals: number[];
  me: number;
  oppName: string;
}) {
  const op = 1 - me;
  const pt = (who: number | null, p: number) => (who === p ? <span className={s.pt}>1</span> : null);
  const prim = (v: number | null) => (v === null ? "—" : v);
  const row = (label: string, a: ReactNode, b: ReactNode) => (
    <tr>
      <td>{label}</td>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
  return (
    <table className={s.scoreTable}>
      <thead>
        <tr>
          <th />
          <th>Tu</th>
          <th>{oppName}</th>
        </tr>
      </thead>
      <tbody>
        {row(
          "Carte",
          <>
            {score.cards[me]}
            {pt(score.points.carte, me)}
          </>,
          <>
            {score.cards[op]}
            {pt(score.points.carte, op)}
          </>,
        )}
        {row(
          "Denari",
          <>
            {score.denari[me]}
            {pt(score.points.denari, me)}
          </>,
          <>
            {score.denari[op]}
            {pt(score.points.denari, op)}
          </>,
        )}
        {row(
          "Settebello",
          score.points.settebello === me ? <span className={s.pt}>1</span> : "—",
          score.points.settebello === op ? <span className={s.pt}>1</span> : "—",
        )}
        {row(
          "Primiera",
          <>
            {prim(score.primiera[me])}
            {pt(score.points.primiera, me)}
          </>,
          <>
            {prim(score.primiera[op])}
            {pt(score.points.primiera, op)}
          </>,
        )}
        {row(
          "Scope",
          score.scope[me] ? <span className={s.pt}>{score.scope[me]}</span> : "—",
          score.scope[op] ? <span className={s.pt}>{score.scope[op]}</span> : "—",
        )}
      </tbody>
      <tfoot>
        {row("Questa mano", `+${score.total[me]}`, `+${score.total[op]}`)}
        {row("Totale", totals[me], totals[op])}
      </tfoot>
    </table>
  );
}
