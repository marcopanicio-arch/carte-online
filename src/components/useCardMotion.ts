"use client";

// Animazioni "FLIP" delle carte: a ogni aggiornamento, ogni carta che ha cambiato posto
// scivola dalla posizione vecchia a quella nuova, invece di teletrasportarsi.
//
// Nel markup:
//   data-flip="<id carta>"      → la carta viene seguita tra mano, tavolo, ecc. (stesso id = stessa carta)
//   data-from="deck" | "opp"    → se compare dal nulla, parte dall'elemento con data-anchor uguale
//   data-deal + data-owner="me"|"opp" → carta pescata: le pescate partono una dopo l'altra
//   data-anchor="deck" | "opp"  → punti di partenza (mazzo, mano dell'avversario)

import { type RefObject, useLayoutEffect, useRef } from "react";
import { sounds } from "@/lib/sound";

interface Box {
  x: number;
  y: number;
  w: number;
}

/** Posizione del centro rispetto al contenitore, ignorando le trasformazioni CSS in corso. */
function boxOf(el: HTMLElement, root: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2, w: el.offsetWidth };
}

const EASE = "cubic-bezier(0.22, 0.75, 0.3, 1)";

export function useCardMotion(
  rootRef: RefObject<HTMLElement | null>,
  opts: { dealOrder?: "me-first" | "opp-first"; dealStagger?: number } = {},
) {
  const prev = useRef<Map<string, Box>>(new Map());
  const { dealOrder = "me-first", dealStagger = 170 } = opts;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const anchors: Record<string, Box | undefined> = {};
    root.querySelectorAll<HTMLElement>("[data-anchor]").forEach((a) => {
      anchors[a.dataset.anchor!] = boxOf(a, root);
    });

    const next = new Map<string, Box>();
    const moves: { el: HTMLElement; from: Box; to: Box; enter: boolean; deal: boolean; mine: boolean }[] = [];

    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const key = el.dataset.flip!;
      const to = boxOf(el, root);
      next.set(key, to);
      const old = prev.current.get(key);
      const from = old ?? (el.dataset.from ? anchors[el.dataset.from] : undefined);
      if (!from) return;
      if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1 && Math.abs(from.w - to.w) < 1) return;
      moves.push({ el, from, to, enter: !old, deal: "deal" in el.dataset, mine: el.dataset.owner === "me" });
    });
    prev.current = next;
    if (reduce || moves.length === 0) return;

    // Le carte pescate escono dal mazzo una alla volta, alternandosi: prima chi ha preso.
    const deals = moves.filter((m) => m.deal && m.enter);
    // In una pescata normale si alternano: vincitore, perdente. All'inizio, tre giri.
    const mineDeals = deals.filter((d) => d.mine);
    const oppDeals = deals.filter((d) => !d.mine);
    const firstGroup = dealOrder === "me-first" ? mineDeals : oppDeals;
    const secondGroup = dealOrder === "me-first" ? oppDeals : mineDeals;
    const delays = new Map<HTMLElement, number>();
    let step = 0;
    for (let i = 0; i < Math.max(firstGroup.length, secondGroup.length); i++) {
      if (firstGroup[i]) delays.set(firstGroup[i].el, step++ * dealStagger);
      if (secondGroup[i]) delays.set(secondGroup[i].el, step++ * dealStagger);
    }

    for (const m of moves) {
      const dx = m.from.x - m.to.x;
      const dy = m.from.y - m.to.y;
      const s = m.from.w / m.to.w;
      const delay = delays.get(m.el) ?? 0;
      if (delays.has(m.el)) setTimeout(() => sounds.draw(), delay);
      m.el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: m.enter ? 0.85 : 1 },
          { transform: "none", opacity: 1 },
        ],
        { duration: m.enter ? 460 : 340, delay, easing: EASE, fill: "backwards" },
      );
    }
  });
}
