// Regole della scopa classica a 2 giocatori, come funzioni pure (come per la briscola:
// lo stesso codice potrà girare sul server per le partite online).
//
// - 3 carte a testa, 4 scoperte in tavola. Se in tavola ci sono 3 o 4 Re si rimescola.
// - Valori: Asso 1, 2–7 il loro numero, Fante 8, Cavallo 9, Re 10.
// - La presa è obbligatoria. Se in tavola c'è una carta di pari valore si prende quella
//   (non si può prendere per somma). Altrimenti si prendono carte la cui somma è uguale.
// - Scopa: una presa che svuota la tavola, tranne all'ultima giocata della mano.
// - Finite le carte in mano se ne danno altre 3 a testa, finché c'è mazzo.
// - A fine mano le carte rimaste in tavola vanno all'ultimo che ha preso (non è scopa).
// - Punti: carte (più di 20), denari (più di 5), settebello, primiera, una per ogni scopa.
// - Vince chi arriva per primo a 11 (o al traguardo scelto); in caso di parità si continua.

import { type Card, type Rank, type Suit, SUITS, fullDeck, shuffle } from "../carte/cards";

export const value = (c: Card) => c.rank; // 1..10: Asso 1, Fante 8, Cavallo 9, Re 10

/** Valori di primiera: 7 → 21, 6 → 18, Asso → 16, 5 → 15, 4 → 14, 3 → 13, 2 → 12, figure → 10. */
export const PRIMIERA: Record<Rank, number> = {
  7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10,
};

export const isSettebello = (c: Card) => c.suit === "denari" && c.rank === 7;

export interface Move {
  player: number;
  card: Card;
  captured: Card[];
  scopa: boolean;
}

export interface RoundScore {
  cards: number[];
  denari: number[];
  settebello: number; // indice del giocatore che l'ha preso
  primiera: (number | null)[]; // valore di primiera, null se manca un seme
  scope: number[];
  /** Chi prende il punto per ogni voce (null = pari, nessuno). */
  points: {
    carte: number | null;
    denari: number | null;
    settebello: number;
    primiera: number | null;
  };
  total: number[];
}

export type Phase = "playing" | "roundOver" | "gameOver";

export interface ScopaState {
  hands: Card[][];
  deck: Card[];
  table: Card[];
  captured: Card[][];
  scope: number[];
  lastCapturer: number | null;
  turn: number;
  dealer: number;
  phase: Phase;
  lastMove: Move | null;
  /** Carte rimaste in tavola a fine mano, andate all'ultimo che ha preso. */
  leftover: { player: number; cards: Card[] } | null;
  round: number;
  seed: number;
  target: number;
  scores: number[];
  roundScore: RoundScore | null;
  winner: number | null;
}

export class IllegalMove extends Error {}

const other = (p: number) => 1 - p;

function deal(seed: number, dealer: number) {
  // Se in tavola escono 3 o 4 Re si rimescola (con un seme diverso, sempre deterministico).
  for (let attempt = 0; ; attempt++) {
    const deck = shuffle(fullDeck(), seed + attempt * 7919);
    const first = other(dealer);
    const hands: Card[][] = [[], []];
    for (let i = 0; i < 3; i++) {
      hands[first].push(deck.shift()!);
      hands[dealer].push(deck.shift()!);
    }
    const table = deck.splice(0, 4);
    if (table.filter((c) => c.rank === 10).length < 3) return { deck, hands, table };
  }
}

export function newRound(seed: number, dealer: number, base?: Pick<ScopaState, "round" | "target" | "scores">): ScopaState {
  const { deck, hands, table } = deal(seed, dealer);
  return {
    hands,
    deck,
    table,
    captured: [[], []],
    scope: [0, 0],
    lastCapturer: null,
    turn: other(dealer), // gioca per primo chi non ha dato le carte
    dealer,
    phase: "playing",
    lastMove: null,
    leftover: null,
    round: base?.round ?? 1,
    seed,
    target: base?.target ?? 11,
    scores: base?.scores ?? [0, 0],
    roundScore: null,
    winner: null,
  };
}

export function newGame(opts: { seed: number; dealer?: number; target?: number }): ScopaState {
  return newRound(opts.seed, opts.dealer ?? 1, { round: 1, target: opts.target ?? 11, scores: [0, 0] });
}

/** Mano successiva: il mazziere cambia, i punti restano. */
export function nextRound(state: ScopaState, seed: number): ScopaState {
  if (state.phase !== "roundOver") throw new IllegalMove("La mano non è finita");
  return newRound(seed, other(state.dealer), { round: state.round + 1, target: state.target, scores: state.scores });
}

/**
 * Tutti i modi in cui `card` può prendere dalla tavola.
 * Se c'è almeno una carta di pari valore, le uniche prese possibili sono quelle singole.
 */
export function captureOptions(table: Card[], card: Card): Card[][] {
  const v = value(card);
  const singles = table.filter((c) => value(c) === v);
  if (singles.length) return singles.map((c) => [c]);

  const out: Card[][] = [];
  const n = table.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    if ((mask & (mask - 1)) === 0) continue; // le singole sono già escluse sopra
    let sum = 0;
    const pick: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += value(table[i]);
        if (sum > v) break;
        pick.push(table[i]);
      }
    }
    if (sum === v && pick.length === popcount(mask)) out.push(pick);
  }
  return out;
}

