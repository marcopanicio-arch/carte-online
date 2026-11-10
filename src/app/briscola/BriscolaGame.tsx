"use client";

import Link from "next/link";
import { useEffect, useReducer } from "react";
import { preloadCards } from "@/components/PlayingCard";
import BriscolaTable, { vibrate } from "./BriscolaTable";
import { sounds } from "@/lib/sound";
import { randomSeed } from "@/lib/carte/cards";
import { type Difficulty, chooseCard } from "@/lib/briscola/ai";
import {
  type GameState,
  collectTrick,
  newGame,
  playCard,
  points,
  teamPoints,
  winningTeam,
} from "@/lib/briscola/engine";
import { load, save } from "@/lib/storage";
import styles from "./briscola.module.css";

const HUMAN = 0;
const CPU = 1;
const CPU_DELAY = 750;
const SHOW_TRICK = 900; // quanto restano ferme le due carte sul tavolo
const COLLECT_ANIM = 450; // durata dell'animazione di raccolta

type Record3 = { vinte: number; perse: number; pari: number };
type Stats = Record<Difficulty, Record3>;
const EMPTY_STATS: Stats = {
  facile: { vinte: 0, perse: 0, pari: 0 },
  normale: { vinte: 0, perse: 0, pari: 0 },
};

interface State {
  game: GameState | null;
  /** True mentre le carte della mano appena chiusa vengono portate via. */
  collecting: boolean;
  difficulty: Difficulty;
  dealer: number;
  stats: Stats;
}

type Action =
  | { type: "start"; difficulty: Difficulty; seed: number }
  | { type: "play"; player: number; cardId: string }
  | { type: "beginCollect" }
  | { type: "collect" }
  | { type: "menu" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start": {
      // Il mazziere si alterna: una volta apri tu, una volta il computer.
      const dealer = (state.dealer + 1) % 2;
      return {
        ...state,
        difficulty: action.difficulty,
        dealer,
        collecting: false,
        game: newGame({ numPlayers: 2, seed: action.seed, dealer }),
      };
    }
    case "play": {
      if (!state.game || state.game.turn !== action.player || state.game.phase !== "playing") return state;
      return { ...state, game: playCard(state.game, action.player, action.cardId) };
    }
    case "beginCollect":
      return state.game?.phase === "trickComplete" ? { ...state, collecting: true } : state;
    case "collect": {
      if (!state.game || state.game.phase !== "trickComplete") return state;
      const game = collectTrick(state.game);
      if (game.phase !== "finished") return { ...state, game, collecting: false };
      const w = winningTeam(game);
      const rec = { ...state.stats[state.difficulty] };
      if (w === null) rec.pari++;
      else if (w === HUMAN) rec.vinte++;
      else rec.perse++;
      return { ...state, game, collecting: false, stats: { ...state.stats, [state.difficulty]: rec } };
    }
    case "menu":
      return { ...state, game: null };
  }
}

function init(): State {
  const prefs = load("briscola:prefs", { difficulty: "normale" as Difficulty });
  return {
    game: null,
    collecting: false,
    difficulty: prefs.difficulty,
    dealer: Math.round(Math.random()),
    stats: load("briscola:stats", EMPTY_STATS),
  };
}

