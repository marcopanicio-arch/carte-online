// Avversario computer. Euristiche semplici, ma giocano come una persona sensata:
// non butta carichi a caso, prende i punti quando conviene, tiene le briscole alte.

import type { Card } from "../carte/cards";
import { type GameState, beats, points, strength, teamOf, trickWinner } from "./engine";

export type Difficulty = "facile" | "normale";

export function chooseCard(state: GameState, player: number, difficulty: Difficulty = "normale"): Card {
  const hand = state.hands[player];
  if (hand.length === 1) return hand[0];
  if (difficulty === "facile") {
    // Facile: a volte gioca bene, spesso a caso.
    if (Math.random() < 0.5) return hand[Math.floor(Math.random() * hand.length)];
  }
  return state.table.length === 0 ? lead(state, hand) : respond(state, player, hand);
}

/** Valore "di costo" di una carta: punti che rischia di regalare + peso se è briscola. */
function cost(card: Card, state: GameState): number {
  const trumpPenalty = card.suit === state.trump ? 8 + strength(card) : 0;
  return points(card) * 2 + trumpPenalty + strength(card) * 0.1;
}

const cheapest = (cards: Card[], state: GameState) =>
  cards.reduce((a, b) => (cost(b, state) < cost(a, state) ? b : a));

function lead(state: GameState, hand: Card[]): Card {
  // Apri con il liscio più basso; se hai solo carichi o briscole, la carta meno preziosa.
  const lisci = hand.filter((c) => c.suit !== state.trump && points(c) === 0);
  if (lisci.length) return cheapest(lisci, state);
  const smallPoints = hand.filter((c) => c.suit !== state.trump && points(c) <= 4);
  if (smallPoints.length) return cheapest(smallPoints, state);
  return cheapest(hand, state);
}

function respond(state: GameState, player: number, hand: Card[]): Card {
  const led = state.table[0].card.suit;
  const currentWinner = trickWinner(state.table, state.trump);
  const winnerCard = state.table.find((p) => p.player === currentWinner)!.card;
  const tablePoints = state.table.reduce((s, p) => s + points(p.card), 0);
  const isLast = state.table.length === state.numPlayers - 1;

  // In 4: se il compagno sta già prendendo ed è l'ultimo a giocare, caricagli punti.
  if (teamOf(currentWinner) === teamOf(player)) {
    const carichi = hand.filter((c) => c.suit !== state.trump && points(c) > 0);
    if (isLast && carichi.length) return carichi.reduce((a, b) => (points(b) > points(a) ? b : a));
    return cheapest(hand, state);
  }

  const winners = hand.filter((c) => beats(c, winnerCard, led, state.trump));
  const sameSuitWinners = winners.filter((c) => c.suit !== state.trump);
  const trumpWinners = winners.filter((c) => c.suit === state.trump);

  // Prendere con una carta dello stesso seme non costa nulla: usa quella che vale di più.
  if (sameSuitWinners.length) {
    return sameSuitWinners.reduce((a, b) => (points(b) > points(a) ? b : a));
  }

  if (trumpWinners.length) {
    const lowestTrump = trumpWinners.reduce((a, b) => (strength(b) < strength(a) ? b : a));
    const lateGame = state.deck.length <= state.numPlayers * 2;
    // Taglia con la briscola se sul tavolo c'è un carico, o un po' di punti con una briscola bassa.
    if (tablePoints >= 10) return lowestTrump;
    if (tablePoints >= 3 && points(lowestTrump) === 0) return lowestTrump;
    if (lateGame && tablePoints > 0) return lowestTrump;
  }

  // Non conviene prendere: lascia il liscio meno prezioso.
  const nonTrump = hand.filter((c) => c.suit !== state.trump);
  return cheapest(nonTrump.length ? nonTrump : hand, state);
}
