"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Card, cardName } from "@/lib/carte/cards";
import { captureOptions } from "@/lib/scopa/engine";
import type { ScopaPublic } from "@/lib/scopa/online";
import { api } from "@/lib/supabase/client";
import { sounds } from "@/lib/sound";
import { vibrate } from "../../../briscola/BriscolaTable";
import tableStyles from "../../../briscola/briscola.module.css";
import ScopaTable, { ScoreTable } from "../../../scopa/ScopaTable";
import scopaStyles from "../../../scopa/scopa.module.css";
import OnlineEnd from "./OnlineEnd";
import type { OnlineMatchCtx } from "./useOnlineMatch";

const STAGE_MS = 750; // quanto resta visibile una presa prima di portarla via
const DROP_MS = 250;

interface Selecting {
  cardId: string;
  options: string[][];
  picked: string[];
}
interface MyStaging {
  card: Card;
  captureIds: string[];
  /** Tavola com'era prima della mossa: la mostriamo finché la presa non viene portata via. */
  table: Card[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ScopaOnline({ match, seat, opp, oppConnected, hand, setHand, applyMatch, loadHand }: OnlineMatchCtx) {
  const router = useRouter();
  const pub = match.public as ScopaPublic;
  const op = 1 - seat;

  const [selecting, setSelecting] = useState<Selecting | null>(null);
  const [myStaging, setMyStaging] = useState<MyStaging | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mosse e mani già viste all'apertura: non le rimostriamo.
  const [ackMove, setAckMove] = useState(() => pub.moveCount);
  const [seenRound, setSeenRound] = useState(() => pub.lastRound?.round ?? 0);
  const [initialMove] = useState(() => pub.moveCount);

  const lastMove = pub.lastMove;
  // Presa dell'avversario appena arrivata: la mostriamo un attimo prima di portarla via.
  const oppStaging =
    !!lastMove &&
    lastMove.player === op &&
    lastMove.captured.length > 0 &&
    lastMove.round === pub.round &&
    pub.moveCount > ackMove;

  useEffect(() => {
    if (!oppStaging) return;
    const t = setTimeout(() => setAckMove(pub.moveCount), STAGE_MS);
    return () => clearTimeout(t);
  }, [oppStaging, pub.moveCount]);

  // Suoni: carta dell'avversario, scope, fine partita.
  const prevMove = useRef(pub.moveCount);
  useEffect(() => {
    if (pub.moveCount > prevMove.current && lastMove?.player === op) sounds.play();
    prevMove.current = pub.moveCount;
  }, [pub.moveCount, lastMove, op]);

  const staging = !!myStaging || oppStaging;
  const showBanner = !!lastMove?.scopa && !staging && pub.moveCount > initialMove;
  useEffect(() => {
    if (showBanner) sounds.scopa();
  }, [showBanner, pub.moveCount]);

  const summary = pub.lastRound && pub.lastRound.round > seenRound ? pub.lastRound : null;
  const finished = match.status === "finished";
  const prevFinished = useRef(finished);
  useEffect(() => {
    if (!prevFinished.current && finished) {
      if (match.winner === seat) sounds.win();
      else sounds.lose();
    }
    prevFinished.current = finished;
  }, [finished, match.winner, seat]);

  const active = match.status === "active";
  const myTurn = active && pub.turn === seat && !staging && !summary;

  async function doMove(card: Card, captureIds: string[]) {
    setSelecting(null);
    setError(null);
    vibrate();
    sounds.play();
    setMyStaging({ card, captureIds, table: pub.table });
    setHand((h) => h.filter((c) => c.id !== card.id));
    try {
      const [res] = await Promise.all([
        api<{ public: ScopaPublic; hand: Card[]; version: number }>({
          action: "play",
          matchId: match.id,
          cardId: card.id,
          captureIds,
        }),
        sleep(captureIds.length ? STAGE_MS : DROP_MS),
      ]);
      applyMatch({ public: res.public, version: res.version, status: res.public.finished ? "finished" : "active" });
      setHand(() => res.hand);
      setAckMove(res.public.moveCount);
      if (captureIds.length && !res.public.lastMove?.scopa) sounds.take(captureIds.length >= 2 ? 10 : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadHand();
    } finally {
      setMyStaging(null);
    }
  }

  function onHandCard(cardId: string) {
    if (!myTurn) return;
    if (selecting?.cardId === cardId) return setSelecting(null); // ritocco = annulla
    const card = hand.find((c) => c.id === cardId);
    if (!card) return;
    const options = captureOptions(pub.table, card).map((o) => o.map((c) => c.id));
    if (options.length <= 1) void doMove(card, options[0] ?? []);
    else setSelecting({ cardId, options, picked: [] });
  }

  function onTableCard(cardId: string) {
    if (!selecting) return;
    let picked = selecting.picked.includes(cardId)
      ? selecting.picked.filter((id) => id !== cardId)
      : [...selecting.picked, cardId];
    let remaining = selecting.options.filter((o) => picked.every((id) => o.includes(id)));
    if (remaining.length === 0) {
      picked = [cardId];
      remaining = selecting.options.filter((o) => o.includes(cardId));
      if (remaining.length === 0) return;
    }
    if (remaining.length === 1) {
      const card = hand.find((c) => c.id === selecting.cardId);
      if (card) void doMove(card, remaining[0]);
    } else {
      setSelecting({ ...selecting, picked });
    }
  }

  // Cosa mostrare sul tavolo.
  let table: Card[] = pub.table;
  let played: { card: Card; byMe: boolean } | null = null;
  let takingIds: string[] = [];
  let hiddenFromPiles = new Set<string>();
  if (myStaging) {
    table = myStaging.table;
    played = { card: myStaging.card, byMe: true };
    takingIds = myStaging.captureIds;
    hiddenFromPiles = new Set([myStaging.card.id, ...myStaging.captureIds]);
  } else if (oppStaging && lastMove) {
    table = [...pub.table, ...lastMove.captured];
    played = { card: lastMove.card, byMe: false };
    takingIds = lastMove.captured.map((c) => c.id);
    hiddenFromPiles = new Set([lastMove.card.id, ...takingIds]);
  }
  const pile = (p: number) => pub.piles[p].filter((c) => !hiddenFromPiles.has(c.id));

  let message: string;
  if (error) message = error;
  else if (myStaging) message = myStaging.captureIds.length ? `Prendi con ${cardName(myStaging.card)}` : "Scarti";
  else if (oppStaging && lastMove) message = `${opp.username} prende con ${cardName(lastMove.card)}`;
  else if (!active) message = "Partita finita";
  else if (selecting) message = "Più prese possibili: tocca le carte da prendere";
  else if (myTurn) message = "Tocca a te";
  else message = `Tocca a ${opp.username}${oppConnected ? "" : " (non connesso)"}`;

  return (
    <ScopaTable
      title={`Scopa · ${pub.scores[seat]} – ${pub.scores[op]}`}
      info={`a ${pub.target}`}
      onExit={() => router.push("/online")}
      exitLabel="Lobby"
      oppName={opp.username}
      oppStatus={oppConnected ? "connesso" : "non connesso"}
      oppCount={pub.handCounts[op]}
      captured={[pub.captured[seat], pub.captured[op]]}
      scope={[pub.scope[seat], pub.scope[op]]}
      piles={[pile(seat), pile(op)]}
      deckCount={pub.deckCount}
      table={table}
      played={played}
      takingIds={takingIds}
      selectableIds={new Set(selecting?.options.flat() ?? [])}
      pickedIds={selecting?.picked ?? []}
      selectedCardId={selecting?.cardId ?? null}
      message={message}
      myTurn={myTurn}
      myHand={hand}
      onHandCard={onHandCard}
      onTableCard={onTableCard}
      scopaBanner={showBanner ? pub.moveCount : 0}
      dealOrder={pub.dealer === seat ? "opp-first" : "me-first"}
    >
      {finished && !staging ? (
        <OnlineEnd match={match} seat={seat} opp={opp}>
          {pub.lastRound && (
            <ScoreTable score={pub.lastRound.score} totals={pub.lastRound.scores} me={seat} oppName={opp.username} />
          )}
        </OnlineEnd>
      ) : (
        summary &&
        !staging && (
          <div className={tableStyles.overlay} role="dialog" aria-modal="true" aria-label="Fine della mano">
            <div className={tableStyles.panel}>
              <h2 className={tableStyles.panelTitle}>Fine della mano {summary.round}</h2>
              <ScoreTable score={summary.score} totals={summary.scores} me={seat} oppName={opp.username} />
              {summary.leftover && (
                <p className={scopaStyles.small}>
                  Le {summary.leftover.cards.length} carte rimaste in tavola sono andate{" "}
                  {summary.leftover.player === seat ? "a te" : `a ${opp.username}`}, che ha preso per ultimo.
                </p>
              )}
              <button
                className={`${tableStyles.bigBtn} ${tableStyles.bigBtnPrimary}`}
                onClick={() => setSeenRound(summary.round)}
              >
                Continua
              </button>
            </div>
          </div>
        )
      )}
    </ScopaTable>
  );
}
