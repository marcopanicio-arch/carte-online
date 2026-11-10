// Cosa vedono i giocatori di una partita di scopa online (niente mazzo, niente mani altrui).

import type { Card } from "../carte/cards";
import { type Move, type RoundScore, type ScopaState, nextRound, newGame, play } from "./engine";

export interface ScopaRoundSummary {
  round: number;
  score: RoundScore;
  /** Punteggio della partita dopo questa mano. */
  scores: number[];
  leftover: { player: number; cards: Card[] } | null;
}

export interface ScopaPublic {
  kind: "scopa";
  table: Card[];
  deckCount: number;
  handCounts: number[];
  turn: number;
  dealer: number;
  round: number;
  target: number;
  scores: number[];
  captured: number[];
  scope: number[];
  /** Ultima presa di ciascun giocatore nella mano in corso (per il mucchietto). */
  piles: Card[][];
  lastMove: (Move & { round: number }) | null;
  /** Riepilogo dell'ultima mano finita. */
  lastRound: ScopaRoundSummary | null;
  /** Numero progressivo delle mosse: serve ai client per capire cosa è cambiato. */
  moveCount: number;
  finished: boolean;
  winner: number | null;
}

export function scopaPublic(
  state: ScopaState,
  extra: Pick<ScopaPublic, "piles" | "lastMove" | "lastRound" | "moveCount">,
): ScopaPublic {
  return {
    kind: "scopa",
    table: state.table,
    deckCount: state.deck.length,
    handCounts: state.hands.map((h) => h.length),
    turn: state.turn,
    dealer: state.dealer,
    round: state.round,
    target: state.target,
    scores: state.scores,
    captured: state.captured.map((c) => c.length),
    scope: state.scope,
    ...extra,
    finished: state.phase === "gameOver",
    winner: state.winner,
  };
}

export function scopaStart(seed: number, dealer: number, target = 11) {
  const state = newGame({ seed, dealer, target });
  return { state, pub: scopaPublic(state, { piles: [[], []], lastMove: null, lastRound: null, moveCount: 0 }) };
}

/**
 * Una mossa online: applica le regole, aggiorna mucchietti e riepilogo e, se la mano è finita
 * (ma non la partita), distribuisce subito la successiva. Funzione pura: la usa il server.
 */
export function scopaApplyMove(
  prevState: ScopaState,
  prev: ScopaPublic,
  seat: number,
  cardId: string,
  captureIds: string[],
  nextSeed: number,
): { state: ScopaState; pub: ScopaPublic } {
  let state = play(prevState, seat, cardId, captureIds.length ? captureIds : undefined);
  const move = state.lastMove!;
  const moveRound = state.round;

  let piles = prev.piles.map((p) => p.slice());
  if (move.captured.length) piles[seat] = [...move.captured, move.card];
  if (state.leftover) piles[state.leftover.player] = state.leftover.cards;

  let lastRound = prev.lastRound;
  if (state.phase !== "playing") {
    lastRound = { round: state.round, score: state.roundScore!, scores: state.scores, leftover: state.leftover };
    if (state.phase === "roundOver") {
      state = nextRound(state, nextSeed);
      piles = [[], []];
    }
  }
  const pub = scopaPublic(state, { piles, lastMove: { ...move, round: moveRound }, lastRound, moveCount: prev.moveCount + 1 });
  return { state, pub };
}
