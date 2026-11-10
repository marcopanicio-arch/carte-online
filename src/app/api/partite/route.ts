// Server di gioco: inviti, accettazione, mosse e abbandono, per briscola e scopa.
// Il client manda solo "voglio giocare questa carta (e prendere queste)": qui si controlla
// che sia lecito e si salva il nuovo stato. Nessun giocatore vede mai il mazzo o la mano dell'altro.

import { randomSeed } from "@/lib/carte/cards";
import { type GameState, IllegalMove, collectTrick, newGame, playCard, winningTeam } from "@/lib/briscola/engine";
import { type GameKind, type MatchRow, type PublicState, toPublic } from "@/lib/briscola/online";
import * as scopa from "@/lib/scopa/engine";
import { type ScopaPublic, scopaApplyMove, scopaStart } from "@/lib/scopa/online";
import { requestUser, supabaseAdmin } from "@/lib/supabase/server";

type AnyState = GameState | scopa.ScopaState;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requestUser(req);
    if (!me) throw new HttpError(401, "Devi accedere per giocare online");
    const body = (await req.json()) as Record<string, unknown>;
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

    switch (body.action) {
      case "invite":
        return Response.json(await invite(me, str("opponentId"), str("game")));
      case "accept":
        return Response.json(await accept(me, str("matchId")));
      case "decline":
        return Response.json(await decline(me, str("matchId")));
      case "play": {
        const ids = Array.isArray(body.captureIds)
          ? body.captureIds.filter((x): x is string => typeof x === "string")
          : [];
        return Response.json(await play(me, str("matchId"), str("cardId"), ids));
      }
      case "forfeit":
        return Response.json(await forfeit(me, str("matchId")));
      default:
        throw new HttpError(400, "Azione sconosciuta");
    }
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof IllegalMove || e instanceof scopa.IllegalMove) {
      return Response.json({ error: e.message }, { status: 409 });
    }
    console.error(e);
    return Response.json({ error: "Errore del server" }, { status: 500 });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LoadedMatch = MatchRow & { secret: AnyState | null };

/** Partita e stato segreto in una sola richiesta al database. */
async function loadMatch(id: string | undefined): Promise<LoadedMatch> {
  if (!id || !UUID.test(id)) throw new HttpError(400, "Partita mancante");
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("*, match_secrets(state)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Partita non trovata");
  const { match_secrets: sec, ...row } = data as MatchRow & {
    match_secrets: { state: AnyState } | { state: AnyState }[] | null;
  };
  const secret = Array.isArray(sec) ? (sec[0]?.state ?? null) : (sec?.state ?? null);
  return { ...row, secret };
}

function seatOf(match: MatchRow, me: string): 0 | 1 {
  if (match.player0 === me) return 0;
  if (match.player1 === me) return 1;
  throw new HttpError(403, "Non sei in questa partita");
}

async function save(
  match: MatchRow,
  changes: {
    status: MatchRow["status"];
    public?: PublicState | ScopaPublic | null;
    state?: AnyState;
    winner?: number | null;
    result?: string | null;
  },
) {
  const { data, error } = await supabaseAdmin().rpc("save_match", {
    p_id: match.id,
    p_expected_version: match.version,
    p_status: changes.status,
    p_public: changes.public === undefined ? match.public : changes.public,
    p_state: changes.state ?? null,
    p_hand0: changes.state ? changes.state.hands[0] : null,
    p_hand1: changes.state ? changes.state.hands[1] : null,
    p_winner: changes.winner === undefined ? match.winner : changes.winner,
    p_result: changes.result === undefined ? match.result : changes.result,
  });
  if (error) throw error;
  if (!data) throw new HttpError(409, "La partita è cambiata nel frattempo, riprova");
}

