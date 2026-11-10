"use client";

// Stato condiviso delle pagine online: chi sono, il mio profilo, chi è connesso adesso.

import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";

export interface Profile {
  id: string;
  username: string;
}

interface OnlineCtx {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Utenti connessi in questo momento, per id. */
  online: Map<string, Profile>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<OnlineCtx | null>(null);
const PRESENCE_GRACE_MS = 12000;

export function useOnline(): OnlineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnline fuori da OnlineProvider");
  return ctx;
}

export default function OnlineProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [online, setOnline] = useState<Map<string, Profile>>(new Map());

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Profilo e presenza: appena entro, mi annuncio sul canale "online".
  useEffect(() => {
    if (!userId) return;
    const sb = supabase();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    // Chi sparisce dalla presenza resta "connesso" per qualche secondo: evita lo sfarfallio
    // quando un telefono perde la rete per un attimo.
    const lastSeen = new Map<string, { profile: Profile; at: number }>();
    const publish = () => {
      if (cancelled) return;
      const now = Date.now();
      const present = channel ? new Set(Object.keys(channel.presenceState())) : new Set<string>();
      const map = new Map<string, Profile>();
      for (const [id, v] of lastSeen) {
        if (present.has(id)) v.at = now;
        if (now - v.at < PRESENCE_GRACE_MS) map.set(id, v.profile);
        else lastSeen.delete(id);
      }
      setOnline(map);
    };
    const sweep = setInterval(publish, 4000);

    sb.from("profiles")
      .select("id, username")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProfile(data);
        channel = sb.channel("online", { config: { presence: { key: userId } } });
        channel
          .on("presence", { event: "sync" }, () => {
            const state = channel!.presenceState<{ username: string }>();
            const now = Date.now();
            for (const [id, metas] of Object.entries(state)) {
              if (metas[0]) lastSeen.set(id, { profile: { id, username: metas[0].username }, at: now });
            }
            publish();
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") channel!.track({ username: data.username });
          });
      });

    return () => {
      cancelled = true;
      clearInterval(sweep);
      if (channel) sb.removeChannel(channel);
      setOnline(new Map());
      setProfile(null);
    };
  }, [userId]);

  const signOut = async () => {
    await supabase().auth.signOut();
  };

  return <Ctx.Provider value={{ ready, session, profile, online, signOut }}>{children}</Ctx.Provider>;
}
