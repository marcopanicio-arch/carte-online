"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/carte/cards";
import { points } from "@/lib/briscola/engine";
import type { PublicState } from "@/lib/briscola/online";
import { api } from "@/lib/supabase/client";
import { sounds } from "@/lib/sound";
import BriscolaTable, { type TablePlay, vibrate } from "../../../briscola/BriscolaTable";
import tableStyles from "../../../briscola/briscola.module.css";
import OnlineEnd from "./OnlineEnd";
import type { OnlineMatchCtx } from "./useOnlineMatch";

const SHOW_TRICK = 900;
const COLLECT_ANIM = 450;

export default function BriscolaOnline({ match, seat, opp, oppConnected, hand, setHand, applyMatch, loadHand }: OnlineMatchCtx) {
  const router = useRouter();
  const pub = match.public as PublicState;
  const [error, setError] = useState<string | null>(null);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  // Numero dell'ultima mano chiusa che ho già visto portare via (all'apertura: quella attuale).
  const [seenTrick, setSeenTrick] = useState(() => pub.lastTrick?.trickCount ?? 0);
  const [collecting, setCollecting] = useState(false);

  const lastTrick = pub.lastTrick ?? null;
  const showingLast = Boolean(lastTrick && lastTrick.trickCount > seenTrick);

  // Mano appena chiusa: restano ferme entrambe le carte, poi vengono portate via.
  const lastTrickNo = lastTrick?.trickCount ?? 0;
  useEffect(() => {
    if (!showingLast) return;
    const t1 = setTimeout(() => setCollecting(true), SHOW_TRICK);
    const t2 = setTimeout(() => {
      setCollecting(false);
      setSeenTrick(lastTrickNo);
    }, SHOW_TRICK + COLLECT_ANIM);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [showingLast, lastTrickNo]);

  // Suoni: carta dell'avversario, mia presa, fine partita.
  const oppPlays = pub.trickCount + (pub.table.some((p) => p.player !== seat) ? 1 : 0);
  const prevOppPlays = useRef<number | null>(null);
  useEffect(() => {
    if (prevOppPlays.current !== null && oppPlays > prevOppPlays.current) sounds.play();
    prevOppPlays.current = oppPlays;
  }, [oppPlays]);
  useEffect(() => {
    if (!showingLast || !lastTrick || lastTrick.winner !== seat) return;
    const pts = lastTrick.plays.reduce((s, p) => s + points(p.card), 0);
    if (pts > 0) setTimeout(() => sounds.take(pts), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una volta per mano
  }, [showingLast, lastTrickNo]);
  const finishedShown = match.status === "finished" && !showingLast;
  const prevFinished = useRef(finishedShown);
  useEffect(() => {
    if (!prevFinished.current && finishedShown) {
      if (match.winner === null) sounds.tie();
      else if (match.winner === seat) sounds.win();
      else sounds.lose();
    }
    prevFinished.current = finishedShown;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando la partita finisce
  }, [finishedShown]);

  const active = match.status === "active";
  const myTurn = active && !showingLast && !pendingCard && pub.turn === seat;

  let plays: TablePlay[];
  if (showingLast && lastTrick) {
    plays = lastTrick.plays.map((p) => ({ mine: p.player === seat, card: p.card }));
  } else {
    plays = pub.table.map((p) => ({ mine: p.player === seat, card: p.card }));
    if (pendingCard) plays.push({ mine: true, card: pendingCard });
  }

  let message: string;
  if (showingLast && lastTrick) {
    const pts = lastTrick.plays.reduce((s, p) => s + points(p.card), 0);
    const who = lastTrick.winner === seat ? "Prendi tu" : `Prende ${opp.username}`;
    message = pts > 0 ? `${who} · ${pts} punti` : who;
  } else if (!active) {
    message = "Partita finita";
  } else if (pendingCard || myTurn) {
    message = pub.table.length ? "Rispondi" : "Tocca a te";
  } else {
    message = `Tocca a ${opp.username}${oppConnected ? "" : " (non connesso)"}`;
  }

  const onPlay = async (cardId: string) => {
    const card = hand.find((c) => c.id === cardId);
    if (!myTurn || !card) return;
    vibrate();
    sounds.play();
    setError(null);
    setPendingCard(card);
    setHand((h) => h.filter((c) => c.id !== cardId));
    try {
      const res = await api<{ public: PublicState; hand: Card[]; version: number }>({
        action: "play",
        matchId: match.id,
        cardId,
      });
      applyMatch({ public: res.public, version: res.version, status: res.public.finished ? "finished" : "active" });
      setHand(() => res.hand);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadHand();
    } finally {
      setPendingCard(null);
    }
  };

  const pts = pub.points;
  return (
    <BriscolaTable
      title="Briscola online"
      info={`Mano ${Math.min(pub.trickCount + 1, 20)}/20`}
      onExit={() => router.push("/online")}
      exitLabel="Lobby"
      oppName={opp.username}
      oppStatus={oppConnected ? "connesso" : "non connesso"}
      oppCount={pub.handCounts[1 - seat]}
      oppCaptured={pub.captured[1 - seat]}
      myCaptured={pub.captured[seat]}
      deckCount={pub.deckCount}
      briscola={pub.briscola}
      trump={pub.trump}
      plays={plays}
      collectingTo={showingLast && collecting && lastTrick ? (lastTrick.winner === seat ? "me" : "opp") : null}
      drawFirst={lastTrick ? (lastTrick.winner === seat ? "me" : "opp") : pub.turn === seat ? "me" : "opp"}
      message={error ?? message}
      myTurn={myTurn}
      myHand={hand}
      onPlay={onPlay}
    >
      {finishedShown && (
        <OnlineEnd match={match} seat={seat} opp={opp}>
          {pts && (
            <div className={tableStyles.score}>
              <div>
                <strong>{pts[seat]}</strong>
                <span>Tu</span>
              </div>
              <div className={tableStyles.scoreSep}>–</div>
              <div>
                <strong>{pts[1 - seat]}</strong>
                <span>{opp.username}</span>
              </div>
            </div>
          )}
        </OnlineEnd>
      )}
    </BriscolaTable>
  );
}
