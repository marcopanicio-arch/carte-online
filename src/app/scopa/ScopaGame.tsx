"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import MuteButton from "@/components/MuteButton";
import PlayingCard, { preloadCards } from "@/components/PlayingCard";
import { useCardMotion } from "@/components/useCardMotion";
import { type Card, cardName, randomSeed } from "@/lib/carte/cards";
import { type Difficulty, chooseMove } from "@/lib/scopa/ai";
import type { ScopaState } from "@/lib/scopa/engine";
import { sounds } from "@/lib/sound";
import { save } from "@/lib/storage";
import { CPU, HUMAN, type Record3, type Stats, init, reducer } from "./state";
import { vibrate } from "../briscola/BriscolaTable";
import t from "../briscola/briscola.module.css";
import s from "./scopa.module.css";

const CPU_DELAY = 850;
const STAGE_MS = 750; // quanto resta visibile la presa prima di portarla via

export default function ScopaGame() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const { game, staging, selecting } = state;
  const rootRef = useRef<HTMLElement>(null);
  useCardMotion(rootRef, { dealOrder: game && game.dealer === HUMAN ? "opp-first" : "me-first" });

  useEffect(() => preloadCards(), []);
  useEffect(() => save("scopa:stats", state.stats), [state.stats]);
  useEffect(() => save("scopa:prefs", { difficulty: state.difficulty, target: state.target }), [state.difficulty, state.target]);

  // Turno del computer.
  useEffect(() => {
    if (!game || game.phase !== "playing" || game.turn !== CPU || staging) return;
    const timer = setTimeout(() => {
      dispatch({ type: "stage", player: CPU, move: chooseMove(game, CPU, state.difficulty) });
    }, CPU_DELAY);
    return () => clearTimeout(timer);
  }, [game, staging, state.difficulty]);

  // Mossa mostrata: se prende, lascia vedere cosa prende; se scarta, applica subito.
  useEffect(() => {
    if (!staging) return;
    sounds.play();
    const delay = staging.captureIds.length ? STAGE_MS : 280;
    const timer = setTimeout(() => dispatch({ type: "commit" }), delay);
    return () => clearTimeout(timer);
  }, [staging]);

  // Suoni dopo la mossa.
  const lastMove = game?.lastMove;
  useEffect(() => {
    if (!lastMove || !lastMove.captured.length) return;
    if (lastMove.scopa) sounds.scopa();
    else if (lastMove.player === HUMAN) sounds.take(lastMove.captured.length >= 2 ? 10 : 0);
  }, [lastMove]);
  const phase = game?.phase;
  useEffect(() => {
    if (phase !== "gameOver" || !game) return;
    if (game.winner === HUMAN) sounds.win();
    else sounds.lose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo a fine partita
  }, [phase]);

  if (!game) {
    return (
      <StartScreen
        stats={state.stats}
        difficulty={state.difficulty}
        target={state.target}
        onStart={(difficulty, target) => dispatch({ type: "start", difficulty, target, seed: randomSeed() })}
      />
    );
  }

  const myTurn = game.phase === "playing" && game.turn === HUMAN && !staging;

  // Carte in tavola: durante la mossa mostrata, la carta giocata è appoggiata accanto alle altre.
  const tableCards: Card[] = staging ? [...game.table, staging.card] : game.table;
  const selectableIds = new Set(selecting?.options.flat() ?? []);

  let message: string;
  if (staging) {
    const who = staging.player === HUMAN ? "Prendi" : "Il computer prende";
    if (staging.captureIds.length) message = `${who} con ${cardName(staging.card)}`;
    else message = staging.player === HUMAN ? "Scarti" : "Il computer scarta";
  } else if (game.phase !== "playing") {
    message = "Mano finita";
  } else if (selecting) {
    message = "Più prese possibili: tocca le carte da prendere";
  } else if (myTurn) {
    message = "Tocca a te";
  } else {
    message = "Il computer pensa…";
  }

  const pile = (player: number) => (
    <div className={s.pile} aria-label={`Carte prese: ${game.captured[player].length}`}>
      {state.piles[player].map((c, i) => (
        <div key={c.id} className={s.pileCard} data-flip={c.id} style={{ translate: `${i * 2}px ${-i * 2}px` }}>
          <PlayingCard card={c} />
        </div>
      ))}
    </div>
  );

  return (
    <main ref={rootRef} className={`${t.table} ${s.vars} ${tableCards.length > 8 ? s.compact : ""}`}>
      <header className={t.bar}>
        <button className={t.barBtn} onClick={() => dispatch({ type: "menu" })}>
          ‹ Esci
        </button>
        <span className={t.barTitle}>
          Scopa · {game.scores[HUMAN]} – {game.scores[CPU]}
        </span>
        <span className={t.barInfo}>
          a {game.target}
          <MuteButton className={t.muteBtn} />
        </span>
      </header>

      <section className={t.opponent} aria-label="Mano del computer">
        <div className={t.oppHand} data-anchor="opp">
          {game.hands[CPU].map((_, i) => (
            <div key={i} className={t.oppCard} data-flip={`opp-${i}`} data-from="deck" data-deal data-owner="opp">
              <PlayingCard card={null} />
            </div>
          ))}
        </div>
        <div className={s.labelRow}>
          <span className={s.labelText}>
            Computer · {game.captured[CPU].length} carte
            {game.scope[CPU] > 0 && <span className={s.scopeTag}>{game.scope[CPU]} scop{game.scope[CPU] > 1 ? "e" : "a"}</span>}
          </span>
          {pile(CPU)}
        </div>
      </section>

      <section className={s.middle}>
        <div className={s.deckBox} aria-label={`Mazzo: ${game.deck.length} carte`}>
          <div data-anchor="deck" style={{ visibility: game.deck.length ? "visible" : "hidden" }}>
            <PlayingCard card={null} />
          </div>
          {game.deck.length > 0 && <span className={s.deckCount}>{game.deck.length}</span>}
        </div>
        <div className={s.tableArea} aria-label="Carte in tavola">
          {tableCards.map((c) => {
            const isPlayed = staging?.card.id === c.id;
            const isTaking = staging?.captureIds.includes(c.id);
            const canPick = selectableIds.has(c.id);
            return (
              <button
                key={c.id}
                data-flip={c.id}
                data-from={isPlayed && staging?.player === CPU ? "opp" : "deck"}
                className={[
                  s.tableCard,
                  canPick ? s.selectable : "",
                  selecting?.picked.includes(c.id) ? s.picked : "",
                  isTaking ? s.taking : "",
                  isPlayed ? s.played : "",
                ].join(" ")}
                disabled={!canPick}
                onClick={() => dispatch({ type: "pick", cardId: c.id })}
              >
                <PlayingCard card={c} />
              </button>
            );
          })}
        </div>
      </section>

      <div className={`${t.message} ${myTurn ? t.messageActive : ""}`} aria-live="polite">
        {message}
      </div>

      <section className={t.myHand} aria-label="La tua mano">
        {game.hands[HUMAN].map((c) => (
          <button
            key={c.id}
            data-flip={c.id}
            data-from="deck"
            data-deal
            data-owner="me"
            className={`${t.myCard} ${myTurn ? t.playable : ""} ${selecting?.cardId === c.id ? s.selected : ""}`}
            onClick={() => {
              if (!myTurn) return;
              vibrate();
              dispatch({ type: "select", cardId: c.id });
            }}
            disabled={!myTurn}
          >
            <PlayingCard card={c} />
          </button>
        ))}
      </section>
      <div className={s.labelRow}>
        <span className={s.labelText}>
          Tu · {game.captured[HUMAN].length} carte
          {game.scope[HUMAN] > 0 && <span className={s.scopeTag}>{game.scope[HUMAN]} scop{game.scope[HUMAN] > 1 ? "e" : "a"}</span>}
        </span>
        {pile(HUMAN)}
      </div>

      {state.banner > 0 && game.lastMove?.scopa && !staging && (
        <div key={state.banner} className={s.banner}>
          Scopa!
        </div>
      )}

      {game.phase !== "playing" && (
        <RoundScreen
          game={game}
          record={state.stats[state.difficulty]}
          onNext={() => dispatch({ type: "nextRound", seed: randomSeed() })}
          onAgain={() => dispatch({ type: "start", difficulty: state.difficulty, target: state.target, seed: randomSeed() })}
          onMenu={() => dispatch({ type: "menu" })}
        />
      )}
    </main>
  );
}

