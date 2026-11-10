// Logica della schermata di scopa (senza grafica): selezione della carta, scelta della presa,
// mossa mostrata e poi applicata. Separata per poterla verificare da sola.

import type { Card } from "../../lib/carte/cards";
import type { AiMove, Difficulty } from "../../lib/scopa/ai";
import { type ScopaState, captureOptions, newGame, nextRound, play } from "../../lib/scopa/engine";
import { load } from "../../lib/storage";

export const HUMAN = 0;
export const CPU = 1;

export type Record3 = { vinte: number; perse: number };
export type Stats = Record<Difficulty, Record3>;
export const EMPTY_STATS: Stats = { facile: { vinte: 0, perse: 0 }, normale: { vinte: 0, perse: 0 } };

export interface State {
  game: ScopaState | null;
  difficulty: Difficulty;
  target: number;
  /** Mossa mostrata sul tavolo prima di essere applicata (carta giocata + carte da prendere). */
  staging: { player: number; card: Card; captureIds: string[] } | null;
  /** Scelta della presa quando ce n'è più di una. */
  selecting: { cardId: string; options: string[][]; picked: string[] } | null;
  /** Ultima presa di ciascun giocatore, mostrata sul suo mucchietto. */
  piles: Card[][];
  banner: number; // contatore: cambia a ogni scopa, per far ripartire l'animazione
  stats: Stats;
}

export type Action =
  | { type: "start"; difficulty: Difficulty; target: number; seed: number }
  | { type: "select"; cardId: string }
  | { type: "pick"; cardId: string }
  | { type: "stage"; player: number; move: AiMove }
  | { type: "commit" }
  | { type: "nextRound"; seed: number }
  | { type: "menu" };

export function reducer(state: State, action: Action): State {
  const g = state.game;
  switch (action.type) {
    case "start":
      return {
        ...state,
        difficulty: action.difficulty,
        target: action.target,
        game: newGame({ seed: action.seed, dealer: Math.round(Math.random()), target: action.target }),
        staging: null,
        selecting: null,
        piles: [[], []],
      };

    case "select": {
      if (!g || g.turn !== HUMAN || g.phase !== "playing" || state.staging) return state;
      if (state.selecting?.cardId === action.cardId) return { ...state, selecting: null }; // ritocco = annulla
      const card = g.hands[HUMAN].find((c) => c.id === action.cardId);
      if (!card) return state;
      const options = captureOptions(g.table, card).map((o) => o.map((c) => c.id));
      if (options.length <= 1) {
        return stage(state, HUMAN, { cardId: card.id, captureIds: options[0] ?? [] });
      }
      return { ...state, selecting: { cardId: card.id, options, picked: [] } };
    }

    case "pick": {
      const sel = state.selecting;
      if (!sel || !g) return state;
      let picked = sel.picked.includes(action.cardId)
        ? sel.picked.filter((id) => id !== action.cardId)
        : [...sel.picked, action.cardId];
      let remaining = sel.options.filter((o) => picked.every((id) => o.includes(id)));
      if (remaining.length === 0) {
        // Combinazione impossibile: riparti da questa carta.
        picked = [action.cardId];
        remaining = sel.options.filter((o) => o.includes(action.cardId));
        if (remaining.length === 0) return state;
      }
      if (remaining.length === 1) {
        return stage({ ...state, selecting: null }, HUMAN, { cardId: sel.cardId, captureIds: remaining[0] });
      }
      return { ...state, selecting: { ...sel, picked } };
    }

    case "stage":
      return stage(state, action.player, action.move);

    case "commit": {
      if (!g || !state.staging) return state;
      const { player, card, captureIds } = state.staging;
      // Durante la mossa mostrata la carta era stata tolta dalla mano solo per la grafica: la rimettiamo.
      const before = { ...g, hands: g.hands.map((h, i) => (i === player ? [...h, card] : h)) };
      const game = play(before, player, card.id, captureIds);
      const piles = state.piles.map((p) => p.slice());
      if (captureIds.length) {
        const taken = g.table.filter((c) => captureIds.includes(c.id));
        piles[player] = [...taken, card];
      }
      if (game.leftover) piles[game.leftover.player] = game.leftover.cards;

      let stats = state.stats;
      if (game.phase === "gameOver") {
        const rec = { ...stats[state.difficulty] };
        if (game.winner === HUMAN) rec.vinte++;
        else rec.perse++;
        stats = { ...stats, [state.difficulty]: rec };
      }
      return {
        ...state,
        game,
        staging: null,
        piles,
        banner: game.lastMove?.scopa ? state.banner + 1 : state.banner,
        stats,
      };
    }

    case "nextRound":
      if (!g || g.phase !== "roundOver") return state;
      return { ...state, game: nextRound(g, action.seed), piles: [[], []], staging: null, selecting: null };

    case "menu":
      return { ...state, game: null, staging: null, selecting: null };
  }
}

function stage(state: State, player: number, move: AiMove): State {
  const g = state.game!;
  const card = g.hands[player].find((c) => c.id === move.cardId);
  if (!card) return state;
  return {
    ...state,
    selecting: null,
    staging: { player, card, captureIds: move.captureIds },
    game: { ...g, hands: g.hands.map((h, i) => (i === player ? h.filter((c) => c.id !== card.id) : h)) },
  };
}

export function init(): State {
  const prefs = load("scopa:prefs", { difficulty: "normale" as Difficulty, target: 11 });
  return {
    game: null,
    difficulty: prefs.difficulty,
    target: prefs.target,
    staging: null,
    selecting: null,
    piles: [[], []],
    banner: 0,
    stats: load("scopa:stats", EMPTY_STATS),
  };
}

