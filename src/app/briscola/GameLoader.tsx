"use client";

import dynamic from "next/dynamic";

// Il gioco legge preferenze e statistiche dal telefono, quindi gira solo nel browser.
const BriscolaGame = dynamic(() => import("./BriscolaGame"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", background: "#1d5a39" }} />,
});

export default function GameLoader() {
  return <BriscolaGame />;
}