function StartScreen({
  stats,
  difficulty,
  target,
  onStart,
}: {
  stats: Stats;
  difficulty: Difficulty;
  target: number;
  onStart: (d: Difficulty, target: number) => void;
}) {
  const [tgt, setTgt] = useState(target);
  return (
    <main className={t.table}>
      <header className={t.bar}>
        <Link href="/" className={t.barBtn}>
          ‹ Menu
        </Link>
        <span className={t.barTitle}>Scopa</span>
        <span />
      </header>
      <div className={t.panel}>
        <h1 className={t.panelTitle}>Scopa contro il computer</h1>
        <div className={s.targetRow}>
          Si gioca a
          {[11, 21].map((v) => (
            <button key={v} className={`${s.targetBtn} ${tgt === v ? s.targetBtnOn : ""}`} onClick={() => setTgt(v)}>
              {v}
            </button>
          ))}
          punti
        </div>
        {(["facile", "normale"] as Difficulty[]).map((d) => (
          <button
            key={d}
            className={`${t.bigBtn} ${d === difficulty ? t.bigBtnPrimary : ""}`}
            onClick={() => onStart(d, tgt)}
          >
            <span>{d === "facile" ? "Facile" : "Normale"}</span>
            <small>
              {stats[d].vinte} vinte · {stats[d].perse} perse
            </small>
          </button>
        ))}
        <details className={t.rules}>
          <summary>Regole in breve</summary>
          <ul>
            <li>3 carte a testa e 4 scoperte in tavola. Finite le carte, se ne danno altre 3.</li>
            <li>Valori: Asso 1, dal 2 al 7 il numero, Fante 8, Cavallo 9, Re 10.</li>
            <li>
              Si prende una carta di pari valore o più carte che sommate fanno il valore giocato. Se c&apos;è la carta
              uguale, va presa quella. Se si può prendere, si deve prendere.
            </li>
            <li>Scopa: prendere tutte le carte in tavola (non vale all&apos;ultima giocata).</li>
            <li>A fine mano le carte rimaste vanno a chi ha preso per ultimo.</li>
            <li>
              Punti: carte (più di 20), denari (più di 5), settebello, primiera e una per ogni scopa. Vince chi arriva
              prima al traguardo.
            </li>
          </ul>
        </details>
      </div>
    </main>
  );
}

