"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { preloadCards } from "@/components/PlayingCard";
import { GAME_NAMES } from "@/lib/briscola/online";
import { useOnline } from "../../OnlineProvider";
import styles from "../../online.module.css";
import BriscolaOnline from "./BriscolaOnline";
import ScopaOnline from "./ScopaOnline";
import { useOnlineMatch } from "./useOnlineMatch";

export default function OnlineMatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready, session, online } = useOnline();
  const me = session?.user.id ?? null;
  const { match, hand, setHand, notFound, oppHere, applyMatch, loadHand } = useOnlineMatch(id, me);

  useEffect(() => preloadCards(), []);
  useEffect(() => {
    if (ready && !session) router.replace("/online/accedi");
  }, [ready, session, router]);

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

  if (!match.public) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>In attesa di {opp.username}</h1>
          <p className={styles.muted}>
            {GAME_NAMES[match.game]}: la partita parte appena accetta l&apos;invito.
          </p>
          <Link href="/online" className={`${styles.btn} ${styles.btnBig}`}>
            Torna alla lobby
          </Link>
        </div>
      </main>
    );
  }

  const ctx = {
    match,
    seat: seat as 0 | 1,
    opp,
    oppConnected: oppHere || online.has(opp.id),
    hand,
    setHand,
    applyMatch,
    loadHand,
  };
  return match.game === "scopa" ? <ScopaOnline {...ctx} /> : <BriscolaOnline {...ctx} />;
}
