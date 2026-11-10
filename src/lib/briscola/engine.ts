// Regole della briscola come funzioni pure: stato in ingresso, nuovo stato in uscita.
// Nessuna dipendenza da React o dal browser, così lo stesso codice potrà girare
// sul server per le partite online.

import { type Card, type Rank, type Suit, fullDeck, shuffle } from "../carte/cards";

/** Punti delle carte: Asso 11, Tre 10, Re 4, Cavallo 3, Fante 2, il resto 0. Totale 120. */
export const POINTS: Record<Rank, number> = {
  1: 11, 2: 0, 3: 10, 4: 0, 5: 0, 6: 0, 7: 0, 8: 2, 9: 3, 10: 4,
};

/** Forza di presa: Asso > Tre > Re > Cavallo > Fante > 7 > 6 > 5 > 4 > 2. */
const STRENGTH: Record<Rank, number> = {
  1: 10, 3: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1,
};

export const points = (c: Card) => POINTS[c.rank];
export const strength = (c: Card) => STRENGTH[c.rank];

export type Phase = "playing" | "trickComplete" | "finished";

export interface Play {
  player: number;
  card: Card;
}

export interface GameState {
  numPlayers: 2 | 4;
  hands: Card[][];
  /** Carte ancora da pescare; l'ultima è la briscola scoperta. */
  deck: Card[];
  briscola: Card;
  trump: Suit;
  table: Play[];
  /** Chi ha aperto la mano in corso. */
  leader: number;
  /** A chi tocca giocare (vale solo in fase "playing"). */
  turn: number;
  /** Vincitore della mano appena completata (fase "trickComplete"). */
  trickWinner: number | null;
  captured: Card[][];
  phase: Phase;
  trickCount: number;
}

/** Squadra di un giocatore: in 2 coincide col giocatore, in 4 sono le coppie 0+2 e 1+3. */
export const teamOf = (player: number) => player % 2;

export function newGame(opts: { numPlayers?: 2 | 4; seed: number; dealer?: number }): GameState {
  const numPlayers = opts.numPlayers ?? 2;
  const dealer = opts.dealer ?? numPlayers - 1;
  const deck = shuffle(fullDeck(), opts.seed);

  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  const first = (dealer + 1) % numPlayers;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < numPlayers; i++) {
      hands[(first + i) % numPlayers].push(deck.shift()!);
    }
  }
  // La carta successiva viene girata e messa in fondo al mazzo: è la briscola.
  const briscola = deck.shift()!;
  deck.push(briscola);

  return {
    numPlayers,
    hands,
    deck,
    briscola,
    trump: briscola.suit,
    table: [],
    leader: first,
    turn: first,
    trickWinner: null,
    captured: Array.from({ length: numPlayers }, () => []),
    phase: "playing",
    trickCount: 0,
  };
}

/** Chi vince le carte sul tavolo: la briscola più alta, altrimenti la più alta del seme di uscita. */
export function trickWinner(table: Play[], trump: Suit): number {
  const led = table[0].card.suit;
  let best = table[0];
  for (const play of table.slice(1)) {
    if (beats(play.card, best.card, led, trump)) best = play;
  }
  return best.player;
}

/** True se `a` batte `b`, dato il seme di uscita e la briscola. */
export function beats(a: Card, b: Card, led: Suit, trump: Suit): boolean {
  if (a.suit === b.suit) return strength(a) > strength(b);
  if (a.suit === trump) return true;
  if (b.suit === trump) return false;
  // Semi diversi, nessuna briscola: vince solo chi ha risposto al seme di uscita.
  return a.suit === led;
}

export class IllegalMove extends Error {}

export function playCard(state: GameState, player: number, cardId: string): GameState {
  if (state.phase !== "playing") throw new IllegalMove("La mano non è in corso");
  if (state.turn !== player) throw new IllegalMove("Non è il tuo turno");
  const hand = state.hands[player];
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new IllegalMove("Carta non in mano");

  const hands = state.hands.map((h, i) => (i === player ? h.filter((c) => c.id !== cardId) : h));
  const table = [...state.table, { player, card }];

  if (table.length < state.numPlayers) {
    return { ...state, hands, table, turn: (player + 1) % state.numPlayers };
  }
  return {
    ...state,
    hands,
    table,
    phase: "trickComplete",
    trickWinner: trickWinner(table, state.trump),
  };
}

/** Il vincitore prende le carte, poi si pesca (prima il vincitore) e lui apre la mano dopo. */
export function collectTrick(state: GameState): GameState {
  if (state.phase !== "trickComplete" || state.trickWinner === null) {
    throw new IllegalMove("Nessuna mano da raccogliere");
  }
  const winner = state.trickWinner;
  const captured = state.captured.map((pile, i) =>
    i === winner ? [...pile, ...state.table.map((p) => p.card)] : pile,
  );

  const deck = state.deck.slice();
  const hands = state.hands.map((h) => h.slice());
  if (deck.length >= state.numPlayers) {
    for (let i = 0; i < state.numPlayers; i++) {
      hands[(winner + i) % state.numPlayers].push(deck.shift()!);
    }
  }

  const finished = hands.every((h) => h.length === 0);
  return {
    ...state,
    hands,
    deck,
    captured,
    table: [],
    leader: winner,
    turn: winner,
    trickWinner: null,
    phase: finished ? "finished" : "playing",
    trickCount: state.trickCount + 1,
  };
}

export function teamPoints(state: GameState): number[] {
  const totals = [0, 0];
  state.captured.forEach((pile, player) => {
    totals[teamOf(player)] += pile.reduce((sum, c) => sum + points(c), 0);
  });
  return totals;
}

/** Squadra vincitrice (0 o 1), oppure null se 60 a 60. */
export function winningTeam(state: GameState): number | null {
  const [a, b] = teamPoints(state);
  if (a === b) return null;
  return a > b ? 0 : 1;
}