function RoundScreen({
  game,
  record,
  onNext,
  onAgain,
  onMenu,
}: {
  game: ScopaState;
  record: Record3;
  onNext: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const r = game.roundScore!;
  const over = game.phase === "gameOver";
  const title = over ? (game.winner === HUMAN ? "Hai vinto la partita!" : "Ha vinto il computer") : `Fine della mano ${game.round}`;
  const pt = (who: number | null, p: number) => (who === p ? <span className={s.pt}>1</span> : null);
  const prim = (v: number | null) => (v === null ? "—" : v);

  return (
    <div className={t.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={t.panel}>
        <h2 className={t.panelTitle}>{title}</h2>
        <table className={s.scoreTable}>
          <thead>
            <tr>
              <th />
              <th>Tu</th>
              <th>Computer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Carte</td>
              <td>
                {r.cards[0]}
                {pt(r.points.carte, 0)}
              </td>
              <td>
                {r.cards[1]}
                {pt(r.points.carte, 1)}
              </td>
            </tr>
            <tr>
              <td>Denari</td>
              <td>
                {r.denari[0]}
                {pt(r.points.denari, 0)}
              </td>
              <td>
                {r.denari[1]}
                {pt(r.points.denari, 1)}
              </td>
            </tr>
            <tr>
              <td>Settebello</td>
              <td>{r.points.settebello === 0 ? <span className={s.pt}>1</span> : "—"}</td>
              <td>{r.points.settebello === 1 ? <span className={s.pt}>1</span> : "—"}</td>
            </tr>
            <tr>
              <td>Primiera</td>
              <td>
                {prim(r.primiera[0])}
                {pt(r.points.primiera, 0)}
              </td>
              <td>
                {prim(r.primiera[1])}
                {pt(r.points.primiera, 1)}
              </td>
            </tr>
            <tr>
              <td>Scope</td>
              <td>{r.scope[0] ? <span className={s.pt}>{r.scope[0]}</span> : "—"}</td>
              <td>{r.scope[1] ? <span className={s.pt}>{r.scope[1]}</span> : "—"}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Questa mano</td>
              <td>+{r.total[0]}</td>
              <td>+{r.total[1]}</td>
            </tr>
            <tr>
              <td>Totale</td>
              <td>{game.scores[0]}</td>
              <td>{game.scores[1]}</td>
            </tr>
          </tfoot>
        </table>
        {game.leftover && (
          <p className={s.small}>
            Le {game.leftover.cards.length} carte rimaste in tavola sono andate{" "}
            {game.leftover.player === HUMAN ? "a te" : "al computer"}, che ha preso per ultimo.
          </p>
        )}
        {over ? (
          <>
            <p className={t.panelText}>
              Bilancio: {record.vinte} vinte · {record.perse} perse
            </p>
            <button className={`${t.bigBtn} ${t.bigBtnPrimary}`} onClick={onAgain}>
              Rivincita
            </button>
            <button className={t.bigBtn} onClick={onMenu}>
              Menu scopa
            </button>
          </>
        ) : (
          <>
            {Math.max(...game.scores) >= game.target && (
              <p className={s.small}>Pari al traguardo: si gioca un&apos;altra mano.</p>
            )}
            <button className={`${t.bigBtn} ${t.bigBtnPrimary}`} onClick={onNext}>
              Prossima mano
            </button>
          </>
        )}
      </div>
    </div>
  );
}