export default function BriscolaGame() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const { game } = state;

  useEffect(() => preloadCards(), []);

  // Turno del computer.
  useEffect(() => {
    if (!game || game.phase !== "playing" || game.turn !== CPU) return;
    const t = setTimeout(() => {
      const card = chooseCard(game, CPU, state.difficulty);
      sounds.play();
      dispatch({ type: "play", player: CPU, cardId: card.id });
    }, CPU_DELAY);
    return () => clearTimeout(t);
  }, [game, state.difficulty]);

  // Mano completa: prima si lasciano vedere entrambe le carte, poi si portano via e si pesca.
  useEffect(() => {
    if (game?.phase !== "trickComplete") return;
    const t = setTimeout(
      () => dispatch(state.collecting ? { type: "collect" } : { type: "beginCollect" }),
      state.collecting ? COLLECT_ANIM : SHOW_TRICK,
    );
    return () => clearTimeout(t);
  }, [game, state.collecting]);

  // Suoni: presa con punti e fine partita.
  const phase = game?.phase;
  useEffect(() => {
    if (!game) return;
    if (phase === "trickComplete" && game.trickWinner === HUMAN) {
      const pts = game.table.reduce((s, p) => s + points(p.card), 0);
      if (pts > 0) setTimeout(() => sounds.take(pts), 350);
    }
    if (phase === "finished") {
      const w = winningTeam(game);
      if (w === null) sounds.tie();
      else if (w === HUMAN) sounds.win();
      else sounds.lose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambio di fase
  }, [phase, game?.trickCount]);

  useEffect(() => save("briscola:stats", state.stats), [state.stats]);
  useEffect(() => save("briscola:prefs", { difficulty: state.difficulty }), [state.difficulty]);

  if (!game) {
    return (
      <StartScreen
        stats={state.stats}
        difficulty={state.difficulty}
        onStart={(d) => dispatch({ type: "start", difficulty: d, seed: randomSeed() })}
      />
    );
  }

  const myTurn = game.phase === "playing" && game.turn === HUMAN;
  const onPlay = (cardId: string) => {
    if (!myTurn) return;
    vibrate();
    sounds.play();
    dispatch({ type: "play", player: HUMAN, cardId });
  };

  const trickPts = game.table.reduce((s, p) => s + points(p.card), 0);
  let message: string;
  if (game.phase === "trickComplete") {
    const who = game.trickWinner === HUMAN ? "Prendi tu" : "Prende il computer";
    message = trickPts > 0 ? `${who} · ${trickPts} punti` : who;
  } else if (myTurn) {
    message = game.table.length ? "Rispondi" : "Tocca a te";
  } else {
    message = "Il computer pensa…";
  }

  return (
    <BriscolaTable
      title={`Briscola · ${state.difficulty}`}
      info={`Mano ${Math.min(game.trickCount + 1, 20)}/20`}
      onExit={() => dispatch({ type: "menu" })}
      oppName="Computer"
      oppCount={game.hands[CPU].length}
      oppCaptured={game.captured[CPU].length}
      myCaptured={game.captured[HUMAN].length}
      deckCount={game.deck.length}
      briscola={game.briscola}
      trump={game.trump}
      plays={game.table.map((p) => ({ mine: p.player === HUMAN, card: p.card }))}
      collectingTo={state.collecting ? (game.trickWinner === HUMAN ? "me" : "opp") : null}
      drawFirst={game.leader === HUMAN ? "me" : "opp"}
      message={message}
      myTurn={myTurn}
      myHand={game.hands[HUMAN]}
      onPlay={onPlay}
    >
      {game.phase === "finished" && (
        <EndScreen
          game={game}
          record={state.stats[state.difficulty]}
          onAgain={() => dispatch({ type: "start", difficulty: state.difficulty, seed: randomSeed() })}
          onMenu={() => dispatch({ type: "menu" })}
        />
      )}
    </BriscolaTable>
  );
}

function StartScreen({
  stats,
  difficulty,
  onStart,
}: {
  stats: Stats;
  difficulty: Difficulty;
  onStart: (d: Difficulty) => void;
}) {
  return (
    <main className={styles.table}>
      <header className={styles.bar}>
        <Link href="/" className={styles.barBtn}>
          ‹ Menu
        </Link>
        <span className={styles.barTitle}>Briscola</span>
        <span />
      </header>
      <div className={styles.panel}>
        <h1 className={styles.panelTitle}>Briscola contro il computer</h1>
        <p className={styles.panelText}>Scegli il livello. Vince chi fa almeno 61 punti su 120.</p>
        {(["facile", "normale"] as Difficulty[]).map((d) => (
          <button
            key={d}
            className={`${styles.bigBtn} ${d === difficulty ? styles.bigBtnPrimary : ""}`}
            onClick={() => onStart(d)}
          >
            <span>{d === "facile" ? "Facile" : "Normale"}</span>
            <small>
              {stats[d].vinte} vinte · {stats[d].perse} perse
              {stats[d].pari ? ` · ${stats[d].pari} pari` : ""}
            </small>
          </button>
        ))}
        <details className={styles.rules}>
          <summary>Regole in breve</summary>
          <ul>
            <li>3 carte a testa; la carta girata sotto il mazzo indica il seme di briscola.</li>
            <li>Non c&apos;è obbligo di rispondere al seme.</li>
            <li>Prende la briscola più alta; se non ci sono briscole, la carta più alta del seme di uscita.</li>
            <li>Ordine: Asso, Tre, Re, Cavallo, Fante, 7, 6, 5, 4, 2.</li>
            <li>Punti: Asso 11, Tre 10, Re 4, Cavallo 3, Fante 2.</li>
            <li>Chi prende pesca per primo e apre la mano successiva.</li>
          </ul>
        </details>
      </div>
    </main>
  );
}

function EndScreen({
  game,
  record,
  onAgain,
  onMenu,
}: {
  game: GameState;
  record: Record3;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const [me, cpu] = teamPoints(game);
  const w = winningTeam(game);
  const title = w === null ? "Pareggio!" : w === HUMAN ? "Hai vinto!" : "Hai perso";
  const carichi = game.captured[HUMAN].filter((c) => c.rank === 1 || c.rank === 3).length;
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <div className={styles.score}>
          <div>
            <strong>{me}</strong>
            <span>Tu</span>
          </div>
          <div className={styles.scoreSep}>–</div>
          <div>
            <strong>{cpu}</strong>
            <span>Computer</span>
          </div>
        </div>
        <p className={styles.panelText}>
          Hai preso {carichi} carichi su 8.
          {me >= 91 && " Che partita!"}
        </p>
        <p className={styles.panelText}>
          Bilancio: {record.vinte} vinte · {record.perse} perse
          {record.pari ? ` · ${record.pari} pari` : ""}
        </p>
        <button className={`${styles.bigBtn} ${styles.bigBtnPrimary}`} onClick={onAgain}>
          Rivincita
        </button>
        <button className={styles.bigBtn} onClick={onMenu}>
          Cambia livello
        </button>
      </div>
    </div>
  );
}
