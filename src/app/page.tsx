import Link from "next/link";
import PlayingCard from "@/components/PlayingCard";
import { makeCard } from "@/lib/carte/cards";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.home}>
      <div className={styles.fan} aria-hidden="true">
        <div className={styles.fanCard} style={{ rotate: "-14deg" }}>
          <PlayingCard card={makeCard("coppe", 1)} />
        </div>
        <div className={styles.fanCard} style={{ rotate: "0deg", translate: "0 -10px" }}>
          <PlayingCard card={makeCard("denari", 10)} />
        </div>
        <div className={styles.fanCard} style={{ rotate: "14deg" }}>
          <PlayingCard card={makeCard("spade", 3)} />
        </div>
      </div>

      <h1 className={styles.title}>Briscola e Scopa</h1>
      <p className={styles.subtitle}>Le carte napoletane, dal telefono.</p>

      <nav className={styles.menu}>
        <Link href="/briscola" className={`${styles.item} ${styles.primary}`}>
          <span>Briscola</span>
          <small>Contro il computer</small>
        </Link>
        <div className={`${styles.item} ${styles.soon}`} aria-disabled="true">
          <span>Gioca online</span>
          <small>Con amici e giocatori connessi · in arrivo</small>
        </div>
        <div className={`${styles.item} ${styles.soon}`} aria-disabled="true">
          <span>Scopa</span>
          <small>In arrivo</small>
        </div>
      </nav>

      <p className={styles.hint}>
        Per averla come un&apos;app: dal browser del telefono tocca <strong>Condividi</strong> o il menu{" "}
        <strong>⋮</strong>, poi <strong>Aggiungi a schermata Home</strong>.
      </p>
      <p className={styles.credit}>Carte napoletane: Wikimedia Commons, pubblico dominio.</p>
    </main>
  );
}