async function invite(me: string, opponentId: string | undefined, gameRaw: string | undefined) {
  if (!opponentId || !UUID.test(opponentId) || opponentId === me) {
    throw new HttpError(400, "Avversario non valido");
  }
  const game: GameKind = gameRaw === "scopa" ? "scopa" : "briscola";
  const db = supabaseAdmin();

  const { data: opp } = await db.from("profiles").select("id").eq("id", opponentId).maybeSingle();
  if (!opp) throw new HttpError(404, "Giocatore non trovato");

  const { data: open } = await db
    .from("matches")
    .select("id, status")
    .in("status", ["invited", "active"])
    .or(`and(player0.eq.${me},player1.eq.${opponentId}),and(player0.eq.${opponentId},player1.eq.${me})`)
    .limit(1);
  if (open?.length) {
    throw new HttpError(
      409,
      open[0].status === "active" ? "Avete già una partita in corso" : "C'è già un invito in sospeso",
    );
  }

  const { data, error } = await db
    .from("matches")
    .insert({ player0: me, player1: opponentId, status: "invited", game })
    .select("id")
    .single();
  if (error) throw error;
  return { matchId: data.id as string };
}

async function accept(me: string, matchId: string | undefined) {
  const match = await loadMatch(matchId);
  if (match.player1 !== me) throw new HttpError(403, "Questo invito non è per te");
  if (match.status !== "invited") throw new HttpError(409, "Invito non più valido");

  const dealer = Math.round(Math.random());
  if (match.game === "scopa") {
    const { state, pub } = scopaStart(randomSeed(), dealer);
    await save(match, { status: "active", public: pub, state });
  } else {
    const state = newGame({ numPlayers: 2, seed: randomSeed(), dealer });
    await save(match, { status: "active", public: toPublic(state, null), state });
  }
  return { matchId: match.id };
}

async function decline(me: string, matchId: string | undefined) {
  const match = await loadMatch(matchId);
  const seat = seatOf(match, me);
  if (match.status !== "invited") throw new HttpError(409, "Invito non più valido");
  // Chi è invitato rifiuta, chi ha invitato annulla.
  await save(match, { status: seat === 1 ? "declined" : "cancelled" });
  return { ok: true };
}

async function play(me: string, matchId: string | undefined, cardId: string | undefined, captureIds: string[]) {
  if (!cardId) throw new HttpError(400, "Carta mancante");
  const match = await loadMatch(matchId);
  const seat = seatOf(match, me);
  if (match.status !== "active") throw new HttpError(409, "La partita non è in corso");
  if (!match.secret) throw new HttpError(500, "Stato della partita mancante");

  return match.game === "scopa" ? playScopa(match, seat, cardId, captureIds) : playBriscola(match, seat, cardId);
}

async function playBriscola(match: LoadedMatch, seat: 0 | 1, cardId: string) {
  let state = playCard(match.secret as GameState, seat, cardId);
  let lastTrick = (match.public as PublicState | null)?.lastTrick ?? null;
  if (state.phase === "trickComplete") {
    // La mano si chiude subito sul server; i client la mostrano ancora un attimo grazie a lastTrick.
    lastTrick = { plays: state.table, winner: state.trickWinner!, trickCount: state.trickCount + 1 };
    state = collectTrick(state);
  }

  const pub = toPublic(state, lastTrick);
  if (state.phase === "finished") {
    await save(match, { status: "finished", public: pub, state, winner: winningTeam(state), result: "normal" });
  } else {
    await save(match, { status: "active", public: pub, state });
  }
  return { public: pub, hand: state.hands[seat], version: match.version + 1 };
}

async function playScopa(match: LoadedMatch, seat: 0 | 1, cardId: string, captureIds: string[]) {
  const { state, pub } = scopaApplyMove(
    match.secret as scopa.ScopaState,
    match.public as ScopaPublic,
    seat,
    cardId,
    captureIds,
    randomSeed(),
  );
  if (state.phase === "gameOver") {
    await save(match, { status: "finished", public: pub, state, winner: state.winner, result: "normal" });
  } else {
    await save(match, { status: "active", public: pub, state });
  }
  return { public: pub, hand: state.hands[seat], version: match.version + 1 };
}

async function forfeit(me: string, matchId: string | undefined) {
  const match = await loadMatch(matchId);
  const seat = seatOf(match, me);
  if (match.status !== "active") throw new HttpError(409, "La partita non è in corso");
  await save(match, { status: "finished", winner: 1 - seat, result: "forfeit" });
  return { ok: true };
}
