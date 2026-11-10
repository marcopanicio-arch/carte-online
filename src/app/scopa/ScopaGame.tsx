"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { preloadCards } from "@/components/PlayingCard";
import { cardName, randomSeed } from "@/lib/carte/cards";
import { type Difficulty, chooseMove } from "@/lib/scopa/ai";
import type { ScopaState } from "@/lib/scopa/engine";
import { sounds } from "@/lib/sound";
import { save } from "@/lib/storage";
import { CPU, HUMAN, type Record3, type Stats, init, reducer } from "./state";
import { vibrate } from "../briscola/BriscolaTable";
import t from "../briscola/briscola.module.css";
import s from "./scopa.module.css";
import ScopaTable, { ScoreTable } from "./ScopaTable";

const CPU_DELAY = 850;
const STAGE_MS = 750; // quanto resta visibile la presa prima di portarla via

export default function ScopaGame() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const { game, staging, selecting } = state;

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

  return (
    <ScopaTable
      title={`Scopa · ${game.scores[HUMAN]} – ${game.scores[CPU]}`}
      info={`a ${game.target}`}
      onExit={() => dispatch({ type: "menu" })}
      oppName="Computer"
      oppCount={game.hands[CPU].length}
      captured={[game.captured[HUMAN].length, game.captured[CPU].length]}
      scope={[game.scope[HUMAN], game.scope[CPU]]}
      piles={[state.piles[HUMAN], state.piles[CPU]]}
      deckCount={game.deck.length}
      table={game.table}
      played={staging ? { card: staging.card, byMe: staging.player === HUMAN } : null}
      takingIds={staging?.captureIds ?? []}
      selectableIds={new Set(selecting?.options.flat() ?? [])}
      pickedIds={selecting?.picked ?? []}
      selectedCardId={selecting?.cardId ?? null}
      message={message}
      myTurn={myTurn}
      myHand={game.hands[HUMAN]}
      onHandCard={(cardId) => {
        if (!myTurn) return;
        vibrate();
        dispatch({ type: "select", cardId });
      }}
      onTableCard={(cardId) => dispatch({ type: "pick", cardId })}
      scopaBanner={state.banner}
      dealOrder={game.dealer === HUMAN ? "opp-first" : "me-first"}
    >
      {game.phase !== "playing" && (
        <RoundScreen
          game={game}
          record={state.stats[state.difficulty]}
          onNext={() => dispatch({ type: "nextRound", seed: randomSeed() })}
          onAgain={() => dispatch({ type: "start", difficulty: state.difficulty, target: state.target, seed: randomSeed() })}
          onMenu={() => dispatch({ type: "menu" })}
        />
      )}
    </ScopaTable>
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

  return (
    <div className={t.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={t.panel}>
        <h2 className={t.panelTitle}>{title}</h2>
        <ScoreTable score={r} totals={game.scores} me={HUMAN} oppName="Computer" />
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
