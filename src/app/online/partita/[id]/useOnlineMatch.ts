"use client";

// Parte comune delle partite online (briscola e scopa): caricamento, aggiornamenti in tempo reale,
// controllo di riserva periodico, la mia mano e la presenza dell'avversario.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/lib/carte/cards";
import type { MatchRow } from "@/lib/briscola/online";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "../../OnlineProvider";

/** Controllo di riserva: se un aggiornamento in tempo reale va perso, lo recuperiamo entro pochi secondi. */
const POLL_MS = 2500;
/** L'avversario risulta "non connesso" solo dopo un'assenza prolungata, non per un attimo di rete. */
const OFFLINE_GRACE_MS = 12000;

export type FullMatch = MatchRow & { p0: Profile; p1: Profile };

export interface OnlineMatchCtx {
  match: FullMatch;
  seat: 0 | 1;
  opp: Profile;
  oppConnected: boolean;
  hand: Card[];
  setHand: (fn: (h: Card[]) => Card[]) => void;
  /** Applica uno stato solo se più recente. Ritorna true se l'ha applicato. */
  applyMatch: (row: Partial<MatchRow>) => boolean;
  loadHand: () => void;
}

export function useOnlineMatch(id: string, me: string | null) {
  const [match, setMatch] = useState<FullMatch | null>(null);
  const [hand, setHandState] = useState<Card[]>([]);
  const [notFound, setNotFound] = useState(false);
  // Si parte ottimisti: se l'avversario non c'è, lo dirà la presenza dopo il periodo di tolleranza.
  const [oppHere, setOppHere] = useState(true);
  const versionRef = useRef(-1);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setHand = useCallback((fn: (h: Card[]) => Card[]) => setHandState(fn), []);

  const loadHand = useCallback(() => {
    if (!me) return;
    supabase()
      .from("match_hands")
      .select("cards")
      .eq("match_id", id)
      .eq("player", me)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setHandState(data.cards as Card[]);
      });
  }, [id, me]);

  const applyMatch = useCallback((row: Partial<MatchRow>) => {
    if (row.version === undefined || row.version <= versionRef.current) return false;
    versionRef.current = row.version;
    setMatch((prev) => (prev ? { ...prev, ...row } : prev));
    return true;
  }, []);

  const refresh = useCallback(() => {
    supabase()
      .from("matches")
      .select("status, public, version, winner, result")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && applyMatch(data as Partial<MatchRow>)) loadHand();
      });
  }, [id, applyMatch, loadHand]);

  // Rete di sicurezza: controllo periodico e al ritorno sull'app (i telefoni sospendono le pagine in background).
  useEffect(() => {
    if (!me) return;
    const t = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [me, refresh]);

  // Caricamento iniziale e aggiornamenti in tempo reale.
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
      });
    loadHand();

    const channel = sb
      .channel(`partita:${id}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
        (payload) => {
          if (applyMatch(payload.new as MatchRow)) loadHand();
        },
      )
      .on("presence", { event: "sync" }, () => {
        const here = Object.keys(channel.presenceState()).some((k) => k !== me);
        if (offlineTimer.current) clearTimeout(offlineTimer.current);
        offlineTimer.current = null;
        if (here) setOppHere(true);
        else offlineTimer.current = setTimeout(() => setOppHere(false), OFFLINE_GRACE_MS);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      if (offlineTimer.current) clearTimeout(offlineTimer.current);
      sb.removeChannel(channel);
    };
  }, [id, me, loadHand, applyMatch]);

  return { match, hand, setHand, notFound, oppHere, applyMatch, loadHand };
}
