// Service worker : permet d'ouvrir et d'utiliser l'appli sans réseau (métro, avion…).
//
// Stratégie « réseau d'abord » : avec du réseau, on charge toujours la dernière version (comme sans
// service worker) et on en garde une copie ; sans réseau, ou si le réseau ne répond pas en
// NETWORK_TIMEOUT ms (réseau très lent dans les transports), on sert la copie.
// Les échanges avec le serveur (/api/…) ne passent jamais par ici : ils ne sont jamais mis en cache.

const CACHE = "kanji-keiko";
const NETWORK_TIMEOUT = 4000;
// Polices Google : mises en copie elles aussi, sinon l'appli hors ligne perd ses polices.
const OTHER_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

// Installation : copie de la page et de tous les fichiers qu'elle charge (lus dans index.html),
// pour que l'appli marche hors ligne dès la première visite.
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch("./", { cache: "no-store" });
    const html = await res.clone().text();
    await cache.put("./", res);
    const files = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);   // chemins relatifs seulement
    await Promise.all(files.map(f => fetch(f, { cache: "no-store" })
      .then(r => r.ok && cache.put(f, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  const ours = url.origin === self.location.origin && !url.pathname.includes("/api/");
  if (req.method !== "GET" || !(ours || OTHER_ORIGINS.includes(url.origin))) return;
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const req = event.request, cache = await caches.open(CACHE);
  // La réponse du réseau met toujours la copie à jour, même si elle arrive après le délai.
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, NETWORK_TIMEOUT))]);
  } catch (e) {
    const copy = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" && await cache.match("./"));
    return copy || network;   // pas de copie : on attend quand même le réseau
  }
}
