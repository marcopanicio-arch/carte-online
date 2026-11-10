"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { preloadCards } from "@/components/PlayingCard";
import type { Card } from "@/lib/carte/cards";
import { points } from "@/lib/briscola/engine";
import type { MatchRow, PublicState } from "@/lib/briscola/online";
import { api, supabase } from "@/lib/supabase/client";
import BriscolaTable, { type TablePlay, vibrate } from "../../../briscola/BriscolaTable";
import tableStyles from "../../../briscola/briscola.module.css";
import { type Profile, useOnline } from "../../OnlineProvider";
import styles from "../../online.module.css";

const SHOW_TRICK = 900;
const COLLECT_ANIM = 450;

type FullMatch = MatchRow & { p0: Profile; p1: Profile };

export default function OnlineMatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, session } = useOnline();
  const me = session?.user.id ?? null;

  const [match, setMatch] = useState<FullMatch | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [oppHere, setOppHere] = useState(false);
  // Numero dell'ultima mano chiusa che ho già visto portare via.
  const [seenTrick, setSeenTrick] = useState<number | null>(null);
  const [collecting, setCollecting] = useState(false);
  const versionRef = useRef(-1);

  useEffect(() => preloadCards(), []);

  useEffect(() => {
    if (ready && !session) router.replace("/online/accedi");
  }, [ready, session, router]);

  const loadHand = useCallback(() => {
    if (!me) return;
    supabase()
      .from("match_hands")
      .select("cards")
      .eq("match_id", id)
      .eq("player", me)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setHand(data.cards as Card[]);
      });
  }, [id, me]);

  const applyMatch = useCallback((row: Partial<MatchRow>) => {
    if (row.version === undefined || row.version <= versionRef.current) return;
    versionRef.current = row.version;
    setMatch((prev) => (prev ? { ...prev, ...row } : prev));
  }, []);

  // Caricamento iniziale e aggiornamenti in tempo reale della partita.
  useEffect(() => {
    if (!me) return;
    const sb = supabase();
    sb.from("matches")
      .select("*, p0:profiles!matches_player0_fkey(id, username), p1:profiles!matches_player1_fkey(id, username)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setNotFound(true);
        const row = data as unknown as FullMatch;
        versionRef.current = row.version;
        setMatch(row);
        setSeenTrick(row.public?.lastTrick?.trickCount ?? 0);
      });
    loadHand();

    const channel = sb
      .channel(`partita:${id}`, { config: { presence: { key: me } } })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` }, (payload) => {
        applyMatch(payload.new as MatchRow);
        loadHand();
      })
      .on("presence", { event: "sync" }, () => {
        setOppHere(Object.keys(channel.presenceState()).some((k) => k !== me));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      sb.removeChannel(channel);
    };
  }, [id, me, loadHand, applyMatch]);

  const pub: PublicState | null = match?.public ?? null;
  const lastTrick = pub?.lastTrick ?? null;
  const showingLast = Boolean(lastTrick && seenTrick !== null && lastTrick.trickCount > seenTrick);

  // Mano appena chiusa: restano ferme entrambe le carte, poi vengono portate via.
  useEffect(() => {
    if (!showingLast || !lastTrick) return;
    const t1 = setTimeout(() => setCollecting(true), SHOW_TRICK);
    const t2 = setTimeout(() => {
      setCollecting(false);
      setSeenTrick(lastTrick.trickCount);
    }, SHOW_TRICK + COLLECT_ANIM);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [showingLast, lastTrick]);

  if (notFound) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Partita non trovata</h1>
          <Link href="/online" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBig}`}>
            Torna alla lobby
          </Link>
        </div>
      </main>
    );
  }
  if (!match || !me) return <main className={styles.page} />;

  const seat = match.player0 === me ? 0 : 1;
  const opp = seat === 0 ? match.p1 : match.p0;

  if (!pub) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>In attesa di {opp.username}</h1>
          <p className={styles.muted}>La partita parte appena accetta l&apos;invito.</p>
          <Link href="/online" className={`${styles.btn} ${styles.btnBig}`}>
            Torna alla lobby
          </Link>
        </div>
      </main>
    );
  }

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
    message = `Tocca a ${opp.username}${oppHere ? "" : " (non connesso)"}`;
  }

  const onPlay = async (cardId: string) => {
    const card = hand.find((c) => c.id === cardId);
    if (!myTurn || !card) return;
    vibrate();
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
      setHand(res.hand);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadHand();
    } finally {
      setPendingCard(null);
    }
  };

  const shownHand = hand;
  const finishedShown = match.status === "finished" && !showingLast;

  return (
    <BriscolaTable
      title="Briscola online"
      info={`Mano ${Math.min(pub.trickCount + 1, 20)}/20`}
      onExit={() => router.push("/online")}
      exitLabel="Lobby"
      oppName={opp.username}
      oppStatus={oppHere ? "connesso" : "non connesso"}
      oppCount={pub.handCounts[1 - seat]}
      oppCaptured={pub.captured[1 - seat]}
      myCaptured={pub.captured[seat]}
      deckCount={pub.deckCount}
      briscola={pub.briscola}
      trump={pub.trump}
      plays={plays}
      collectingTo={showingLast && collecting && lastTrick ? (lastTrick.winner === seat ? "me" : "opp") : null}
      message={error ?? message}
      myTurn={myTurn}
      myHand={shownHand}
      onPlay={onPlay}
    >
      {finishedShown && <OnlineEnd match={match} seat={seat} opp={opp} />}
    </BriscolaTable>
  );
}

function OnlineEnd({ match, seat, opp }: { match: FullMatch; seat: 0 | 1; opp: Profile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pts = match.public?.points;
  const forfeit = match.result === "forfeit";

  let title: string;
  if (match.winner === null) title = "Pareggio!";
  else if (match.winner === seat) title = forfeit ? `${opp.username} ha abbandonato` : "Hai vinto!";
  else title = forfeit ? "Hai abbandonato" : "Hai perso";

  const rematch = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api({ action: "invite", opponentId: opp.id });
      router.push("/online");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className={tableStyles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={tableStyles.panel}>
        <h2 className={tableStyles.panelTitle}>{title}</h2>
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
        {msg && <p className={tableStyles.panelText}>{msg}</p>}
        <button className={`${tableStyles.bigBtn} ${tableStyles.bigBtnPrimary}`} onClick={rematch} disabled={busy}>
          Chiedi la rivincita
        </button>
        <button className={tableStyles.bigBtn} onClick={() => router.push("/online")}>
          Torna alla lobby
        </button>
      </div>
    </div>
  );
}
