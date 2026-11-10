// Service worker: rende il sito installabile e giocabile anche senza rete.
const CACHE = "carte-v3";
const SUITS = ["denari", "coppe", "spade", "bastoni"];
const CARDS = SUITS.flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => `/carte/${s}-${r}.webp`));
const PRECACHE = ["/", "/briscola", "/manifest.webmanifest", "/icon.svg", "/carte/retro.webp", ...CARDS];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // File con hash nel nome e immagini delle carte: non cambiano, prima la cache.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/carte/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pagine e resto: prima la rete (così gli aggiornamenti arrivano subito), poi la cache se offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
  );
});
