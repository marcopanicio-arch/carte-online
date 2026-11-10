"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { useOnline } from "../OnlineProvider";
import styles from "../online.module.css";

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

export default function AccediPage() {
  const router = useRouter();
  const { session } = useOnline();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/online");
  }, [session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const sb = supabase();
      if (mode === "signup") {
        if (!USERNAME.test(username)) {
          throw new Error("Il nome deve avere 3–20 caratteri: lettere, numeri o _");
        }
        const { data: free, error: rpcErr } = await sb.rpc("username_available", { name: username });
        if (rpcErr) throw rpcErr;
        if (!free) throw new Error("Questo nome è già preso, scegline un altro");
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        if (!data.session) {
          setNotice("Ti abbiamo mandato una mail: apri il link per confermare l'account, poi accedi.");
          setMode("login");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.bar}>
          <Link href="/" className={styles.barLink}>
            ‹ Menu
          </Link>
        </div>
        <h1 className={styles.title}>Gioca online</h1>
        <p className={styles.muted}>Crea un account per sfidare amici e giocatori connessi.</p>

        <div className={styles.tabs} role="tablist">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`${styles.tab} ${mode === m ? styles.tabActive : ""}`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "login" ? "Accedi" : "Registrati"}
            </button>
          ))}
        </div>

        <form className={`${styles.section} ${styles.form}`} onSubmit={submit}>
          {mode === "signup" && (
            <label className={styles.field}>
              Nome giocatore
              <input
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value.trim())}
                autoComplete="username"
                autoCapitalize="none"
                placeholder="es. mario_88"
                required
              />
            </label>
          )}
          <label className={styles.field}>
            Email
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              autoComplete="email"
              required
            />
          </label>
          <label className={styles.field}>
            Password
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBig}`} disabled={busy}>
            {busy ? "Attendi…" : mode === "login" ? "Accedi" : "Crea account"}
          </button>
        </form>
      </div>
    </main>
  );
}

function translate(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Email o password sbagliate";
  if (/email not confirmed/i.test(msg)) return "Devi prima confermare l'email (controlla la posta)";
  if (/already registered/i.test(msg)) return "Esiste già un account con questa email";
  if (/password should be at least/i.test(msg)) return "La password deve avere almeno 6 caratteri";
  if (/rate limit/i.test(msg)) return "Troppi tentativi, riprova tra qualche minuto";
  if (/database error saving new user/i.test(msg)) return "Nome giocatore non valido o già preso";
  return msg;
}
