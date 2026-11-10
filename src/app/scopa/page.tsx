import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Scopa",
  description: "Gioca a scopa contro il computer, dal telefono.",
};

export default function ScopaPage() {
  return <GameLoader />;
}
