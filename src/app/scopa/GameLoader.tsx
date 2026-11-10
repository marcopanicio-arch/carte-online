"use client";

import dynamic from "next/dynamic";

// Come per la briscola: preferenze e statistiche stanno sul telefono, quindi solo nel browser.
const ScopaGame = dynamic(() => import("./ScopaGame"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", background: "#1d5a39" }} />,
});

export default function GameLoader() {
  return <ScopaGame />;
}
