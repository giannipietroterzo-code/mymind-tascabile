// MyMind tascabile · tiene l'app sul telefono anche senza rete (i dati no: quelli arrivano solo dal Mac, cifrati).
// Prima la rete, poi la copia: un aggiornamento pubblicato si vede alla prima apertura con la rete.
const V = "mmt-1.37";
const FILE = ["./", "index.html", "stile.css", "icone.js", "tunnel.js", "app.js", "manifest.webmanifest", "icone/icona.svg", "icone/icona-192.png", "icone/icona-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== "mmt-condiviso" && k !== "mmt-busta").map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// «Condividi → MyMind» da un'altra app: Android manda qui un POST. Lo fermo prima che esca in rete, metto testo e foto
// da parte (cache «mmt-condiviso») e apro l'app: li legge lei dopo il PIN e li cancella.
async function condiviso(req) {
  try {
    const fd = await req.formData(), c = await caches.open("mmt-condiviso");
    const testo = ["titolo", "testo", "url"].map((k) => (fd.get(k) || "").toString().trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("\n");
    await c.put("testo", new Response(testo));
    let n = 0;
    for (const f of fd.getAll("file")) if (f && f.size && n < 6) await c.put("foto-" + n++, new Response(f, { headers: { "Content-Type": f.type || "image/jpeg" } }));
  } catch {}
  return Response.redirect("./", 303);
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === "POST" && u.origin === location.origin && u.pathname.endsWith("/condividi")) return e.respondWith(condiviso(e.request));
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { if (r.ok) { const k = r.clone(); caches.open(V).then((c) => c.put(e.request, k)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
