import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briscola e Scopa",
    short_name: "Carte",
    description: "Briscola e scopa dal telefono, contro il computer o con gli amici.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1d5a39",
    theme_color: "#1d5a39",
    lang: "it",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