function popcount(x: number) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

const sameSet = (a: Card[], ids: string[]) =>
  a.length === ids.length && a.every((c) => ids.includes(c.id));

/**
 * Gioca una carta. `captureIds` indica quali carte prendere quando c'è più di una possibilità;
 * se la presa è una sola si può omettere.
 */
export function play(state: ScopaState, player: number, cardId: string, captureIds?: string[]): ScopaState {
  if (state.phase !== "playing") throw new IllegalMove("La mano non è in corso");
  if (state.turn !== player) throw new IllegalMove("Non è il tuo turno");
  const card = state.hands[player].find((c) => c.id === cardId);
  if (!card) throw new IllegalMove("Carta non in mano");

  const options = captureOptions(state.table, card);
  let captured: Card[] = [];
  if (options.length) {
    if (captureIds && captureIds.length) {
      const chosen = options.find((o) => sameSet(o, captureIds));
      if (!chosen) throw new IllegalMove("Presa non valida");
      captured = chosen;
    } else if (options.length === 1) {
      captured = options[0];
    } else {
      throw new IllegalMove("Scegli quali carte prendere");
    }
  } else if (captureIds && captureIds.length) {
    throw new IllegalMove("Con questa carta non si prende niente");
  }

  const hands = state.hands.map((h, i) => (i === player ? h.filter((c) => c.id !== cardId) : h.slice()));
  const takenIds = new Set(captured.map((c) => c.id));
  const table = captured.length ? state.table.filter((c) => !takenIds.has(c.id)) : [...state.table, card];
  const capturedPiles = state.captured.map((pile, i) => (i === player && captured.length ? [...pile, card, ...captured] : pile));

  const lastPlayOfRound = state.deck.length === 0 && hands.every((h) => h.length === 0);
  const scopa = captured.length > 0 && table.length === 0 && !lastPlayOfRound;
  const scope = state.scope.map((s, i) => (i === player && scopa ? s + 1 : s));

  let next: ScopaState = {
    ...state,
    hands,
    table,
    captured: capturedPiles,
    scope,
    lastCapturer: captured.length ? player : state.lastCapturer,
    turn: other(player),
    lastMove: { player, card, captured, scopa },
  };

  if (hands.every((h) => h.length === 0)) {
    if (next.deck.length > 0) {
      // Nuova distribuzione: 3 carte a testa, a partire da chi non ha dato.
      const deck = next.deck.slice();
      const first = other(state.dealer);
      const newHands: Card[][] = [[], []];
      for (let i = 0; i < 3; i++) {
        newHands[first].push(deck.shift()!);
        newHands[state.dealer].push(deck.shift()!);
      }
      next = { ...next, deck, hands: newHands, turn: first };
    } else {
      next = endRound(next);
    }
  }
  return next;
}

function endRound(state: ScopaState): ScopaState {
  const captured = state.captured.map((p) => p.slice());
  let leftover: ScopaState["leftover"] = null;
  if (state.table.length) {
    // Le carte rimaste vanno all'ultimo che ha preso (se nessuno ha mai preso, al mazziere).
    const to = state.lastCapturer ?? state.dealer;
    captured[to].push(...state.table);
    leftover = { player: to, cards: state.table };
  }
  const roundScore = scoreRound(captured, state.scope);
  const scores = state.scores.map((s, i) => s + roundScore.total[i]);

  let winner: number | null = null;
  const best = Math.max(...scores);
  if (best >= state.target && scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;

  return {
    ...state,
    captured,
    table: [],
    leftover,
    roundScore,
    scores,
    winner,
    phase: winner === null ? "roundOver" : "gameOver",
  };
}

/** Valore di primiera: la carta migliore di ogni seme; null se manca anche un solo seme. */
export function primieraValue(cards: Card[]): number | null {
  let total = 0;
  for (const s of SUITS) {
    const best = cards.filter((c) => c.suit === s).reduce((m, c) => Math.max(m, PRIMIERA[c.rank]), 0);
    if (best === 0) return null;
    total += best;
  }
  return total;
}

const leader = (a: number, b: number): number | null => (a === b ? null : a > b ? 0 : 1);

export function scoreRound(captured: Card[][], scope: number[]): RoundScore {
  const cards = captured.map((p) => p.length);
  const denari = captured.map((p) => p.filter((c) => c.suit === ("denari" as Suit)).length);
  const settebello = captured[0].some(isSettebello) ? 0 : 1;
  const primiera = captured.map(primieraValue);

  let primieraWinner: number | null;
  if (primiera[0] === null && primiera[1] === null) primieraWinner = null;
  else if (primiera[0] === null) primieraWinner = 1;
  else if (primiera[1] === null) primieraWinner = 0;
  else primieraWinner = leader(primiera[0], primiera[1]);

  const points = {
    carte: leader(cards[0], cards[1]),
    denari: leader(denari[0], denari[1]),
    settebello,
    primiera: primieraWinner,
  };
  const total = [0, 1].map(
    (p) =>
      scope[p] +
      (points.carte === p ? 1 : 0) +
      (points.denari === p ? 1 : 0) +
      (points.settebello === p ? 1 : 0) +
      (points.primiera === p ? 1 : 0),
  );
  return { cards, denari, settebello, primiera, scope: scope.slice(), points, total };
}
