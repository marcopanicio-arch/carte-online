// Cosa vedono i giocatori di una partita online. Il server tiene lo stato completo
// (mazzo e mani) e pubblica solo questa "vista", senza le carte nascoste.

import type { Card, Suit } from "../carte/cards";
import { type GameState, type Play, teamPoints, winningTeam } from "./engine";

export interface PublicState {
  trump: Suit;
  briscola: Card;
  deckCount: number;
  handCounts: number[];
  table: Play[];
  turn: number;
  trickCount: number;
  captured: number[];
  /** L'ultima mano chiusa, per mostrarla prima che le carte vengano portate via. */
  lastTrick: { plays: Play[]; winner: number; trickCount: number } | null;
  /** Punti finali, visibili solo a partita finita. */
  points: number[] | null;
  finished: boolean;
}

export function toPublic(state: GameState, lastTrick: PublicState["lastTrick"]): PublicState {
  const finished = state.phase === "finished";
  return {
    trump: state.trump,
    briscola: state.briscola,
    deckCount: state.deck.length,
    handCounts: state.hands.map((h) => h.length),
    table: state.table,
    turn: state.turn,
    trickCount: state.trickCount,
    captured: state.captured.map((c) => c.length),
    lastTrick,
    points: finished ? teamPoints(state) : null,
    finished,
  };
}

export { winningTeam };

export type MatchStatus = "invited" | "active" | "finished" | "declined" | "cancelled";

export interface MatchRow {
  id: string;
  game: string;
  player0: string;
  player1: string;
  status: MatchStatus;
  public: PublicState | null;
  version: number;
  winner: number | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}
