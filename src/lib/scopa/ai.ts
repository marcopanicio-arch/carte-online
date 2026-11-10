// Avversario computer per la scopa. Valuta ogni mossa possibile (carta + presa) e sceglie la migliore:
// prende settebello, sette e denari volentieri, cerca le scope e soprattutto evita di
// lasciare in tavola somme che l'avversario può spazzare con una scopa.

import { type Card, fullDeck } from "../carte/cards";
import { type ScopaState, captureOptions, isSettebello, value } from "./engine";

export type Difficulty = "facile" | "normale";

export interface AiMove {
  cardId: string;
  captureIds: string[];
}

/** Quanto "vale" prendere una carta, in vista di carte, denari, settebello e primiera. */
function weight(c: Card): number {
  let w = 1; // conta per le carte
  if (c.suit === "denari") w += 1.4;
  if (isSettebello(c)) w += 12;
  if (c.rank === 7) w += 3; // primiera
  else if (c.rank === 6) w += 1.6;
  else if (c.rank === 1) w += 1;
  return w;
}

/** Carte che l'avversario potrebbe avere: tutte quelle che non vedo (né in mano mia, né in tavola, né prese). */
function unseen(state: ScopaState, player: number): Card[] {
  const seen = new Set<string>();
  for (const c of state.hands[player]) seen.add(c.id);
  for (const c of state.table) seen.add(c.id);
  for (const pile of state.captured) for (const c of pile) seen.add(c.id);
  return fullDeck().filter((c) => !seen.has(c.id));
}

/** Rischio che l'avversario faccia scopa sulla tavola che lascio. */
function scopaDanger(table: Card[], hidden: Card[], opponentCards: number): number {
  if (table.length === 0 || opponentCards === 0) return 0;
  const sum = table.reduce((s, c) => s + value(c), 0);
  if (sum > 10) return 0;
  // Una sola carta di valore `sum` porta via tutto (con una carta sola in tavola, è la carta uguale).
  const outs = hidden.filter((c) => value(c) === sum).length;
  if (outs === 0) return 0;
  const p = 1 - Math.pow(1 - outs / Math.max(hidden.length, 1), opponentCards);
  return p * 11;
}

export function chooseMove(state: ScopaState, player: number, difficulty: Difficulty = "normale"): AiMove {
  const hand = state.hands[player];
  const moves: (AiMove & { score: number })[] = [];
  const hidden = unseen(state, player);
  const oppCards = state.hands[1 - player].length;
  const lastPlay = state.deck.length === 0 && hand.length === 1 && oppCards === 0;

  for (const card of hand) {
    const options = captureOptions(state.table, card);
    if (options.length === 0) {
      const after = [...state.table, card];
      const score = -weight(card) * 0.9 - scopaDanger(after, hidden, oppCards) - value(card) * 0.05;
      moves.push({ cardId: card.id, captureIds: [], score });
      continue;
    }
    for (const opt of options) {
      const takenIds = new Set(opt.map((c) => c.id));
      const after = state.table.filter((c) => !takenIds.has(c.id));
      let score = weight(card) + opt.reduce((s, c) => s + weight(c), 0);
      if (after.length === 0 && !lastPlay) score += 14; // scopa!
      score -= scopaDanger(after, hidden, oppCards);
      moves.push({ cardId: card.id, captureIds: opt.map((c) => c.id), score });
    }
  }

  if (difficulty === "facile" && Math.random() < 0.45) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  return moves.reduce((a, b) => (b.score > a.score ? b : a));
}
