import type { Metadata } from "next";
import OnlineProvider from "./OnlineProvider";

export const metadata: Metadata = {
  title: "Gioca online",
};

export default function OnlineLayout({ children }: LayoutProps<"/online">) {
  return <OnlineProvider>{children}</OnlineProvider>;
}
