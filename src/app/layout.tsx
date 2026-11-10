import type { Metadata, Viewport } from "next";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Briscola e Scopa", template: "%s · Carte" },
  description: "Briscola e scopa dal telefono, contro il computer o con gli amici.",
  appleWebApp: { capable: true, title: "Carte", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/180.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d5a39",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
