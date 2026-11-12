// MyMind tascabile · tiene l'app sul telefono anche senza rete (i dati no: quelli arrivano solo dal Mac, cifrati).
// Prima la rete, poi la copia: un aggiornamento pubblicato si vede alla prima apertura con la rete.
const V = "mmt-1.9";
const FILE = ["./", "index.html", "stile.css", "icone.js", "tunnel.js", "app.js", "manifest.webmanifest", "icone/icona.svg", "icone/icona-192.png", "icone/icona-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { if (r.ok) { const k = r.clone(); caches.open(V).then((c) => c.put(e.request, k)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
