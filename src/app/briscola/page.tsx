import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Briscola",
  description: "Gioca a briscola contro il computer, dal telefono.",
};

export default function BriscolaPage() {
  return <GameLoader />;
}
