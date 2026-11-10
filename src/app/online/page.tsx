"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchRow } from "@/lib/briscola/online";
import { api, supabase, supabaseConfigured } from "@/lib/supabase/client";
import { type Profile, useOnline } from "./OnlineProvider";
import styles from "./online.module.css";

interface FriendRow {
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  req: Profile;
  add: Profile;
}

type LobbyMatch = MatchRow & { p0: Profile; p1: Profile };

export default function Lobby() {
  const router = useRouter();
  const { ready, session, profile, online, signOut } = useOnline();
  const me = session?.user.id ?? null;

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [matches, setMatches] = useState<LobbyMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Inviti che ho mandato: quando uno diventa "active" vuol dire che è stato accettato.
  const myInvites = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (ready && !session && supabaseConfigured) router.replace("/online/accedi");
  }, [ready, session, router]);

  const reload = useCallback(() => {
    const sb = supabase();
    return Promise.all([
      sb
        .from("friendships")
        .select(
          "requester, addressee, status, req:profiles!friendships_requester_fkey(id, username), add:profiles!friendships_addressee_fkey(id, username)",
        )
        .order("created_at"),
      sb
        .from("matches")
        .select("*, p0:profiles!matches_player0_fkey(id, username), p1:profiles!matches_player1_fkey(id, username)")
        .in("status", ["invited", "active"])
        .order("created_at", { ascending: false }),
    ]).then(([f, m]) => {
      if (f.data) setFriends(f.data as unknown as FriendRow[]);
      if (!m.data) return;
      const rows = m.data as unknown as LobbyMatch[];
      setMatches(rows);
      const accepted = rows.find((r) => r.status === "active" && myInvites.current.has(r.id));
      myInvites.current = new Set(rows.filter((r) => r.status === "invited" && r.player0 === me).map((r) => r.id));
      if (accepted) router.push(`/online/partita/${accepted.id}`);
    });
  }, [me, router]);

  // Dati iniziali + aggiornamenti in tempo reale su amicizie e partite.
  useEffect(() => {
    if (!me) return;
    const sb = supabase();
    reload();
    const channel = sb
      .channel(`lobby:${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new as Partial<MatchRow>;
        // Il mio invito è stato accettato: si va al tavolo.
        if (payload.eventType === "UPDATE" && row.status === "active" && row.player0 === me && row.id) {
          router.push(`/online/partita/${row.id}`);
        }
        reload();
      })
      .subscribe();

    // Rete di sicurezza se un aggiornamento in tempo reale va perso.
    const t = setInterval(reload, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      sb.removeChannel(channel);
    };
  }, [me, reload, router]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const accepted = useMemo(
    () =>
      friends
        .filter((f) => f.status === "accepted")
        .map((f) => (f.requester === me ? f.add : f.req))
        .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.username.localeCompare(b.username)),
    [friends, me, online],
  );
  const incoming = friends.filter((f) => f.status === "pending" && f.addressee === me);
  const outgoing = friends.filter((f) => f.status === "pending" && f.requester === me);
  const relatedIds = new Set(friends.flatMap((f) => [f.requester, f.addressee]));

  const invitesIn = matches.filter((m) => m.status === "invited" && m.player1 === me);
  const invitesOut = matches.filter((m) => m.status === "invited" && m.player0 === me);
  const active = matches.filter((m) => m.status === "active");
  const busyWith = new Set(matches.flatMap((m) => [m.player0, m.player1]));

  const others = [...online.values()].filter((p) => p.id !== me).sort((a, b) => a.username.localeCompare(b.username));

  const invite = (p: Profile) =>
    run(`invite:${p.id}`, () => api({ action: "invite", opponentId: p.id }));
  const addFriend = (p: Profile) =>
    run(`friend:${p.id}`, async () => {
      const { error } = await supabase().from("friendships").insert({ requester: me, addressee: p.id });
      if (error) throw new Error(error.code === "23505" ? "Richiesta già esistente" : error.message);
    });
  const removeFriend = (a: string, b: string) =>
    run(`unfriend:${a}:${b}`, async () => {
      const { error } = await supabase().from("friendships").delete().eq("requester", a).eq("addressee", b);
      if (error) throw error;
    });
  const acceptFriend = (requester: string) =>
    run(`accept-friend:${requester}`, async () => {
      const { error } = await supabase()
        .from("friendships")
        .update({ status: "accepted" })
        .eq("requester", requester)
        .eq("addressee", me!);
      if (error) throw error;
    });

  if (!supabaseConfigured) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.bar}>
            <Link href="/" className={styles.barLink}>
              ‹ Menu
            </Link>
          </div>
          <h1 className={styles.title}>Gioca online</h1>
          <div className={styles.error}>Il gioco online non è ancora configurato (mancano le chiavi Supabase).</div>
        </div>
      </main>
    );
  }

  if (!ready || !session || !profile) {
    return <main className={styles.page} />;
  }

  const friendButton = (p: Profile) =>
    !relatedIds.has(p.id) && (
      <button className={styles.btn} disabled={busy === `friend:${p.id}`} onClick={() => addFriend(p)}>
        + Amico
      </button>
    );
  const inviteButton = (p: Profile) => (
    <button
      className={`${styles.btn} ${styles.btnPrimary}`}
      disabled={busyWith.has(p.id) || busy === `invite:${p.id}`}
      onClick={() => invite(p)}
    >
      Sfida
    </button>
  );

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.bar}>
          <Link href="/" className={styles.barLink}>
            ‹ Menu
          </Link>
          <button className={styles.barLink} onClick={signOut}>
            Esci
          </button>
        </div>
        <div>
          <h1 className={styles.title}>Ciao, {profile.username}</h1>
          <p className={styles.muted}>Sfida un amico o chiunque sia connesso adesso.</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {invitesIn.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              Ti hanno sfidato <span className={styles.badge}>{invitesIn.length}</span>
            </div>
            {invitesIn.map((m) => (
              <div key={m.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{m.p0.username}</strong>
                  <small>Briscola a 2</small>
                </div>
                <button
                  className={styles.btn}
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => api({ action: "decline", matchId: m.id }))}
                >
                  No
                </button>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={busy === m.id}
                  onClick={() =>
                    run(m.id, async () => {
                      await api({ action: "accept", matchId: m.id });
                      router.push(`/online/partita/${m.id}`);
                    })
                  }
                >
                  Gioca
                </button>
              </div>
            ))}
          </section>
        )}

        {(active.length > 0 || invitesOut.length > 0) && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>Le tue partite</div>
            {active.map((m) => {
              const opp = m.player0 === me ? m.p1 : m.p0;
              const myTurn = m.public && m.public.turn === (m.player0 === me ? 0 : 1);
              return (
                <div key={m.id} className={styles.row}>
                  <span className={`${styles.dot} ${online.has(opp.id) ? styles.dotOn : ""}`} />
                  <div className={styles.rowMain}>
                    <strong>contro {opp.username}</strong>
                    <small>{myTurn ? "Tocca a te" : `Tocca a ${opp.username}`}</small>
                  </div>
                  <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    disabled={busy === m.id}
                    onClick={() => run(m.id, () => api({ action: "forfeit", matchId: m.id }))}
                  >
                    Abbandona
                  </button>
                  <Link href={`/online/partita/${m.id}`} className={`${styles.btn} ${styles.btnPrimary}`}>
                    Entra
                  </Link>
                </div>
              );
            })}
            {invitesOut.map((m) => (
              <div key={m.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{m.p1.username}</strong>
                  <small>In attesa che accetti…</small>
                </div>
                <button
                  className={styles.btn}
                  disabled={busy === m.id}
                  onClick={() => run(m.id, () => api({ action: "decline", matchId: m.id }))}
                >
                  Annulla
                </button>
              </div>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Amici</div>
          {accepted.length === 0 && <div className={styles.empty}>Nessun amico ancora: cercalo qui sotto.</div>}
          {accepted.map((p) => (
            <div key={p.id} className={styles.row}>
              <span className={`${styles.dot} ${online.has(p.id) ? styles.dotOn : ""}`} />
              <div className={styles.rowMain}>
                <strong>{p.username}</strong>
                <small>{online.has(p.id) ? "Connesso" : "Non connesso"}</small>
              </div>
              {online.has(p.id) && inviteButton(p)}
            </div>
          ))}
        </section>

        {(incoming.length > 0 || outgoing.length > 0) && (
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              Richieste d&apos;amicizia
              {incoming.length > 0 && <span className={styles.badge}>{incoming.length}</span>}
            </div>
            {incoming.map((f) => (
              <div key={f.requester} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{f.req.username}</strong>
                  <small>Vuole essere tuo amico</small>
                </div>
                <button className={styles.btn} onClick={() => removeFriend(f.requester, f.addressee)}>
                  No
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => acceptFriend(f.requester)}>
                  Accetta
                </button>
              </div>
            ))}
            {outgoing.map((f) => (
              <div key={f.addressee} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{f.add.username}</strong>
                  <small>Richiesta inviata</small>
                </div>
                <button className={styles.btn} onClick={() => removeFriend(f.requester, f.addressee)}>
                  Annulla
                </button>
              </div>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            Connessi adesso <span>{others.length}</span>
          </div>
          {others.length === 0 && <div className={styles.empty}>Al momento non c&apos;è nessun altro connesso.</div>}
          {others.map((p) => (
            <div key={p.id} className={styles.row}>
              <span className={`${styles.dot} ${styles.dotOn}`} />
              <div className={styles.rowMain}>
                <strong>{p.username}</strong>
                <small>{busyWith.has(p.id) ? "Sta giocando con te" : "Disponibile"}</small>
              </div>
              {friendButton(p)}
              {inviteButton(p)}
            </div>
          ))}
        </section>

        <PlayerSearch me={me!} relatedIds={relatedIds} onAdd={addFriend} />
      </div>
    </main>
  );
}

function PlayerSearch({
  me,
  relatedIds,
  onAdd,
}: {
  me: string;
  relatedIds: Set<string>;
  onAdd: (p: Profile) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[] | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    if (term.length < 2) return;
    const { data } = await supabase()
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${term}%`)
      .neq("id", me)
      .order("username")
      .limit(10);
    setResults(data ?? []);
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>Cerca giocatore</div>
      <form className={styles.searchRow} onSubmit={search}>
        <input
          className={styles.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome giocatore"
          autoCapitalize="none"
        />
        <button className={`${styles.btn} ${styles.btnPrimary}`}>Cerca</button>
      </form>
      {results?.length === 0 && <div className={styles.empty}>Nessuno trovato.</div>}
      {results?.map((p) => (
        <div key={p.id} className={styles.row}>
          <div className={styles.rowMain}>
            <strong>{p.username}</strong>
          </div>
          {relatedIds.has(p.id) ? (
            <small className={styles.empty}>Già amici o richiesta inviata</small>
          ) : (
            <button
              className={styles.btn}
              onClick={() => {
                onAdd(p);
                setResults((r) => r?.filter((x) => x.id !== p.id) ?? null);
              }}
            >
              + Amico
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
