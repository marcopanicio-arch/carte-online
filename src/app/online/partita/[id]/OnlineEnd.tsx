"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { api } from "@/lib/supabase/client";
import tableStyles from "../../../briscola/briscola.module.css";
import type { Profile } from "../../OnlineProvider";
import type { FullMatch } from "./useOnlineMatch";

/** Pannello di fine partita online, con la rivincita allo stesso gioco. */
export default function OnlineEnd({
  match,
  seat,
  opp,
  children,
}: {
  match: FullMatch;
  seat: 0 | 1;
  opp: Profile;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const forfeit = match.result === "forfeit";

  let title: string;
  if (match.winner === null) title = "Pareggio!";
  else if (match.winner === seat) title = forfeit ? `${opp.username} ha abbandonato` : "Hai vinto!";
  else title = forfeit ? "Hai abbandonato" : "Hai perso";

  const rematch = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api({ action: "invite", opponentId: opp.id, game: match.game });
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
        {children}
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
