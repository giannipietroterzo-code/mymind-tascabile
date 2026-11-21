// MyMind tascabile · l'app del telefono. Stessa logica della pagina del Mac (contesto, nota, fonti indicate, strumenti),
// ma ogni chiamata a /api/… passa dal tunnel cifrato (tunnel.js). Solo modelli cloud: quelli locali stanno sul Mac.
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 1) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d });
const sizeTxt = (b) => b > 1e6 ? fmt(b / 1e6) + " MB" : Math.max(1, Math.round(b / 1e3)) + " kB";
const pref = Object.assign({ tema: "auto", web: false, modelli: {}, recenti: [] }, JSON.parse(localStorage.getItem("mmt.pref") || "{}"));
const savePref = () => localStorage.setItem("mmt.pref", JSON.stringify(pref));
function ago(t) {
  if (!t) return "";
  const s = Date.now() / 1000 - t;
  if (s < 60) return "adesso";
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  if (s < 86400) return `${Math.round(s / 3600)} h fa`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} g fa`;
  return new Date(t * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
function toast(msg, bad) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.classList.add("via"), bad ? 5000 : 2600); setTimeout(() => t.remove(), bad ? 5400 : 3000);
}
function onColor(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? "#141210" : "#ffffff";
}
const oggi = () => new Date().toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + ", ore " + new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
// Le chat durano giorni: ogni messaggio porta l'ora in cui è nato e il modello la vede tra parentesi quadre,
// così un «oggi» scritto martedì resta martedì anche se la domanda arriva sabato
const quando = (t) => new Date(t).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const timbro = (m) => m.role === "user" && m.t ? `[${quando(m.t)}] ` : "";
const DATA_REGOLA = " La conversazione può andare avanti per giorni: ogni messaggio dell'utente porta tra parentesi quadre quando è stato scritto. "
  + "«Oggi», «stamattina», «ieri» dentro un messaggio vanno letti rispetto alla sua data, non a quella di adesso; per sapere che giorno è ora vale solo la data qui sopra. "
  + "Non mettere date tra parentesi quadre all'inizio delle tue risposte.";
// separatore quando cambia giorno, come su WhatsApp: solo tra messaggi che hanno l'orario (quelli vecchi non ce l'hanno)
function giornoDi(t) {
  const d = new Date(t), oggiD = new Date(), ieri = new Date(Date.now() - 864e5);
  if (d.toDateString() === oggiD.toDateString()) return "Oggi";
  if (d.toDateString() === ieri.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== oggiD.getFullYear() ? { year: "numeric" } : {}) });
}
// pressione lunga su un messaggio: ti dico quando è stato scritto
function tieniPremuto(el) {
  let timer = null, x = 0, y = 0;
  const via = () => { clearTimeout(timer); timer = null; };
  el.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".msg[data-i]"); if (!row || !A.chat) return;
    x = e.clientX; y = e.clientY; via();
    timer = setTimeout(() => {
      const m = A.chat.messages[+row.dataset.i]; if (!m) return;
      navigator.vibrate?.(8);
      toast(m.t ? `${m.role === "user" ? "Scritto" : "Risposto"} ${new Date(m.t).toLocaleString("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : "Messaggio senza orario: è di prima che MyMind li segnasse");
    }, 550);
  });
  el.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) via(); });
  for (const ev of ["pointerup", "pointercancel", "scroll"]) el.addEventListener(ev, via, true);
}
// le fonti citate con @ restano nella frase: nel messaggio «@nome» diventa un'etichetta al suo posto
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function conFonti(m, chip) {
  let html = esc(m.content || ""); const fuori = [];
  for (const p of [...(m.pins || [])].sort((a, b) => b.nome.length - a.nome.length)) {   // i nomi lunghi prima: «foto (2)» non diventa «foto»
    const re = new RegExp("@" + reEsc(esc(p.nome)), "g");
    if (re.test(html)) html = html.replace(re, () => chip(p)); else fuori.push(p);
  }
  return { html, fuori };
}
// toglie dal testo i «@nome» di una fonte che hai tolto dal messaggio
const togliCitazione = (testo, nome) => testo.replace(new RegExp("\\s?@" + reEsc(nome) + "(?=\\s|$|[.,;:!?)])", "g"), "");
// Etichette dal vivo nel campo di scrittura. Una textarea non può contenere etichette vere: sotto il testo c'è uno
// «specchio» con gli stessi caratteri e a capo, che disegna una pillola dietro a ogni @fonte. In più l'@fonte si comporta
// da etichetta: Backspace/Canc la tolgono intera, non ci si scrive dentro, e se sparisce dal testo la fonte si stacca.
function campoConFonti(t, pinsDi, stacca) {
  if (t._specchio) return t._specchio;
  const sp = document.createElement("div"); sp.className = "specchio"; sp.setAttribute("aria-hidden", "true");
  t.parentNode.insertBefore(sp, t);
  if (getComputedStyle(t.parentNode).position === "static") t.parentNode.style.position = "relative";
  t.style.position = "relative"; t.style.zIndex = 1;
  const COPIA = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "wordSpacing", "lineHeight", "textIndent", "tabSize",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "textTransform"];
  const gettoni = () => {                                   // dove stanno le @fonte nel testo: [{da, a, p}]
    const v = t.value, out = [];
    for (const p of [...pinsDi()].sort((x, y) => y.nome.length - x.nome.length)) {
      const k = "@" + p.nome;
      for (let i = v.indexOf(k); i >= 0; i = v.indexOf(k, i + 1)) if (!out.some((g) => i < g.a && i + k.length > g.da)) out.push({ da: i, a: i + k.length, p });
    }
    return out.sort((x, y) => x.da - y.da);
  };
  const agg = () => {
    const cs = getComputedStyle(t);
    for (const k of COPIA) sp.style[k] = cs[k];
    Object.assign(sp.style, { top: t.offsetTop + "px", left: t.offsetLeft + "px", width: t.offsetWidth + "px", height: t.offsetHeight + "px" });
    let html = "", da = 0; const v = t.value;
    for (const g of gettoni()) { html += esc(v.slice(da, g.da)) + "<mark>" + esc(v.slice(g.da, g.a)) + "</mark>"; da = g.a; }
    sp.innerHTML = html + esc(v.slice(da)) + "​";
    sp.scrollTop = t.scrollTop;
  };
  const dentro = (pos) => gettoni().find((g) => pos > g.da && pos < g.a);
  const cancella = (e, indietro) => {                      // via l'etichetta intera, e lo spazio che la seguiva
    if (t.selectionStart !== t.selectionEnd) return false;
    const pos = t.selectionStart;
    const g = gettoni().find((x) => indietro ? pos > x.da && pos <= x.a : pos >= x.da && pos < x.a);
    if (!g) return false;
    e.preventDefault();
    const fine = t.value[g.a] === " " && (g.da === 0 || t.value[g.da - 1] === " ") ? g.a + 1 : g.a;
    t.setRangeText("", g.da, fine, "start"); t.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  // sulle tastiere Android il keydown dice spesso solo «Unidentified»: beforeinput invece dice sempre che si cancella
  t.addEventListener("beforeinput", (e) => {
    if (e.inputType === "deleteContentBackward") cancella(e, true);
    else if (e.inputType === "deleteContentForward") cancella(e, false);
  });
  t.addEventListener("keydown", (e) => {
    if (e.isComposing || t.selectionStart !== t.selectionEnd) return;
    const pos = t.selectionStart;
    if ((e.key === "Backspace" && cancella(e, true)) || (e.key === "Delete" && cancella(e, false))) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {  // si scrive accanto all'etichetta, mai dentro
      const d = dentro(pos); if (d) t.setSelectionRange(d.a, d.a);
    }
  });
  t.addEventListener("input", () => {
    const vive = new Set(gettoni().map((g) => g.p));
    for (const p of [...pinsDi()]) if (!vive.has(p) && p._nelTesto) stacca(p);
    for (const p of vive) p._nelTesto = true;           // da qui in poi questa fonte vive nel testo: se sparisce, si stacca
    agg();
  });
  t.addEventListener("scroll", () => { sp.scrollTop = t.scrollTop; });
  // il campo può spostarsi senza cambiare testo (sopra compare l'anteprima della fonte scelta): riallineo anche allora
  const ro = new ResizeObserver(() => agg());
  ro.observe(t); ro.observe(t.parentNode); if (t.parentNode.parentNode) ro.observe(t.parentNode.parentNode);
  const poi = () => { agg(); requestAnimationFrame(agg); };    // e un giro dopo il disegno, per sicurezza
  t._specchio = { agg: poi };
  agg();
  return t._specchio;
}
// ---------------------------------------------------------------- chat lunghe: compressione come fa Claude
// Oltre ~60k token di testo, i messaggi vecchi vanno al modello come riassunto (fatto una volta da Haiku e salvato nella
// chat); gli ultimi 20 restano interi. Tu continui a vedere tutta la chat; una riga segna fin dove il modello legge il riassunto.
const COMPRIMI = { soglia: 240000, coda: 20 };      // caratteri della parte non riassunta · messaggi tenuti interi
async function comprimi(chat, chiedi, fase) {
  const ms = chat.messages, ultimo = ms.length - 1;  // l'ultimo è la risposta che sta per arrivare
  let r = chat.riassunto && chat.riassunto.fino <= ultimo ? chat.riassunto : null;
  const da = r ? r.fino : 0;
  const peso = ms.slice(da, ultimo).reduce((a, m) => a + (m.error ? 0 : (m.content || "").length), 0);
  if (peso < COMPRIMI.soglia) return r;
  let fino = ultimo - COMPRIMI.coda;
  while (fino > da && ms[fino].role !== "user") fino--;             // la parte intera comincia con una tua domanda
  if (fino <= da) return r;
  fase();
  const blocco = ms.slice(da, fino).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content, t: m.t }));
  const out = await chiedi({ precedente: r?.testo || "", messaggi: blocco }).catch(() => null);
  if (!out?.testo) return r;                         // non è riuscito: per questa volta va la chat intera (o il riassunto di prima)
  chat.riassunto = { fino, testo: out.testo, quando: Date.now() };
  return chat.riassunto;
}
const REGOLA_RIASSUNTO = "\n\n## Riassunto della parte precedente di questa chat\n"
  + "(I messaggi più vecchi non li vedi: al loro posto c'è questo riassunto. Gli ultimi messaggi seguono interi; se ti manca un dettaglio, chiedilo.)\n";
function rigaRiassunto(chat, i) {
  const r = chat.riassunto;
  if (!r || r.fino !== i) return "";
  return `<details class="riass"><summary>${svg("layers")}<span>Fin qui la chat è riassunta per il modello</span><small>${new Date(r.quando).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></summary><div class="md">${renderMd(r.testo)}</div></details>`;
}
// Con il web acceso, la ricerca parte dalla tua domanda così com'è e il motore restituisce sempre qualcosa, anche fuori tema
// («togli dalle note…» → pagine sulle recensioni). Sotto la risposta restano i link che il modello ha davvero citato nel testo;
// gli altri stanno in una riga chiusa.
function webUsati(m) {
  const testo = m.content || "", usati = [], altri = [];
  for (const w of m.web || []) {
    let chiave = w.url;
    try { const u = new URL(w.url); chiave = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, ""); } catch {}
    (testo.includes(w.url) || testo.includes(chiave) ? usati : altri).push(w);
  }
  return { usati, altri };
}
function separatore(msgs, i) {
  const m = msgs[i]; if (!m.t) return "";
  let prima = null;
  for (let k = i - 1; k >= 0; k--) if (msgs[k].t) { prima = msgs[k].t; break; }
  return prima && new Date(prima).toDateString() === new Date(m.t).toDateString() ? "" : `<div class="giorno"><span>${giornoDi(m.t)}</span></div>`;
}
function applicaTema() {
  const scuro = pref.tema === "dark" || (pref.tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = scuro ? "dark" : "light";
  if (pref.stile === "tech") document.documentElement.dataset.stile = "tech"; else delete document.documentElement.dataset.stile;
  if (typeof tinta === "function") tinta(ultimaTinta);
}
const STILI = { atelier: ["Atelier", "avorio caldo, morbido"], tech: ["Tech", "grigi caldi, giallo ambra, angoli netti"] };
let ultimaTinta = "#c15f3c";
if (!STILI[pref.stile]) { pref.stile = "atelier"; }      // una preferenza rimasta da uno stile che non c'è più (il Mecha) rompeva il menu
applicaTema(); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applicaTema);

// ================================================================ foglio dal basso (scelte, conferme, anteprime)
// Ogni foglio aperto mette un passo nella cronologia, così il tasto Indietro di Android lo chiude. Chiudendolo da un
// bottone si torna indietro di quel passo, ma il «torna indietro» arriva dopo: se intanto si è aperto un altro foglio
// (Rinomina → «Nuovo nome», Togli → conferma), quel ritorno lo chiudeva subito. Ora il ritorno atteso si riconosce.
let popAtteso = false;
function sheet(html, cls = "") {
  $("sheet").className = "open " + cls; $("sheet").innerHTML = `<div class="grip"></div>${html}`;
  $("sheet-bg").className = "open";
  $("sheet-bg").onclick = closeSheet;
  if (!popAtteso && !history.state?.sheet) history.pushState({ sheet: 1 }, "");
  return $("sheet");
}
function closeSheet(fromPop) {
  if (!$("sheet").classList.contains("open")) return;
  $("sheet").className = ""; $("sheet-bg").className = "";
  setTimeout(() => { if (!$("sheet").classList.contains("open")) $("sheet").innerHTML = ""; }, 260);
  if (fromPop !== true && history.state?.sheet) { popAtteso = true; history.back(); }
}
function ask(testo, ok = "Conferma", danger = false) {
  return new Promise((res) => {
    const s = sheet(`<p class="ask">${esc(testo)}</p><div class="row2"><button class="btn" data-no>Annulla</button><button class="btn ${danger ? "danger" : "main"}" data-yes>${esc(ok)}</button></div>`);
    let fatto = false;
    const end = (v) => { if (fatto) return; fatto = true; closeSheet(); res(v); };
    s.querySelector("[data-no]").onclick = () => end(false);
    s.querySelector("[data-yes]").onclick = () => end(true);
    $("sheet-bg").onclick = () => end(false);
  });
}

function chiediTesto(titolo, valore = "", ok = "OK") {
  return new Promise((res) => {
    const s = sheet(`<h3 class="sh">${esc(titolo)}</h3><input class="field" id="ctx" value="${esc(valore)}" autocomplete="off" enterkeyhint="done"><div class="row2"><button class="btn" data-no>Annulla</button><button class="btn main" data-yes>${esc(ok)}</button></div>`);
    let fatto = false;
    const end = (v) => { if (fatto) return; fatto = true; closeSheet(); res(v); };
    const inp = s.querySelector("#ctx"); setTimeout(() => { inp.focus(); inp.select(); }, 250);
    s.querySelector("[data-no]").onclick = () => end(null);
    s.querySelector("[data-yes]").onclick = () => end(inp.value.trim() || null);
    inp.onkeydown = (e) => { if (e.key === "Enter") end(inp.value.trim() || null); };
    $("sheet-bg").onclick = () => end(null);
  });
}

// ================================================================ immagini che arrivano dal tunnel
const blobs = new Map();
const coda = [];
let inVolo = 0;
function caricaImmagini(root = document) {
  root.querySelectorAll("img[data-src]:not([src])").forEach((img) => {
    const p = img.dataset.src;
    if (blobs.has(p)) { img.src = blobs.get(p); return; }
    coda.push(img);
  });
  pompa();
}
function pompa() {
  while (inVolo < 3 && coda.length) {
    const img = coda.shift(), p = img.dataset.src;
    if (blobs.has(p)) { img.src = blobs.get(p); continue; }
    inVolo++;
    Tunnel.blob(p).then((b) => { const u = URL.createObjectURL(b); blobs.set(p, u); document.querySelectorAll(`img[data-src="${CSS.escape(p)}"]`).forEach((i) => i.src = u); })
      .catch(() => img.classList.add("rotta")).finally(() => { inVolo--; pompa(); });
  }
}

// ================================================================ testo formattato (lo stesso della pagina del Mac)
// Formule LaTeX ($\rightarrow$, $m^2$, $\frac{a}{b}$, \( … \), $$ … $$): diventano simboli e apici veri, senza librerie
const TEX = { rightarrow: "→", to: "→", longrightarrow: "⟶", leftarrow: "←", gets: "←", Rightarrow: "⇒", implies: "⇒", Leftarrow: "⇐",
  leftrightarrow: "↔", Leftrightarrow: "⇔", iff: "⇔", uparrow: "↑", downarrow: "↓", mapsto: "↦", times: "×", cdot: "·", div: "÷", pm: "±",
  mp: "∓", approx: "≈", simeq: "≃", sim: "∼", equiv: "≡", neq: "≠", ne: "≠", le: "≤", leq: "≤", ge: "≥", geq: "≥", ll: "≪", gg: "≫",
  propto: "∝", infty: "∞", degree: "°", circ: "∘", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", in: "∈", notin: "∉",
  subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", ldots: "…", dots: "…", cdots: "⋯",
  checkmark: "✓", euro: "€", alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", eta: "η", theta: "θ",
  lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω", Gamma: "Γ", Delta: "Δ",
  Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω", left: "", right: "", big: "", Big: "", displaystyle: "",
  quad: " ", qquad: "  ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", "%": "%", $: "$", "&amp;": "&", "#": "#", _: "_", "{": "{", "}": "}" };
function tex(src) {
  const par = (x) => /^[\w.^]+$/.test(x.trim()) ? x.trim() : `(${x.trim()})`, g = String.raw`\{([^{}]*)\}`;
  let s = esc(src.trim());
  for (let i = 0; i < 3; i++) s = s   // tre giri: bastano per \frac dentro \text e simili
    .replace(new RegExp(String.raw`\\(?:text|mathrm|mathbf|textbf|mathit|operatorname|mbox)\s*` + g, "g"), "$1")
    .replace(new RegExp(String.raw`\\[dt]?frac\s*` + g + String.raw`\s*` + g, "g"), (_, a, b) => `${par(a)}⁄${par(b)}`)
    .replace(new RegExp(String.raw`\\sqrt\s*` + g, "g"), "√$1");
  return `<span class="tex">${s
    .replace(/\^\s*\{?\\circ\}?/g, "°")
    .replace(/\\([a-zA-Z]+|&amp;|[,;:! %$#_{}])/g, (m, c) => c in TEX ? TEX[c] : c)
    .replace(/\^\{([^{}]*)\}|\^([^\s{}])/g, (_, a, b) => `<sup>${a ?? b}</sup>`)
    .replace(/_\{([^{}]*)\}|_([A-Za-z0-9])/g, (_, a, b) => `<sub>${a ?? b}</sub>`)
    .replace(/[{}]/g, "")}</span>`;
}
// una formula $$ … $$ o \[ … \] su più righe: la riporto su una riga sola prima di dividere il testo in righe
const unisciFormule = (t) => t.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (m, a, b) => `$$${(a ?? b).replace(/\s*\n\s*/g, " ")}$$`);
// `…` è codice solo se lo sembra davvero (=, parentesi di funzione, percorsi, file.ext, byte esadecimali, snake_case…):
// «RESET», «DC INPUT», «45,5 V» sono etichette e restano nel carattere del testo, senza il riquadro in monospace
function sembraCodice(t) {
  const x = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  if (/^[<>≤≥]=?\s?[\d.,]+\s?[a-zA-Zµ%°]*$/.test(x)) return false;      // «< 50 ms», «> 3 s»
  return /[=\\{}\[\];$#@|&_"'`]|->|=>|::|[<>](?!=?\s?[\d.,])|^>|~\//.test(x)
    || /^(git|npm|npx|pip3?|python3?|node|brew|cd|ls|curl|sudo|ssh|docker|chmod|open|swiftc)\s/.test(x) || /\w\(/.test(x) || /(^|\s)[.~]?\/\w|\w\/[\w-]+\.\w+/.test(x)
    || /\w\.[a-z]{2,5}\b/.test(x) || /[a-z]{2,}[A-Z][a-z]/.test(x) || /^-{1,2}[a-z]/.test(x) || /^([0-9A-F]{2}\s){3,}/.test(x);
}
function inline(s) {
  // «\.» «\*» e simili del Markdown: il carattere va mostrato com'è, senza barra e senza formattare
  const kept = [], formule = [];
  s = String(s ?? "").replace(/\$\$(.+?)\$\$|\\\((.+?)\\\)|\$(?=\S)([^$\n]*?[^\s$])\$(?!\d)/g, (m, a, b, c) => {
    if (c != null && !/[\\^_]/.test(c)) return m;      // «costa 5$ o 10$»: niente barre né apici, non è una formula
    formule.push(tex(a ?? b ?? c)); return `\u0002${formule.length - 1}\u0002`;
  }).replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, (_, c) => { kept.push(c); return `\u0001${kept.length - 1}\u0001`; });
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => sembraCodice(c) ? `<code>${c}</code>` : `<span class="etic">${c}</span>`)
    .replace(/\*\*(\S(?:.*?\S)??)\*\*(?!\*)/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[^\w\]>])\[(\d{1,2})\](?!\()/g, '$1<sup class="cite" data-n="$2">$2</sup>')
    .replace(/\u0001(\d+)\u0001/g, (_, i) => esc(kept[+i]))
    .replace(/\u0002(\d+)\u0002/g, (_, i) => formule[+i]);
}
const KW = new Set("function return const let var if else for while do switch case break continue class def import from export default async await new try catch finally throw in of is not and or True False None true false null undefined self this lambda with as elif pass yield interface type public private static void int float string bool fn mut struct impl use pub enum match package func echo then fi done local".split(" "));
function highlight(code, lang) {
  const hash = /^(py|python|sh|bash|zsh|shell|rb|ruby|yaml|yml|r|toml)$/i.test(lang);
  const re = new RegExp(String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*${hash ? String.raw`|#[^\n]*` : ""})|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(\s*\()?`, "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="n">${m[3]}</span>`;
    else if (KW.has(m[4])) out += `<span class="k">${m[4]}</span>${m[5] || ""}`;
    else if (m[5]) out += `<span class="f">${m[4]}</span>${m[5]}`;
    else out += m[4];
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function renderMd(src) {
  const out = [];
  String(src || "").split(/```/).forEach((part, i) => {
    if (i % 2) {
      const nl = part.indexOf("\n");
      const lang = nl >= 0 ? part.slice(0, nl).trim() : "";
      const code = (nl >= 0 ? part.slice(nl + 1) : "").replace(/\n$/, "");
      out.push(`<div class="code"><div class="code-head"><span>${esc(lang || "codice")}</span><button data-copy>${svg("copy")}Copia</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`);
      return;
    }
    let list = null, para = [], table = null;
    const flushP = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
    // liste annidate vere: ogni voce può avere una sottolista (rientro maggiore), così i sottopunti non prendono un numero
    let pila = [];
    const listaHtml = (l) => `<${l.tag}${l.start > 1 ? ` start="${l.start}"` : ""}>${l.items.map((it) => `<li>${it.h}${it.kids ? listaHtml(it.kids) : ""}</li>`).join("")}</${l.tag}>`;
    const flushL = () => { if (list) { out.push(listaHtml(list)); list = null; pila = []; } };
    const voce = (ind, tag, start, h) => {
      while (pila.length > 1 && ind < pila.at(-1).ind) pila.pop();
      let top = pila.at(-1);
      if (top && ind > top.ind && top.items.length) {
        const ultima = top.items.at(-1);
        if (!ultima.kids || ultima.kids.tag !== tag) ultima.kids = { tag, start, ind, items: [] };
        pila.push(top = ultima.kids);
      } else if (!top || (pila.length === 1 && top.tag !== tag)) {
        flushL(); list = top = { tag, start, ind, items: [] }; pila = [list];
      }
      top.items.push({ h, kids: null });
    };
    const flushT = () => {
      if (!table) return;
      const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      out.push("<table>" + rows.map((r, ri) => "<tr>" + r.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => ri ? `<td>${inline(c.trim())}</td>` : `<th>${inline(c.trim())}</th>`).join("") + "</tr>").join("") + "</table>");
      table = null;
    };
    for (const raw of unisciFormule(part).split("\n")) {
      const line = raw.replace(/\s+$/, "");
      let m;
      if (/^\s*\|.*\|\s*$/.test(line)) { flushP(); flushL(); (table = table || []).push(line); continue; }
      flushT();
      if (!line.trim()) { flushP(); flushL(); continue; }
      if ((m = line.match(/^(\s*)[-*•+]\s+(.*)/))) {
        flushP();
        voce(m[1].length, "ul", 1, inline(m[2]));
      } else if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)/))) {
        flushP();
        voce(m[1].length, "ol", +m[2], inline(m[3]));
      } else if ((m = line.match(/^#{1,6}\s+(.*)/))) {
        flushP(); flushL(); out.push(`<h3>${inline(m[1])}</h3>`);
      } else if ((m = line.match(/^\s*>\s?(.*)/))) {
        flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`);
      } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushP(); flushL(); out.push("<hr>");
      } else { flushL(); para.push(line); }
    }
    flushT(); flushP(); flushL();
  });
  return out.join("");
}

function lineDiff(a, b) {
  const A = a.split("\n"), B = b.split("\n"), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(esc(A[i]) + "\n"); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push(`<span class="diff-del">${esc(A[i++]) || " "}</span>`);
    else out.push(`<span class="diff-add">${esc(B[j++]) || " "}</span>`);
  }
  while (i < n) out.push(`<span class="diff-del">${esc(A[i++]) || " "}</span>`);
  while (j < m) out.push(`<span class="diff-add">${esc(B[j++]) || " "}</span>`);
  return out.join("");
}

// ================================================================ stato
const SPECIALI = {
  _libera: { id: "_libera", nome: "Chat libera", colore: "#c2a878", icona: "chat", sotto: "Senza fonti, domande al volo" },
  _tutti: { id: "_tutti", nome: "Tutti i workspace", colore: "#8c7449", icona: "layers", sotto: "Una domanda su tutto" },
};
const COLORI_FORNITORE = { Anthropic: "#c15f3c", Google: "#188038", Mistral: "#d98e04", DeepSeek: "#4d6bfe" };
const TIPO_IC = { pdf: "pdf", foto: "image", documento: "doc", testo: "file", altro: "file" };
const LAVORA = ["in coda", "leggo", "descrivo la foto", "calcolo i vettori", "do un nome"];
const WEB_RE = /\b(cerca|cercami|guarda|controlla)\b.{0,30}\b(web|internet|online|in rete)\b|\bsul web\b|\bnotizie\b/i;
// ---------------------------------------------------------------- versione e aggiornamento automatico
// strumenti/pubblica-tascabile.sh alza VERSIONE qui, in versione.json e in sw.js. L'app confronta la sua con quella pubblicata:
// se è bloccata si ricarica subito; se è aperta non ti chiede il PIN a metà lavoro, aspetta il prossimo blocco (o un tocco).
const VERSIONE = "1.45";
let nuovaVersione = null;
async function controllaVersione() {
  if (location.protocol !== "https:" && !/^localhost$|^127\./.test(location.hostname)) return;
  try {
    const r = await fetch(`versione.json?t=${Date.now()}`, { cache: "no-store" });
    const v = r.ok && (await r.json()).v;
    if (!v || v === VERSIONE) return;
    nuovaVersione = v;
    if (!A.sec && !daSalvare.size && sessionStorage.getItem("mmt-agg") !== v) return aggiorna();
    document.querySelectorAll(".ver").forEach(mostraVersione);
  } catch { /* senza rete: riprovo la prossima volta */ }
}
function aggiorna() {
  if (sessionStorage.getItem("mmt-agg") === nuovaVersione) return;   // già provato: niente giri infiniti se la cache è indietro
  sessionStorage.setItem("mmt-agg", nuovaVersione);
  location.reload();
}
function mostraVersione(el) {
  el.classList.toggle("nuova", !!nuovaVersione);
  el.innerHTML = nuovaVersione ? `↻ ${esc(nuovaVersione)}` : `v${VERSIONE}`;
  el.title = nuovaVersione ? `Versione ${nuovaVersione} pronta: tocca per aggiornare (hai la ${VERSIONE})` : "";
  el.onclick = nuovaVersione ? () => { if (daSalvare.size) return toast("Prima finisco di salvare la chat sul Mac", true); if (!A.busy || confirm("Sta ancora rispondendo: aggiorno lo stesso?")) aggiorna(); } : null;
}
const versioneHtml = () => `<button class="ver"></button>`;
setInterval(controllaVersione, 15 * 60e3);
new MutationObserver(() => document.querySelectorAll(".ver:empty").forEach(mostraVersione)).observe(document.documentElement, { childList: true, subtree: true });

const A = {
  sec: null, srv: {}, wss: [], modelli: [], wid: null, tab: "chat", chats: [], chat: null, fonti: [], nota: null,
  busy: false, ctrl: null, pins: [], foto: [], filtro: "tutte", cerca: "", macOk: null, nascosto: 0, notaEdit: false,
};
const ws = () => A.wss.find((w) => w.id === A.wid) || SPECIALI[A.wid] || SPECIALI._libera;
const isSpecial = () => !!SPECIALI[A.wid];
const isTutti = () => A.wid === "_tutti";
const minfo = (name) => A.modelli.find((m) => m.name === name);
const shortName = (name) => minfo(name)?.nome || String(name || "").split("/")[1] || "Modello";
const pc = (name) => { const c = COLORI_FORNITORE[minfo(name)?.fornitore]; return c ? ` style="--pc:${c}"` : ""; };
function modello() {
  const scelte = [pref.modelli[A.wid], ws().modello, A.srv.modello_predefinito, A.modelli[0]?.name];
  return scelte.find((m) => m && minfo(m)) || "";
}
const notaAutoOn = (model) => A.srv.nota_auto !== false && !!minfo(model) && !isSpecial();
const api = (metodo, percorso, corpo, opts) => Tunnel.json(metodo, percorso, corpo, opts);
function tinta(colore) {
  const r = document.documentElement.style;
  ultimaTinta = colore;
  // nello stile Tech l'accento è sempre il giallo del foglio di stile: il colore del workspace resta sulla sua tessera
  if (pref.stile === "tech") { r.removeProperty("--ws"); r.removeProperty("--on-ws"); return; }
  r.setProperty("--ws", colore); r.setProperty("--on-ws", onColor(colore));
}

// ================================================================ abbinamento e PIN
function leggiAbbinamento() {
  if (!location.hash.startsWith("#mm=")) return null;
  const q = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);           // la chiave non resta nella cronologia
  const [canale, chiave] = (q.get("mm") || "").split(".");
  if (!/^mm-[\w-]{10,}$/.test(canale || "") || !/^[\w-]{40,}$/.test(chiave || "")) return null;
  const broker = {}; for (const k of ["h", "u", "p"]) if (q.get(k)) broker[k] = q.get(k);
  return { canale, chiave, broker, nome: q.get("n") || "Telefono", abbinato: Date.now() };
}
function pinPad({ titolo, sotto, onPin, extra = "" }) {
  let pin = "";
  $("app").innerHTML = `<div class="lock">
    <div class="lock-top"><div class="logo-big">${LOGO}</div><h1>${titolo}${titolo === "MyMind" ? versioneHtml() : ""}</h1><p id="pinSub">${sotto}</p></div>
    <div class="dots" id="dots">${"<i></i>".repeat(6)}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => k === "" ? "<span></span>" : `<button data-k="${k}">${k === "⌫" ? svg("left") : k}</button>`).join("")}</div>
    ${extra}</div>`;
  const dots = () => $("dots").querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < pin.length));
  $("app").querySelectorAll("[data-k]").forEach((b) => b.onclick = async () => {
    if (b.dataset.k === "⌫") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += b.dataset.k;
    dots(); navigator.vibrate?.(8);
    if (pin.length === 6) {
      $("dots").classList.add("busy");
      const p = pin; pin = "";
      try { await onPin(p); } catch (e) {
        $("dots").classList.remove("busy"); $("dots").classList.add("shake"); navigator.vibrate?.([30, 40, 30]);
        $("pinSub").textContent = e.message; $("pinSub").classList.add("bad");
        setTimeout(() => { $("dots")?.classList.remove("shake"); dots(); }, 450);
      }
    }
  });
}
function creaPin(segreto) {
  pinPad({ titolo: "Scegli un PIN", sotto: `Abbino «${esc(segreto.nome)}». Il PIN chiude la chiave sul telefono: senza, MyMind non si apre.`,
    onPin: async (p1) => {
      pinPad({ titolo: "Ripetilo", sotto: "Lo stesso PIN, per sicurezza.", onPin: async (p2) => {
        if (p1 !== p2) { creaPin(segreto); toast("I due PIN non coincidono: rifallo", true); return; }
        await Cassa.chiudi(p1, segreto);
        await Busta.svuota(); await Busta.prepara(p1, segreto).catch(() => {});      // abbinamento nuovo: chiavi nuove
        await entra(segreto);
        toast("Telefono abbinato");
      } });
    } });
}
function sblocca() {
  const c = Cassa.c();
  pinPad({ titolo: "MyMind", sotto: `${esc(c?.nome || "Telefono")} · inserisci il PIN`, onPin: async (p) => { const sec = await Cassa.apri(p); await Busta.prepara(p, sec).catch(() => {}); entra(sec); },
    extra: `${Busta.pronta() ? `<button class="lock-an" id="lockAnnota">${svg("edit")}<span><b>Annota senza sbloccare</b><small class="in-attesa"></small></span>${svg("mic")}</button>` : ""}<button class="link" id="dimentica">Ho dimenticato il PIN</button>` });
  if ($("lockAnnota")) { $("lockAnnota").onclick = (e) => annotaSheet({ detta: !!e.target.closest("svg:last-child") }); dipingiAttesa(); }
  $("dimentica").onclick = async () => {
    if (await ask("Senza PIN la chiave non si recupera: cancello l'abbinamento e lo rifai dal Mac (Impostazioni → Telefono, ovunque).", "Cancella", true)) { Cassa.cancella(); Busta.svuota(); avvio(); }
  };
}
function nessunAbbinamento() {
  $("app").innerHTML = `<div class="lock intro">
    <div class="lock-top"><div class="logo-big">${LOGO}</div><h1>MyMind tascabile</h1><p>Il tuo secondo cervello, dal telefono, ovunque sei. Cifrato dal telefono al Mac: chi sta in mezzo vede solo byte a caso.</p></div>
    <ol class="how"><li><span>1</span><div><b>Sul Mac</b> apri MyMind → Impostazioni → <b>Telefono, ovunque</b> → Abbina un telefono.</div></li>
      <li><span>2</span><div><b>Inquadra il QR</b> con la fotocamera di questo telefono.</div></li>
      <li><span>3</span><div><b>Scegli un PIN</b> e installa l'app dal menu del browser («Aggiungi a schermata Home»).</div></li></ol></div>`;
}
async function entra(segreto) {
  A.sec = segreto;
  Tunnel.onStato = (s) => { A.statoTunnel = s; dipingiStato(); };
  await Tunnel.avvia(segreto);
  history.replaceState({ v: "home" }, "");
  A.wid = null; casa();
  carica();
}
async function carica(zitto) {
  try {
    const [wss, srv, modelli] = await Promise.all([api("GET", "workspace"), api("GET", "impostazioni").catch(() => ({})), api("GET", "openrouter/modelli").catch(() => [])]);
    A.wss = wss.sort((a, b) => (b.nota_agg || b.creato || 0) - (a.nota_agg || a.creato || 0)); A.srv = srv; A.modelli = modelli; A.macOk = Date.now();
    for (const id of Object.keys(SPECIALI)) api("GET", `workspace/${id}`).then((m) => { if (m.modello) SPECIALI[id].modello = m.modello; }).catch(() => {});
  } catch (e) { A.macOk = 0; A.macErr = e.message; }
  if (!A.wid && !(zitto && $("sheet").classList.contains("open"))) casa(); else dipingiStato();
  if (A.macOk && !zitto) { condivisoInArrivo().then((c) => { if (c) annotaSheet(c); caricaAvvisi(); }); caricaPosta(); svuotaCoda(); }
}
function dipingiStato() {
  const el = $("stato"); if (!el) return;
  const s = A.statoTunnel;
  const [cls, txt] = s !== "collegato" ? ["off", s === "collego" ? "collego…" : "fuori linea"]
    : A.macOk ? ["on", "Mac in linea"] : A.macOk === 0 ? ["bad", "il Mac non risponde"] : ["off", "chiedo al Mac…"];
  el.className = "stato " + cls; el.innerHTML = `<i></i><span>${txt}</span>`; el.title = txt;
}
function blocca() {
  if (nuovaVersione && !daSalvare.size) return aggiorna();   // è il momento giusto per la versione nuova, ma non con una chat da salvare
  Tunnel.ferma(); A.sec = null; A.chat = null; A.wid = null;
  $("sheet").className = ""; $("sheet-bg").className = ""; $("sheet").innerHTML = "";   // niente fogli aperti sopra la schermata di blocco
  blobs.forEach((u) => URL.revokeObjectURL(u)); blobs.clear();
  sblocca();
}
// dopo 5 minuti in sottofondo l'app si richiude: chi prende il telefono sbloccato non trova MyMind aperto
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { A.nascosto = Date.now(); return; }
  if (A.sec && A.nascosto && Date.now() - A.nascosto > 5 * 60e3 && !A.busy) blocca();
  controllaVersione();
  risalvaTutto(); ricaricaChats();
});

// ================================================================ casa: i workspace
function tile(w) { return `<span class="tile" style="--c:${esc(w.colore)}">${svg(SPECIALI[w.id] ? w.icona : "ws_" + w.icona)}</span>`; }
function casa() {
  A.wid = null; A.chat = null; tinta("#c15f3c");
  const err = A.macOk === 0 ? `<div class="banner bad">${svg("power")}<div><b>Il Mac non risponde.</b> ${esc(A.macErr || "")} Deve essere acceso, sveglio e con MyMind avviato.<button class="btn sm" id="riprova">Riprova</button></div></div>` : "";
  $("app").innerHTML = `<div class="home">
    <header class="top"><div class="brand">${LOGO}<b>MyMind</b>${versioneHtml()}</div><span id="stato" class="stato"></span><button class="ib campana" id="avvisiBtn" aria-label="Da ricordare">${svg("bell")}<i id="avvisiN"></i></button><button class="ib" id="menu">${svg("dots")}</button></header>
    <section class="hero">
      <form class="askall" id="askall"><span>${svg("layers")}</span><input id="askq" placeholder="Chiedi a tutti i workspace…" enterkeyhint="send" autocomplete="off"><button class="ib main" aria-label="Chiedi">${svg("up")}</button></form>
      <button class="annota" id="annota"><span class="ic">${svg("edit")}</span><span class="tx"><b>Annota al volo</b><small>Un pensiero, una misura, una foto: lo metto io al posto giusto</small></span><span class="mic" id="annotaMic">${svg("mic")}</span></button>
      <p class="in-attesa"></p>
      <div class="duo"><button id="sapereBtn">${svg("search")}Tutto su…</button><button id="diarioBtn">${svg("ws_calendario")}Diario</button></div></section>
    ${err}
    <div id="posta"></div>
    <div class="lab">I tuoi workspace</div>
    <div class="grid">${A.wss.length ? A.wss.map((w) => `<button class="card" data-ws="${esc(w.id)}" style="--c:${esc(w.colore)}">${tile(w)}<b>${esc(w.nome)}</b><small>${w.fonti || 0} fonti${w.nota_agg ? ` · nota ${ago(w.nota_agg)}` : ""}</small></button>`).join("")
      : A.macOk ? "" : '<div class="card sk"></div><div class="card sk"></div><div class="card sk"></div><div class="card sk"></div>'}${A.macOk ? `<button class="card nuovo" id="nuovoWs">${svg("plus")}<b>Nuovo workspace</b><small>Nome, icona e colore</small></button>` : ""}</div>
    <div class="specials">${Object.values(SPECIALI).map((w) => `<button class="row-ws" data-ws="${w.id}">${tile(w)}<span><b>${w.nome}</b><small>${w.sotto}</small></span>${svg("right")}</button>`).join("")}</div>
    <footer class="foot-home">${svg("key")}Cifrato dal telefono al Mac · ${esc(A.sec?.nome || "")}</footer></div>`;
  dipingiStato();
  $("app").querySelectorAll("[data-ws]").forEach((b) => b.onclick = () => apriWs(b.dataset.ws));
  $("askall").onsubmit = (e) => { e.preventDefault(); const q = $("askq").value.trim(); if (!q) return; apriWs("_tutti").then(() => { $("input").value = q; invia(); }); };
  $("menu").onclick = menu;
  $("annota").onclick = (e) => annotaSheet({ detta: !!e.target.closest("#annotaMic") });   // sul microfono: parte già in ascolto
  dipingiPosta(); dipingiAttesa();
  $("sapereBtn").onclick = () => sapereSheet(); $("diarioBtn").onclick = () => diarioSheet();
  $("avvisiBtn").onclick = () => mostraAvvisi(true);
  dipingiAvvisi();
  if ($("nuovoWs")) $("nuovoWs").onclick = nuovoWorkspace;
  if ($("riprova")) $("riprova").onclick = () => { A.macOk = null; casa(); carica(); };
}
// nuovo workspace dal telefono: come sul Mac, nome, icona e colore; poi si apre sulle fonti per aggiungere le prime
function nuovoWorkspace() {
  const st = { nome: "", icona: "foglia", colore: WS_COLORS[Math.floor(Math.random() * WS_COLORS.length)] };
  const s = sheet(`<div class="nws">
    <div class="nws-prev" style="--c:${st.colore}"><span class="tile" style="--c:${st.colore}">${svg("ws_" + st.icona)}</span><b>Nuovo workspace</b></div>
    <input class="field" id="nwsNome" placeholder="Nome, es. Raccolta olive" maxlength="60" autocomplete="off" enterkeyhint="done">
    <div class="lab">Icona</div><div class="nws-ic">${WS_ICONS.map((i) => `<button data-i="${i}" class="${i === st.icona ? "on" : ""}">${svg("ws_" + i)}</button>`).join("")}</div>
    <div class="lab">Colore</div><div class="nws-col">${WS_COLORS.map((c) => `<button data-c="${c}" class="${c === st.colore ? "on" : ""}" style="--c:${c}"></button>`).join("")}</div>
    <button class="btn main" id="nwsCrea">${svg("plus")}Crea workspace</button></div>`, "alto");
  const prev = () => {
    const p = s.querySelector(".nws-prev"); p.style.setProperty("--c", st.colore);
    p.querySelector(".tile").style.setProperty("--c", st.colore); p.querySelector(".tile").innerHTML = svg("ws_" + st.icona);
    p.querySelector("b").textContent = st.nome.trim() || "Nuovo workspace";
    s.querySelectorAll("[data-i]").forEach((b) => b.classList.toggle("on", b.dataset.i === st.icona));
    s.querySelectorAll("[data-c]").forEach((b) => b.classList.toggle("on", b.dataset.c === st.colore));
    s.style.setProperty("--ws", st.colore);
  };
  const nome = s.querySelector("#nwsNome");
  nome.oninput = () => { st.nome = nome.value; prev(); };
  s.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => { st.icona = b.dataset.i; prev(); });
  s.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { st.colore = b.dataset.c; prev(); });
  prev(); setTimeout(() => nome.focus(), 280);
  s.querySelector("#nwsCrea").onclick = async () => {
    if (!st.nome.trim()) { toast("Dai un nome al workspace", true); nome.focus(); return; }
    const b = s.querySelector("#nwsCrea"); b.disabled = true; b.textContent = "Creo…";
    try {
      const m = await api("POST", "workspace", { nome: st.nome.trim(), icona: st.icona, colore: st.colore, modello: A.srv?.modello_predefinito || "" });
      closeSheet(); await carica();
      apriWs(m.id, "fonti"); toast(`«${m.nome}» creato: aggiungi le prime fonti`);
    } catch (e) { b.disabled = false; b.innerHTML = svg("plus") + "Crea workspace"; toast(e.message, true); }
  };
}
// ================================================================ la busta: annotare senza sbloccare
// Per annotare non serve il PIN. L'appunto viene chiuso con una chiave pubblica (RSA-OAEP + AES-GCM) che sta in chiaro sul
// telefono; la chiave privata, l'unica che lo riapre, sta nella cassaforte sotto il PIN. Chi prende il telefono vede solo
// byte a caso. Al primo sblocco gli appunti in attesa partono verso il Mac. La stessa coda regge anche i salvataggi a
// telefono sbloccato: «Salva» chiude subito, e se il Mac non risponde l'appunto aspetta qui invece di perdersi.
const Busta = {
  PUB: "mmt.busta.pub",
  pronta() { return !!localStorage.getItem(this.PUB) && "caches" in window && !!crypto.subtle; },
  async prepara(pin, segreto) {                       // a ogni sblocco: se manca la coppia di chiavi la crea e richiude la cassaforte
    if (segreto.busta && localStorage.getItem(this.PUB)) return;
    const k = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    segreto.busta = await crypto.subtle.exportKey("jwk", k.privateKey);
    localStorage.setItem(this.PUB, JSON.stringify(await crypto.subtle.exportKey("jwk", k.publicKey)));
    await Cassa.chiudi(pin, segreto);
  },
  async chiudi(obj) {
    const pub = await crypto.subtle.importKey("jwk", JSON.parse(localStorage.getItem(this.PUB)), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(obj))));
    const kk = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, await crypto.subtle.exportKey("raw", k)));
    const id = Date.now() + "-" + rid();
    await (await caches.open("mmt-busta")).put(id, new Response(new Blob([new Uint8Array([kk.length >> 8, kk.length & 255]), kk, iv, ct])));
    return id;
  },
  async quante() { try { return (await (await caches.open("mmt-busta")).keys()).length; } catch { return 0; } },
  async apri(segreto) {                               // → [{ id, obj }] in ordine di arrivo
    if (!segreto?.busta) return [];
    const priv = await crypto.subtle.importKey("jwk", segreto.busta, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
    const c = await caches.open("mmt-busta"), out = [];
    for (const req of await c.keys()) {
      const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop());
      try {
        const u = new Uint8Array(await (await c.match(req)).arrayBuffer()), n = u[0] << 8 | u[1];
        const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, priv, u.subarray(2, 2 + n));
        const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
        out.push({ id, req, obj: JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(2 + n, 14 + n) }, k, u.subarray(14 + n)))) });
      } catch { /* chiusa con una chiave vecchia (abbinamento rifatto): non si riapre più */ await c.delete(req); }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  },
  async togli(req) { await (await caches.open("mmt-busta")).delete(req); },
  async svuota() { localStorage.removeItem(this.PUB); try { await caches.delete("mmt-busta"); } catch {} },
};
// Mette un appunto in coda (chiuso) e, se il telefono è sbloccato, lo fa partire subito in sottofondo
async function cattura(obj) {
  obj.t = Date.now();
  if (Busta.pronta()) {
    await Busta.chiudi(obj);
    if (A.sec) { toast(obj.testo ? "Annoto…" : "Mando le foto…"); svuotaCoda(); }
    else { toast("Messo da parte: lo annoto appena sblocchi"); dipingiAttesa(); }
    return;
  }
  if (!A.sec) throw new Error("Sblocca una volta col PIN: da allora potrai annotare senza");
  toast("Annoto…"); await mandaAppunto(obj);          // primo uso, la busta non c'è ancora: mando direttamente
  caricaPosta();
}
let codaInCorso = false, codaTimer = 0;
async function svuotaCoda() {
  if (codaInCorso || !A.sec || !A.macOk) return;
  codaInCorso = true; clearTimeout(codaTimer);
  try {
    const voci = await Busta.apri(A.sec);
    let posta = null, rimaste = 0;
    for (const v of voci) {
      try {
        if (v.obj.attesa) {                           // foto di un appunto che aspettava di sapere il workspace
          posta = posta || await api("GET", "annota");
          const p = posta.find((x) => x.id === v.obj.attesa);
          if (p?.stato === "annotato") await mandaFoto(p.ws, v.obj.foto);
          else if (p && p.stato === "da_smistare") { rimaste++; continue; }
        } else await mandaAppunto(v.obj);
        await Busta.togli(v.req);
      } catch (e) { rimaste++; if (!/vuoto/.test(e.message)) break; }   // il Mac non risponde: riprovo dopo, in ordine
    }
    if (voci.length) { caricaPosta(); carica(true); }
    if (rimaste) codaTimer = setTimeout(svuotaCoda, 25e3);
  } finally { codaInCorso = false; dipingiAttesa(); }
}
const mandaFoto = async (ws, foto) => {
  for (const b of foto || []) await api("POST", `workspace/${ws}/carica?nome=${encodeURIComponent("Foto " + new Date().toLocaleString("it-IT").replace(/[/:]/g, "-") + ".jpg")}`, null, { corpo: unb64(b), ct: "image/jpeg", attesa: 180e3 });
};
// una copia piccola (1024 px) della foto, solo per farla guardare al modello che sceglie il workspace
async function rimpicciolita(b64, lato = 1024) {
  const img = await createImageBitmap(new Blob([unb64(b64)], { type: "image/jpeg" }));
  const k = Math.min(1, lato / Math.max(img.width, img.height)), cv = document.createElement("canvas");
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.8).split(",")[1];
}
async function mandaAppunto(o) {
  if (!o.testo && o.ws) { await mandaFoto(o.ws, o.foto); toast(`Foto aggiunte in «${A.wss.find((w) => w.id === o.ws)?.nome || o.ws}»`); return; }
  if (!o.testo) {                                     // solo uno scatto: un modello lo guarda e dice dove va
    if (!o.foto?.length) throw new Error("appunto vuoto");
    const r = await api("POST", "annota/foto", { foto: await rimpicciolita(o.foto[0]) }, { attesa: 150e3 });
    if (r.stato === "da_smistare") {
      if (Busta.pronta()) await Busta.chiudi({ attesa: r.id, foto: o.foto });
      toast(`Una foto (${r.descrizione}) aspetta che tu scelga dove metterla`, true); navigator.vibrate?.([20, 50, 20]);
      return;
    }
    await mandaFoto(r.ws, o.foto);
    toast(`${o.foto.length > 1 ? o.foto.length + " foto" : "Foto"} in «${r.nome}»: ${r.descrizione}`); navigator.vibrate?.([10, 60, 10]);
    return;
  }
  const r = await api("POST", "annota", { testo: o.testo, ws: o.ws || undefined, origine: o.origine || "telefono", scritto: o.t || Date.now() }, { attesa: 150e3 });
  if (r.stato === "da_smistare") {
    if (o.foto?.length && Busta.pronta()) await Busta.chiudi({ attesa: r.id, foto: o.foto });   // le foto aspettano la scelta
    toast("Un appunto aspetta che tu scelga dove metterlo", true); navigator.vibrate?.([20, 50, 20]);
    return;
  }
  await mandaFoto(r.ws, o.foto);
  toast(`Annotato in «${r.nome}»${o.foto?.length ? ` · ${o.foto.length} foto tra le fonti` : ""}`); navigator.vibrate?.([10, 60, 10]);
}
async function dipingiAttesa() {
  const n = await Busta.quante();
  for (const el of document.querySelectorAll(".in-attesa")) { el.textContent = n ? `${n} ${n === 1 ? "appunto" : "appunti"} in attesa${A.sec ? ": li mando appena il Mac risponde" : " dello sblocco"}` : ""; }
}

// ================================================================ secondo cervello: annota al volo, condividi, avvisi
// ---------------------------------------------------------------- annota al volo
// Scrivi (o detti, o fotografi) senza scegliere dove: il Mac decide il workspace e il custode della nota lo sistema.
// Se non è sicuro te lo chiede. Le foto vanno tra le fonti del workspace scelto.
// Mette insieme i pezzi della dettatura. Chrome su Android, in ascolto continuo, non allunga l'ultimo pezzo: ne aggiunge
// uno nuovo che ripete tutta la frase fin lì («ho», «ho inserito», «ho inserito lo»…), a volte correggendo una parola.
// Quindi un pezzo che riparte come il precedente lo sostituisce, invece di accodarsi.
function dettato(pezzi) {
  const fuori = [], par = (t) => t.toLowerCase().split(/\s+/);
  for (const p of pezzi) {
    const t = (p || "").trim(); if (!t) continue;
    const u = fuori[fuori.length - 1];
    if (u) {
      const a = par(u), b = par(t), corto = Math.min(a.length, b.length);
      let n = 0; while (n < corto && a[n] === b[n]) n++;                 // parole uguali all'inizio
      let pari = 0; for (let k = 0; k < corto; k++) if (a[k] === b[k]) pari++;   // parole uguali allo stesso posto
      if (n === corto || (n >= 1 && corto >= 3 && pari >= corto * .6)) { if (b.length >= a.length || n < corto) fuori[fuori.length - 1] = t; continue; }
    }
    fuori.push(t);
  }
  return fuori.join(" ");
}
function annotaSheet(pre = {}) {
  const chiuso = !A.sec;                               // dalla schermata di blocco: niente elenco dei workspace
  const st = { ws: pre.ws || "", foto: pre.foto || [], ascolto: null };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const s = sheet(`<div class="an">
    <h3 class="sh">${svg("edit")}Annota al volo${chiuso ? `<small>senza sbloccare</small>` : ""}</h3>
    <textarea id="anTesto" rows="4" placeholder="Scrivi e basta, o scatta una foto: lo metto io al posto giusto">${esc(pre.testo || "")}</textarea>
    <div class="an-foto" id="anFoto"></div>
    <div class="an-btns">${SR ? `<button class="btn" id="anMic">${svg("mic")}Detta</button>` : ""}<button class="btn" id="anCam">${svg("camera")}Scatta</button><button class="btn" id="anGal">${svg("image")}Galleria</button></div>
    ${chiuso ? "" : `<div class="chipsrow" id="anWs"></div>`}
    <p class="an-msg" id="anMsg"></p>
    <button class="btn main" id="anSalva">${svg("ok")}Salva</button>
    ${chiuso ? `<p class="an-nota">${svg("key")}Resta chiuso sul telefono: si legge solo col tuo PIN, e parte verso il Mac al prossimo sblocco.</p>` : ""}
    <input type="file" id="anCamIn" accept="image/*" capture="environment" hidden><input type="file" id="anGalIn" accept="image/*" multiple hidden></div>`, "tall");
  const q = (x) => s.querySelector(x), testo = q("#anTesto");
  const chips = () => {
    if (chiuso) return;
    q("#anWs").innerHTML = `<button data-w="" class="${st.ws ? "" : "on"}">${svg("spark")}Decidi tu</button>` + A.wss.map((w) => `<button data-w="${esc(w.id)}" class="${st.ws === w.id ? "on" : ""}">${esc(w.nome)}</button>`).join("");
    q("#anWs").querySelectorAll("[data-w]").forEach((b) => b.onclick = () => { st.ws = b.dataset.w; chips(); });
  };
  const foto = () => {
    q("#anFoto").innerHTML = st.foto.map((f, k) => `<span class="ph"><img src="${f.url}" alt=""><button data-x="${k}">${svg("x")}</button></span>`).join("");
    q("#anFoto").querySelectorAll("[data-x]").forEach((b) => b.onclick = () => { st.foto.splice(+b.dataset.x, 1); foto(); });
  };
  chips(); foto();
  q("#anCam").onclick = () => q("#anCamIn").click();
  q("#anGal").onclick = () => q("#anGalIn").click();
  for (const id of ["#anCamIn", "#anGalIn"]) q(id).onchange = async () => { for (const f of q(id).files) st.foto.push(await toJpeg(f, 2400)); foto(); };
  const detta = () => {
    if (st.ascolto) { st.ascolto.stop(); return; }
    const r = new SR(), base = testo.value ? testo.value.replace(/\s*$/, " ") : "";
    r.lang = "it-IT"; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => { testo.value = base + dettato([...e.results].map((x) => x[0].transcript)); };
    r.onend = () => { st.ascolto = null; if (q("#anMic")) { q("#anMic").classList.remove("on"); q("#anMic").innerHTML = svg("mic") + "Detta"; } };
    r.onerror = (e) => { if (e.error !== "aborted" && e.error !== "no-speech") toast("Dettatura non riuscita: " + e.error, true); };
    try { r.start(); st.ascolto = r; q("#anMic").classList.add("on"); q("#anMic").innerHTML = svg("mic") + "Ti ascolto… tocca per finire"; } catch { toast("Il microfono non parte", true); }
  };
  if (SR) q("#anMic").onclick = detta;
  if (pre.detta && SR) setTimeout(detta, 300); else setTimeout(() => { if (!pre.testo) testo.focus(); }, 280);
  q("#anSalva").onclick = async () => {
    st.ascolto?.stop();
    const t = testo.value.trim();
    if (!t && !st.foto.length) { toast("Scrivi qualcosa o aggiungi una foto", true); return; }
    closeSheet();                                      // subito: il resto succede in sottofondo
    try { await cattura({ testo: t, ws: st.ws || "", foto: st.foto.map((f) => f.b64) }); }
    catch (e) { toast(e.message, true); annotaSheet({ testo: t, ws: st.ws, foto: st.foto }); }
  };
}
// ---------------------------------------------------------------- ultimi appunti: dove sono finiti, sposta, annulla
async function caricaPosta() {
  try { A.posta = await api("GET", "annota"); } catch { return; }
  dipingiPosta();
}
function dipingiPosta() {
  const el = $("posta"); if (!el) return;
  const p = (A.posta || []).filter((v) => v.stato !== "annullato");
  const daSmistare = p.filter((v) => v.stato === "da_smistare"), fatti = p.filter((v) => v.stato === "annotato").slice(0, 3);
  const riga = (v) => `<button class="pa${v.stato === "da_smistare" ? " dubbio" : ""}" data-p="${v.id}"><span class="in"><b>${esc(v.testo)}</b><small>${v.stato === "da_smistare" ? "Scegli dove metterlo" : `in «${esc(v.nome)}» · ${ago(v.t)}`}</small></span>${svg(v.stato === "da_smistare" ? "right" : "ok")}</button>`;
  el.innerHTML = daSmistare.length || fatti.length ? `<div class="lab">Ultimi appunti</div>${daSmistare.map(riga).join("")}${fatti.map(riga).join("")}` : "";
  el.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => appuntoSheet(A.posta.find((v) => v.id === b.dataset.p)));
}
function appuntoSheet(v) {
  const s = sheet(`<div class="an"><h3 class="sh">${svg("edit")}Appunto</h3>
    <p class="pa-testo">${esc(v.testo)}</p>
    ${v.tipo === "foto" && v.stato === "annotato" ? `<p class="an-nota">${svg("image")}È tra le fonti di «${esc(v.nome)}»: da lì la puoi aprire, rinominare o togliere.</p>` : `
    <div class="lab">${v.stato === "da_smistare" ? (v.tipo === "foto" ? "Dove la metto?" : "Dove lo metto?") : `Ora è in «${esc(v.nome)}». Spostalo in…`}</div>
    <div class="chipsrow wrap">${A.wss.map((w) => `<button data-w="${esc(w.id)}" class="${v.ws === w.id ? "on" : ""}${v.proposto === w.id ? " prop" : ""}">${esc(w.nome)}</button>`).join("")}</div>`}
    <button class="btn danger-t" id="paVia">${svg("trash")}${v.stato === "da_smistare" ? (v.tipo === "foto" ? "Buttala" : "Buttalo") : v.tipo === "foto" ? "Toglila da questo elenco" : "Annulla l'appunto (lo tolgo dalla nota)"}</button></div>`);
  const fai = async (cosa, msg) => { closeSheet(); toast(msg); try { await cosa(); } catch (e) { toast(e.message, true); } caricaPosta(); svuotaCoda(); carica(true); };
  s.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => {
    if (b.dataset.w === v.ws) return closeSheet();
    const nome = A.wss.find((w) => w.id === b.dataset.w)?.nome;
    fai(async () => { await api("POST", "annota", { testo: v.testo, ws: b.dataset.w, id: v.id }, { attesa: 150e3 }); toast(`${v.stato === "da_smistare" ? "Annotato" : "Spostato"} in «${nome}»`); }, v.stato === "da_smistare" ? "Annoto…" : "Lo sposto…");
  });
  s.querySelector("#paVia").onclick = () => fai(async () => { await api("POST", `annota/${v.id}/annulla`, {}); toast("Appunto tolto"); }, "Lo tolgo…");
}
// «Condividi → MyMind» da un'altra app: il service worker ha messo da parte testo e foto, qui li riprendo e li cancello
async function condivisoInArrivo() {
  try {
    if (!(await caches.has("mmt-condiviso"))) return null;
    const c = await caches.open("mmt-condiviso"), out = { testo: "", foto: [] };
    for (const req of await c.keys()) {
      const r = await c.match(req), nome = new URL(req.url).pathname.split("/").pop();
      if (nome === "testo") out.testo = await r.text();
      else out.foto.push(await toJpeg(await r.blob(), 2400));
    }
    await caches.delete("mmt-condiviso");
    return out.testo || out.foto.length ? out : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- avvisi all'apertura
// Scadenze e cose aperte che il Mac legge dalle note. Niente notifiche: un foglio alla prima apertura del giorno,
// e la campanella in alto per rivederli. «Fatto» lo scrive nella nota. Fatto o no, un avviso chiuso non torna: lo ricorda il Mac, per tutti i dispositivi.
const nascosti = () => { try { return JSON.parse(localStorage.getItem("mmt-avvisi-nascosti") || "{}"); } catch { return {}; } };
// Finché il Mac continua a mandare un avviso che qui risulta chiuso, glielo ridico (anche quelli chiusi senza rete, o prima di questa versione)
const avvisiDetti = new Set();
function avvisiDillo(esiti = {}) {
  const via = nascosti(), voci = (A.avvisi?.voci || []).filter((v) => via[v.id] && !avvisiDetti.has(v.id));
  if (!voci.length) return;
  voci.forEach((v) => avvisiDetti.add(v.id));
  api("POST", "avvisi/chiudi", { voci: voci.map((v) => ({ id: v.id, ws: v.ws, testo: v.testo, data: v.data, registro: v.registro, esito: esiti[v.id] || "no" })) })
    .catch(() => voci.forEach((v) => avvisiDetti.delete(v.id)));
}
function avvisiScelti() {
  const a = A.avvisi; if (!a) return { ritardo: [], oggi: [], prossimi: [], nuove: [], aperte: [], n: 0 };
  const via = nascosti(), g = (d, n) => { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const voci = a.voci.filter((v) => !via[v.id]);
  const conData = voci.filter((v) => v.data).sort((x, y) => x.data.localeCompare(y.data));
  const r = {
    ritardo: conData.filter((v) => v.data < a.oggi && v.data >= g(a.oggi, -10)),
    oggi: conData.filter((v) => v.data === a.oggi),
    prossimi: conData.filter((v) => v.data > a.oggi && v.data <= g(a.oggi, 7)),
  };
  // senza scadenza: quelle segnate negli ultimi 7 giorni si fanno vedere da sole, le altre restano in fondo.
  // Una cosa da fare con una data passata da più di 10 giorni non sparisce: torna tra quelle aperte.
  const libere = voci.filter((v) => !v.data || (v.data < g(a.oggi, -10) && v.tipo !== "scadenza")), fresca = (v) => (v.vista || 0) > Date.now() / 1000 - 7 * 86400;
  r.nuove = libere.filter(fresca); r.aperte = libere.filter((v) => !fresca(v));
  r.n = r.ritardo.length + r.oggi.length + r.prossimi.length + r.nuove.length;
  return r;
}
function dipingiAvvisi() {
  const el = $("avvisiN"); if (!el) return;
  const s = avvisiScelti(), n = s.n;
  el.textContent = n || ""; el.className = n ? (s.ritardo.length || s.oggi.length ? "caldo" : "") : "vuoto";
}
async function caricaAvvisi(riprova = true) {
  try { A.avvisi = await api("GET", "avvisi"); } catch { return; }
  avvisiDillo();
  dipingiAvvisi();
  if (A.avvisi.aggiorno && riprova) setTimeout(() => caricaAvvisi(false), 30e3);     // il Mac sta rileggendo una nota cambiata
  const giorno = A.avvisi.oggi;
  if (localStorage.getItem("mmt-avvisi-giorno") !== giorno && avvisiScelti().n && !A.wid && !$("sheet").classList.contains("open")) {
    localStorage.setItem("mmt-avvisi-giorno", giorno);
    mostraAvvisi(false);
  }
}
// Una riga che si trascina: a destra conferma, a sinistra annulla; un tocco senza trascinare apre
function scorrevole(el, carta, { destra, sinistra, tocco }) {
  let x0 = null, y0 = 0, dx = 0, attivo = false;
  const soglia = () => Math.min(120, el.offsetWidth * 0.3);
  carta.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; dx = 0; attivo = false; carta.style.transition = "none"; });
  carta.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (!attivo) {
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.3) { attivo = true; try { carta.setPointerCapture(e.pointerId); } catch {} }
      else { if (Math.abs(ddy) > 12) x0 = null; return; }
    }
    dx = ddx; carta.style.transform = `translateX(${dx}px)`;
    el.classList.toggle("verso-si", dx > 0); el.classList.toggle("verso-no", dx < 0); el.classList.toggle("oltre", Math.abs(dx) > soglia());
  });
  const fine = (e) => {
    if (x0 === null) return;
    x0 = null; carta.style.transition = "";
    if (!attivo) { if (e.type === "pointerup") tocco?.(); return; }
    if (Math.abs(dx) > soglia()) {
      const si = dx > 0; carta.style.transform = `translateX(${si ? "110%" : "-110%"})`; navigator.vibrate?.(10);
      setTimeout(() => { el.style.height = el.offsetHeight + "px"; requestAnimationFrame(() => { el.classList.add("via"); el.style.height = "0px"; }); setTimeout(() => { el.remove(); (si ? destra : sinistra)(); }, 220); }, 160);
    } else { carta.style.transform = ""; el.classList.remove("verso-si", "verso-no", "oltre"); }
  };
  carta.addEventListener("pointerup", fine); carta.addEventListener("pointercancel", fine);
}
function mostraAvvisi(tutti) {
  const s0 = avvisiScelti();
  const quando = (d) => new Date(d + "T12:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const riga = (v) => `<div class="av" data-id="${v.id}"><div class="av-sotto"><span class="si">${svg("ok")}Fatto</span><span class="no">Non mi serve${svg("x")}</span></div>
    <div class="av-t"><i style="--c:${esc(v.colore || "#999")}"></i><span><b>${esc(v.testo)}</b><small>${esc(v.nome)}${v.data ? " · " + quando(v.data) : ""}</small></span></div></div>`;
  const gruppo = (tit, voci, cls = "") => voci.length ? `<div class="lab ${cls}">${tit}</div>${voci.map(riga).join("")}` : "";
  const corpo = gruppo("In ritardo", s0.ritardo, "rosso") + gruppo("Oggi", s0.oggi, "oro") + gruppo("Nei prossimi 7 giorni", s0.prossimi) + gruppo("Da fare, segnate da poco", s0.nuove)
    + (tutti ? gruppo("Ancora aperte, senza data", s0.aperte) : "");
  const s = sheet(`<div class="avvisi"><h3 class="sh">${svg("bell")}Da ricordare</h3>
    ${corpo ? `<p class="av-come"><span>${svg("left")}non mi serve</span><span>fatto${svg("right")}</span></p>` : ""}
    ${corpo || '<p class="vuoto">Niente in scadenza.</p>'}
    ${!tutti && s0.aperte.length ? `<button class="btn" id="avTutti">Vedi anche le ${s0.aperte.length} cose aperte senza data</button>` : ""}</div>`, "tall");
  if (s.querySelector("#avTutti")) s.querySelector("#avTutti").onclick = () => mostraAvvisi(true);
  s.querySelectorAll(".av").forEach((el) => {
    const v = A.avvisi.voci.find((x) => x.id === el.dataset.id);
    const nascondi = (esito = "no") => { const n = nascosti(); n[v.id] = Date.now(); localStorage.setItem("mmt-avvisi-nascosti", JSON.stringify(n)); avvisiDillo({ [v.id]: esito }); dipingiAvvisi(); };
    scorrevole(el, el.querySelector(".av-t"), {
      tocco: () => { closeSheet(); apriWs(v.ws, "nota"); },
      sinistra: () => nascondi("no"),
      destra: () => {
        nascondi("fatto");
        if (v.registro) api("POST", `workspace/${v.ws}/registro/voce`, { ...v.registro, data: regOggi() }).then(() => toast(`Segnato nel registro di «${v.nome}»`), (e) => toast(e.message, true));
        else cattura({ testo: "Fatto: " + v.testo, ws: v.ws }).catch((e) => toast(e.message, true));
      },
    });
  });
}
// ---------------------------------------------------------------- «Tutto su…»: quello che MyMind sa di una cosa, con le fonti
const PROVA_IC = { nota: "note", fonte: "files", chat: "chat", appunto: "edit" };
async function sapereSheet(x) {
  const s = sheet(`<div class="sapere"><h3 class="sh">${svg("search")}Tutto su…</h3>
    <form class="sa-cerca" id="saForm"><input class="field" id="saX" placeholder="Una cosa, un fornitore, una decisione…" value="${esc(x || "")}" autocomplete="off" enterkeyhint="search"><button class="ib main" aria-label="Cerca">${svg("search")}</button></form>
    <div id="saCorpo"><p class="vuoto"><span class="spin"></span>${x ? ` Raccolgo quello che so su «${esc(x)}»…` : ""}</p></div></div>`, "tall");
  const corpo = () => s.querySelector("#saCorpo"), vivo = () => !!corpo() && (s.querySelector("#saX").dataset.per || "") === (x || "");
  s.querySelector("#saX").dataset.per = x || "";
  s.querySelector("#saForm").onsubmit = (e) => { e.preventDefault(); const v = s.querySelector("#saX").value.trim(); if (v) sapereSheet(v); };
  const chips = () => s.querySelectorAll("[data-sx]").forEach((b) => b.onclick = () => sapereSheet(b.dataset.sx));
  if (!x) {
    setTimeout(() => s.querySelector("#saX")?.focus(), 280);
    const d = await api("GET", "sapere").catch(() => ({ schede: [], suggerite: [] }));
    if (!vivo()) return;
    const fissate = d.schede.filter((v) => v.fissata), recenti = d.schede.filter((v) => !v.fissata).slice(0, 6);
    const perWs = {}; d.suggerite.forEach((c) => (perWs[c.nome] ||= { colore: c.colore, cose: [] }).cose.push(c.x));
    corpo().innerHTML = `${fissate.length ? `<div class="lab">Schede fissate</div><div class="chipsrow wrap">${fissate.map((v) => `<button data-sx="${esc(v.x)}" class="on">${esc(v.x)}</button>`).join("")}</div>` : ""}
      ${recenti.length ? `<div class="lab">Cercate di recente</div><div class="chipsrow wrap">${recenti.map((v) => `<button data-sx="${esc(v.x)}">${esc(v.x)}</button>`).join("")}</div>` : ""}
      ${Object.entries(perWs).map(([nome, g]) => `<div class="lab sa-ws" style="--c:${esc(g.colore || "#999")}"><i></i>${esc(nome)}</div><div class="chipsrow wrap">${g.cose.map((c) => `<button data-sx="${esc(c)}">${esc(c)}</button>`).join("")}</div>`).join("")}
      ${!d.schede.length && !d.suggerite.length ? '<p class="vuoto">Scrivi una cosa qui sopra: raccolgo quello che ne dicono note, fonti, chat e appunti di tutti i workspace.</p>' : ""}`;
    return chips();
  }
  const mostra = async (rifai) => {
    let v;
    try { v = await api("POST", "sapere", { x, rifai }, { attesa: 180e3 }); } catch (e) { if (vivo()) corpo().innerHTML = `<p class="vuoto">${esc(e.message)}</p>`; return; }
    if (!vivo()) return;
    if (v.vuota) { corpo().innerHTML = `<p class="vuoto">Su «${esc(x)}» non trovo niente, in nessun workspace.</p>`; return; }
    const quando = (t) => new Date(t * 1000).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    corpo().innerHTML = `<div class="sa-testa"><h4>${esc(v.x)}</h4><button class="btn sm" id="saRifai">${svg("redo")}</button><button class="btn sm${v.fissata ? " main" : ""}" id="saFissa">${svg("ok")}${v.fissata ? "Fissata" : "Fissa"}</button></div>
      <div class="md sa-testo">${renderMd(v.testo.replace(/\]\[/g, "] ["))}</div>
      <div class="lab">Da dove viene · ${v.prove.length} fonti</div>
      ${v.prove.map((p) => `<button class="sa-p" id="saP${p.n}" data-ws="${esc(p.ws)}"><b>${p.n}</b><i style="--c:${esc(p.colore || "#999")}">${svg(PROVA_IC[p.tipo] || "note")}</i><span class="tx"><small>${{ nota: "nota", fonte: "fonte", chat: "chat", appunto: "appunto" }[p.tipo]} · ${esc(p.nome)}${p.titolo ? " · " + esc(p.titolo) : ""}${p.quando ? " · " + quando(p.quando) : ""}</small>${esc(p.testo)}</span></button>`).join("")}`;
    s.querySelector("#saRifai").onclick = () => { corpo().innerHTML = '<p class="vuoto"><span class="spin"></span> La riscrivo…</p>'; mostra(true); };
    s.querySelector("#saFissa").onclick = async () => { const r = await api("POST", "sapere/fissa", { x: v.x, fissata: !v.fissata }).catch(() => null); if (r) { v.fissata = r.fissata; const b = s.querySelector("#saFissa"); b.classList.toggle("main", v.fissata); b.innerHTML = svg("ok") + (v.fissata ? "Fissata" : "Fissa"); toast(v.fissata ? "Scheda fissata: la ritrovi in «Tutto su…»" : "Tolta dalle fissate"); } };
    corpo().querySelectorAll("sup.cite").forEach((c) => c.onclick = () => { const el = s.querySelector("#saP" + c.dataset.n); if (!el) return; el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("lampo"); setTimeout(() => el.classList.remove("lampo"), 1600); });
    corpo().querySelectorAll(".sa-p").forEach((el) => el.onclick = () => { closeSheet(); apriWs(el.dataset.ws, el.querySelector("small").textContent.startsWith("nota") ? "nota" : el.querySelector("small").textContent.startsWith("fonte") ? "fonti" : "chat"); });
  };
  mostra(false);
}
// ---------------------------------------------------------------- diario: cosa è successo, giorno per giorno
const DIARIO_IC = { domanda: "chat", appunto: "edit", fonte: "files", nota: "note", scadenza: "bell" };
async function diarioSheet(giorno) {
  const s = sheet(`<div class="diario"><h3 class="sh">${svg("ws_calendario")}Diario</h3><p class="vuoto"><span class="spin"></span></p></div>`, "tall");
  let d;
  try {
    d = await api("GET", "diario" + (giorno ? `?giorno=${giorno}` : ""));
    if (!giorno && d.giorni.length) { giorno = d.giorni[0].giorno; d = await api("GET", `diario?giorno=${giorno}`); }
  } catch (e) { s.querySelector(".vuoto").textContent = e.message; return; }
  if (!s.querySelector(".diario")) return;                       // nel frattempo hai chiuso
  if (!giorno) { s.querySelector(".vuoto").textContent = "Il diario è ancora vuoto: si riempie da solo mentre usi MyMind."; return; }
  const corto = (g) => g === d.oggi ? "Oggi" : new Date(g + "T12:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const lungo = (g) => new Date(g + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const ora = (t) => new Date(t * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const scad = d.voci.filter((v) => v.tipo === "scadenza"), resto = d.voci.filter((v) => v.tipo !== "scadenza");
  const riga = (v, conOra) => `<button class="di-v" data-ws="${esc(v.ws)}">${conOra ? `<span class="h">${ora(v.t)}</span>` : ""}<i style="--c:${esc(v.colore || "#999")}">${svg(DIARIO_IC[v.tipo] || "chat")}</i><span class="tx"><b>${esc(v.testo)}</b><small>${esc(v.nome || "")}${v.tipo === "fonte" ? " · fonte aggiunta" : v.tipo === "appunto" ? " · appunto al volo" : ""}</small></span></button>`;
  s.querySelector(".diario").innerHTML = `<h3 class="sh">${svg("ws_calendario")}Diario</h3>
    <form class="sa-cerca" id="diForm"><input class="field" id="diQ" placeholder="Cerca nel diario" autocomplete="off" enterkeyhint="search"><button class="ib main" aria-label="Cerca">${svg("search")}</button></form>
    <div id="diTrovati"></div>
    <div class="chipsrow di-giorni">${d.giorni.map((g) => `<button data-g="${g.giorno}" class="${g.giorno === giorno ? "on" : ""}">${corto(g.giorno)}<small>${g.n}</small></button>`).join("")}</div>
    <h4 class="di-tit">${lungo(giorno)}</h4>
    ${d.riassunto ? `<div class="di-riass md">${renderMd(d.riassunto)}</div>` : d.in_corso ? `<p class="di-attesa"><span class="spin"></span>Scrivo il riassunto della giornata…</p>` : ""}
    ${scad.length ? `<div class="lab">In scadenza quel giorno</div>${scad.map((v) => riga(v, false)).join("")}` : ""}
    ${resto.length ? `<div class="lab">Passo per passo</div>${resto.map((v) => riga(v, true)).join("")}` : '<p class="vuoto">Quel giorno non c\'è niente con un orario.</p>'}`;
  s.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => diarioSheet(b.dataset.g));
  s.querySelectorAll(".di-v").forEach((b) => b.onclick = () => { closeSheet(); apriWs(b.dataset.ws); });
  s.querySelector("#diForm").onsubmit = async (e) => {
    e.preventDefault(); const q = s.querySelector("#diQ").value.trim(), box = s.querySelector("#diTrovati"); if (!q) { box.innerHTML = ""; return; }
    box.innerHTML = '<p class="vuoto"><span class="spin"></span></p>';
    const r = await api("GET", "diario?cerca=" + encodeURIComponent(q)).catch(() => null);
    if (!r || !s.querySelector("#diTrovati")) return;
    box.innerHTML = r.trovati.length ? `<div class="lab">«${esc(q)}» compare in ${r.trovati.length} ${r.trovati.length === 1 ? "giorno" : "giorni"}</div>` + r.trovati.map((g) => `<button class="pa" data-tg="${g.giorno}"><span class="in"><b>${lungo(g.giorno)}</b><small>${g.voci.length ? esc(g.voci[0].testo.slice(0, 90)) : "nel riassunto della giornata"}</small></span>${svg("right")}</button>`).join("") : `<p class="vuoto">Nessun giorno parla di «${esc(q)}».</p>`;
    box.querySelectorAll("[data-tg]").forEach((b) => b.onclick = () => diarioSheet(b.dataset.tg));
  };
  s.querySelector(".di-giorni .on")?.scrollIntoView({ inline: "center", block: "nearest" });
  if (d.in_corso && !d.riassunto) setTimeout(() => { if (s.querySelector(".di-attesa")) diarioSheet(giorno); }, 7000);
}
function menu() {
  const s = sheet(`<div class="menu">
    <button data-m="diario">${svg("ws_calendario")}<span><b>Diario</b><small>Cosa hai fatto e deciso, giorno per giorno</small></span></button>
    <button data-m="stile">${svg("spark")}<span><b>Stile</b><small>${STILI[pref.stile || "atelier"][0]} · ${STILI[pref.stile || "atelier"][1]}</small></span></button>
    <button data-m="tema">${svg(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}<span><b>Tema</b><small>${{ auto: "Come il telefono", light: "Chiaro", dark: "Scuro" }[pref.tema]}</small></span></button>
    <button data-m="blocca">${svg("key")}<span><b>Blocca adesso</b><small>Al prossimo avvio serve il PIN</small></span></button>
    <button data-m="pin">${svg("edit")}<span><b>Cambia PIN</b><small>La chiave resta la stessa</small></span></button>
    <button data-m="via" class="danger">${svg("trash")}<span><b>Dimentica questo telefono</b><small>Cancella la chiave da qui. Sul Mac revocalo in Impostazioni.</small></span></button></div>`);
  s.querySelector('[data-m="tema"]').onclick = () => { pref.tema = { auto: "light", light: "dark", dark: "auto" }[pref.tema]; savePref(); applicaTema(); closeSheet(); };
  s.querySelector('[data-m="blocca"]').onclick = () => { closeSheet(); blocca(); };
  s.querySelector('[data-m="diario"]').onclick = () => diarioSheet();
  s.querySelector('[data-m="stile"]').onclick = () => { pref.stile = pref.stile === "tech" ? "atelier" : "tech"; savePref(); applicaTema(); closeSheet(); toast("Stile " + STILI[pref.stile][0]); };
  s.querySelector('[data-m="pin"]').onclick = () => { closeSheet(); const sec = A.sec; pinPad({ titolo: "Nuovo PIN", sotto: "Sei cifre.", onPin: async (p) => { await Cassa.chiudi(p, sec); toast("PIN cambiato"); casa(); } }); };
  s.querySelector('[data-m="via"]').onclick = async () => { closeSheet(); if (await ask("Cancello la chiave da questo telefono? Per tornare a usarlo serve un nuovo abbinamento dal Mac.", "Dimentica", true)) { Cassa.cancella(); Busta.svuota(); Tunnel.ferma(); A.sec = null; nessunAbbinamento(); } };
}

// ================================================================ un workspace
async function apriWs(id, tab = "chat") {
  A.wid = id; A.tab = isSpecial() && tab !== "chat" ? "chat" : tab; A.chat = null; A.pins = []; A.foto = []; A.nota = null; A.fonti = []; A.notaEdit = false; A.cestino = [];
  history.pushState({ v: "ws" }, "");
  tinta(ws().colore);
  schermoWs();
  const wid = id;
  const [chats, cest] = await Promise.all([api("GET", `workspace/${id}/chats`).catch(() => []), api("GET", `workspace/${id}/chats/cestino`).catch(() => null)]);
  if (A.wid !== wid) return;
  A.cestino = cest?.voci || [];
  A.chats = (chats || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (A.tab === "chat" && !A.chat) disegnaTab();
  if (!isSpecial()) caricaFonti();
}
function schermoWs() {
  const w = ws();
  $("app").innerHTML = `<div class="wsv">
    <div class="testa"><header class="top ws"><button class="ib" id="indietro">${svg("left")}</button>${tile(w)}<div class="tt"><b>${esc(w.nome)}</b><small id="sottoWs">${isSpecial() ? w.sotto : `${w.fonti || 0} fonti`}</small></div><button class="mchip" id="mchip"></button></header>
    ${isSpecial() ? "" : `<nav class="tabs" id="tabs">${[["chat", "Chat"], ["nota", "Nota"], ["fonti", "Fonti"]].map(([k, l]) => `<button data-t="${k}" class="${A.tab === k ? "on" : ""}">${svg(k === "chat" ? "chat" : k === "nota" ? "note" : "files")}${l}</button>`).join("")}</nav>`}</div>
    <main id="corpo"></main>
    <div id="composer"></div></div>`;
  // la freccia in alto porta sempre alla home in un tocco: se c'è una chat aperta salta anche il suo passo nella cronologia
  // (il tasto Indietro di Android invece fa un passo alla volta: dalla chat all'elenco, poi alla home)
  $("indietro").onclick = () => {
    if (A.busy && A.chat) return toast("Sta rispondendo: aspetta o premi ■");
    history.go(history.state?.v === "chat" ? -2 : -1);
  };
  $("app").querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
    if (b.dataset.t === "chat" && A.tab === "chat" && A.chat && !A.busy && history.state?.v === "chat") return history.back();   // «Chat» toccato dentro una chat: torna all'elenco
    A.tab = b.dataset.t; A.notaEdit = false; $("tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); disegnaTab(); });
  $("mchip").onclick = sceltaModello;
  disegnaChip();
  disegnaTab();
}
function disegnaChip() {
  const m = modello(), el = $("mchip"); if (!el) return;
  el.innerHTML = m ? `<i${pc(m)}></i><span>${esc(shortName(m).replace(/^Claude /, ""))}</span>${svg("chev")}` : "nessun modello";
}
function sceltaModello() {
  const cur = modello();
  const s = sheet(`<h3 class="sh">Chi risponde</h3><div class="models">${A.modelli.map((m) => `<button data-m="${esc(m.name)}" class="${m.name === cur ? "on" : ""}"><i style="--pc:${COLORI_FORNITORE[m.fornitore] || "var(--ws)"}"></i><span><b>${esc(m.nome)}</b><small>${esc(m.uso || m.fornitore)}</small></span>${m.name === cur ? svg("ok") : ""}</button>`).join("") || "<p class='vuoto'>Nessun modello cloud: controlla OpenRouter sul Mac.</p>"}</div>
    <p class="note">Vale per «${esc(ws().nome)}» su questo telefono. I modelli sul Mac (Ollama) da qui non si usano.</p>`);
  s.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { pref.modelli[A.wid] = b.dataset.m; savePref(); disegnaChip(); closeSheet(); });
}
function disegnaTab() {
  const c = $("corpo"); if (!c) return;
  c.className = "tab-" + A.tab;
  if (A.tab === "chat") { A.chat ? disegnaThread() : disegnaChats(); disegnaComposer(); }
  else { $("composer").innerHTML = ""; A.tab === "nota" ? disegnaNota() : disegnaFonti(); }
}


// ================================================================ chat: rinomina, cancella, cestino
// Cancellare non butta via: la chat va nel cestino del Mac e ci resta 30 giorni. Prima, un modello guarda se nella chat c'è
// qualcosa che nella nota non c'è, e te lo fa salvare.
function chatAzioni(ch) {
  if (!ch) return;
  const s = sheet(`<h3 class="sh ch-t">${esc((ch.title || "Chat").split("\n")[0])}</h3>
    <div class="menu">
      <button data-m="rin">${svg("edit")}<span><b>Rinomina</b><small>Dalle un nome che ritrovi</small></span></button>
      <button data-m="via" class="danger">${svg("trash")}<span><b>Cancella</b><small>Va nel cestino: la riprendi entro 30 giorni</small></span></button></div>`);
  s.querySelector('[data-m="rin"]').onclick = async () => {
    closeSheet();
    const nuovo = await chiediTesto("Nome della chat", (ch.title || "").split("\n")[0], "Rinomina");
    if (!nuovo || nuovo === ch.title) return;
    ch.title = nuovo.slice(0, 120); salvaChat(ch); if (!A.chat) disegnaChats(); toast("Rinominata");
  };
  s.querySelector('[data-m="via"]').onclick = () => cancellaChat(ch);
}
let verificaN = 0;
async function cancellaChat(ch) {
  const wid = A.wid, mia = ++verificaN;
  const parla = (ch.messages || []).some((m) => m.role === "user");
  const via = async (dopo) => {
    verificaN++;
    const d = daSalvare.get(ch.id); if (d) { clearTimeout(d.timer); daSalvare.delete(ch.id); }
    try { await api("DELETE", `workspace/${wid}/chats/${encodeURIComponent(ch.id)}`); } catch (e) { return toast(e.message, true); }
    if (A.wid !== wid) return;
    A.chats = A.chats.filter((c) => c.id !== ch.id);
    if (parla) A.cestino = [{ id: ch.id }, ...(A.cestino || []).filter((c) => c.id !== ch.id)];
    if ($("sheet").classList.contains("open")) closeSheet();
    if (!A.chat) disegnaChats();
    toast(dopo || (parla ? "Chat nel cestino" : "Chat cancellata"));
  };
  if (!parla || isSpecial()) return via();
  const s = sheet(`<h3 class="sh ch-t">${esc((ch.title || "Chat").split("\n")[0])}</h3>
    <div class="ch-att"><i class="spin"></i><span><b>Guardo se si perde qualcosa</b><small>Confronto la chat con la nota e i registri.</small></span></div>
    <div class="row2"><button class="btn" data-no>Annulla</button><button class="btn danger-t" data-su>Cancella senza controllare</button></div>`);
  s.querySelector("[data-no]").onclick = () => { verificaN++; closeSheet(); };
  s.querySelector("[data-su]").onclick = () => via();
  let r;
  try { r = await api("POST", `workspace/${wid}/chats/${encodeURIComponent(ch.id)}/verifica`); } catch (e) { r = { mancanti: [], saltata: e.message }; }
  if (mia !== verificaN || !$("sheet").classList.contains("open")) return;      // nel frattempo hai annullato o già cancellato
  const manca = r.mancanti || [];
  if (!manca.length) return via(r.saltata ? "Chat nel cestino (controllo saltato)" : "Nel cestino · nella nota c'era già tutto");
  const s2 = sheet(`<h3 class="sh ch-t"><span class="num">${manca.length}</span>${manca.length === 1 ? "cosa che non trovo nella nota" : "cose che non trovo nella nota"}</h3>
    <p class="ch-sp">Stanno solo in questa chat. Lascia la spunta a quelle da tenere.</p>
    <div class="ch-manca">${manca.map((m, i) => `<label><input type="checkbox" data-i="${i}" checked><i>${svg("ok")}</i><span>${esc(m)}</span></label>`).join("")}</div>
    <div class="ch-btn"><button class="btn main" data-salva>${svg("note")}Salva nella nota e cancella</button>
      <div class="row2"><button class="btn" data-no>Annulla</button><button class="btn danger-t" data-su>Solo cancella</button></div></div>`, "tall");
  const scelte = () => [...s2.querySelectorAll("input:checked")].map((x) => manca[+x.dataset.i]);
  const agg = () => { const n = scelte().length; s2.querySelector("[data-salva]").disabled = !n; };
  s2.querySelectorAll("input").forEach((x) => x.onchange = agg);
  s2.querySelector("[data-no]").onclick = () => closeSheet();
  s2.querySelector("[data-su]").onclick = () => via();
  s2.querySelector("[data-salva]").onclick = async (e) => {
    const righe = scelte(), b = e.currentTarget;
    b.disabled = true; b.innerHTML = `<i class="spin"></i>Scrivo nella nota…`;
    try {
      await api("POST", `workspace/${wid}/chats/salva-mancanti`, { righe });
      A.nota = null;
      via(righe.length === 1 ? "Salvata nella nota · chat nel cestino" : `${righe.length} cose salvate nella nota · chat nel cestino`);
    } catch (err) { b.disabled = false; b.innerHTML = `${svg("note")}Salva nella nota e cancella`; toast(err.message, true); }
  };
}
async function cestinoSheet() {
  const wid = A.wid;
  const s = sheet(`<h3 class="sh">${svg("trash")}Cestino</h3><div id="cestB"><div class="ch-att"><i class="spin"></i><span><b>Apro il cestino…</b></span></div></div>`, "tall");
  const disegna = (r) => {
    A.cestino = r.voci || [];
    const box = s.querySelector("#cestB"); if (!box) return;
    box.innerHTML = A.cestino.length ? `<p class="ch-sp">Le chat cancellate restano qui ${r.giorni || 30} giorni, poi spariscono da sole.</p>
      <div class="list">${A.cestino.map((c) => `<div class="cest-v"><span class="in"><b>${esc(c.title || "Chat")}</b><small>${c.messaggi} messaggi · cancellata ${ago(c.cancellata)} · ${c.giorni > 1 ? `ancora ${c.giorni} giorni` : c.giorni === 1 ? "ancora 1 giorno" : "ultimo giorno"}</small></span>
        <button class="btn" data-su="${esc(c.id)}">${svg("redo")}Riprendi</button><button class="ib danger-t" data-giu="${esc(c.id)}" aria-label="Elimina per sempre">${svg("x")}</button></div>`).join("")}</div>
      <button class="btn danger-t ch-svuota" id="cestVia">${svg("trash")}Svuota il cestino</button>` : `<p class="ch-vuoto">${svg("trash")}Il cestino è vuoto.</p>`;
    box.querySelectorAll("[data-su]").forEach((b) => b.onclick = async () => {
      try { disegna(await api("POST", `workspace/${wid}/chats/cestino/${encodeURIComponent(b.dataset.su)}`)); } catch (e) { return toast(e.message, true); }
      const chats = await api("GET", `workspace/${wid}/chats`).catch(() => null);
      if (chats && A.wid === wid) { A.chats = chats.sort((a, c) => (c.updated || 0) - (a.updated || 0)); if (!A.chat && A.tab === "chat") disegnaChats(); }
      toast("Chat ripresa");
    });
    box.querySelectorAll("[data-giu]").forEach((b) => b.onclick = async () => {
      if (!await ask("La elimino per sempre? Da qui non si torna indietro.", "Elimina", true)) return cestinoSheet();
      try { await api("DELETE", `workspace/${wid}/chats/cestino/${encodeURIComponent(b.dataset.giu)}`); } catch (e) { toast(e.message, true); }
      cestinoSheet();
    });
    if (box.querySelector("#cestVia")) box.querySelector("#cestVia").onclick = async () => {
      if (!await ask(`Elimino per sempre ${A.cestino.length === 1 ? "la chat" : "le " + A.cestino.length + " chat"} nel cestino?`, "Svuota", true)) return cestinoSheet();
      try { await api("DELETE", `workspace/${wid}/chats/cestino`); A.cestino = []; toast("Cestino svuotato"); } catch (e) { toast(e.message, true); }
      if (!A.chat && A.tab === "chat") disegnaChats();
    };
    if (!A.chat && A.tab === "chat" && A.wid === wid) { const y = $("corpo").scrollTop; disegnaChats(); $("corpo").scrollTop = y; }
  };
  try { disegna(await api("GET", `workspace/${wid}/chats/cestino`)); } catch (e) { toast(e.message, true); }
}

// ================================================================ chat: elenco
function disegnaChats() {
  const sugg = isTutti() ? ["Cosa scade nei prossimi tre mesi?", "Cosa ho annotato questa settimana?", "Quali cose da fare sono rimaste aperte?"]
    : isSpecial() ? ["Spiegami una cosa in due righe", "Aiutami a scrivere un messaggio", "Traduci in inglese"]
    : ["Riassumi la nota", "Cosa c'è da fare adesso?", "Annota: ", "Cerca nelle fonti…"];
  $("corpo").innerHTML = `<div class="chats">
    <div class="welcome">${tile(ws())}<h2>${isSpecial() ? esc(ws().nome) : `Cosa ti serve su «${esc(ws().nome)}»?`}</h2>
      <div class="sugg">${sugg.map((s) => `<button data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
    ${A.chats.length ? `<div class="lab">Chat precedenti</div><div class="list">${A.chats.slice(0, 40).map((ch) => `<div class="li-r"><button class="li" data-c="${esc(ch.id)}"><span class="ic">${svg("chat")}</span><span class="in"><b>${esc((ch.title || "Chat").split("\n")[0])}</b><small>${ch.messages?.length || 0} messaggi · ${ago((ch.updated || ch.created) / 1000)}${ch.telefono ? " · dal telefono" : ""}</small></span></button><button class="li-m" data-cm="${esc(ch.id)}" aria-label="Rinomina o cancella">${svg("dots")}</button></div>`).join("")}</div>` : ""}
    ${A.cestino?.length ? `<button class="cestino" id="cestino">${svg("trash")}<span>Cestino · ${A.cestino.length} ${A.cestino.length === 1 ? "chat" : "chat"}</span><small>si riprendono entro 30 giorni</small>${svg("chev")}</button>` : ""}</div>`;
  $("corpo").querySelectorAll("[data-cm]").forEach((b) => b.onclick = () => chatAzioni(A.chats.find((c) => c.id === b.dataset.cm)));
  if ($("cestino")) $("cestino").onclick = cestinoSheet;
  $("corpo").querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { A.chat = A.chats.find((c) => c.id === b.dataset.c); history.pushState({ v: "chat" }, ""); disegnaThread(); disegnaComposer(); scorri(); });
  $("corpo").querySelectorAll("[data-s]").forEach((b) => b.onclick = () => {
    const s = b.dataset.s, inp = $("input");
    if (s.endsWith(": ") || s.endsWith("…")) { inp.value = s.replace("…", " "); inp.focus(); autosize(); return; }
    inp.value = s; invia();
  });
}
function scorri() { const c = $("corpo"); if (c) c.scrollTop = c.scrollHeight; }

// ================================================================ chat: una conversazione
function disegnaThread() {
  const ch = A.chat;
  $("corpo").innerHTML = `<div class="thread" id="thread">${ch.messages.map((m, i) => rigaRiassunto(ch, i) + separatore(ch.messages, i) + msgHtml(m, i)).join("")}</div>`;
  tieniPremuto($("thread"));
  legaThread();
  caricaImmagini($("corpo"));
}
function msgHtml(m, i) {
  const base = `workspace/${A.wid}/`;
  if (m.role === "user") {
    const imgs = (m.imgs || []).map((p) => `<img data-src="${esc(base + p)}" alt="">`).join("");
    const { html: testoH, fuori } = conFonti(m, (p) => `<span class="pin-in">${svg(TIPO_IC[p.tipo] || "file")}${esc(p.nome)}</span>`);
    const pins = fuori.map((p) => `<span class="pin">${svg(TIPO_IC[p.tipo] || "file")}${esc(p.nome)}</span>`).join("");
    return `<div class="msg u" data-i="${i}">${pins ? `<div class="pins">${pins}</div>` : ""}${m.content ? `<div class="bubble">${testoH}</div>` : ""}${imgs ? `<div class="uimgs">${imgs}</div>` : ""}</div>`;
  }
  const live = A.busy && i === A.chat.messages.length - 1;
  let body;
  if (m.error) body = `<p class="err">${esc(m.error)}</p>`;
  else if (live && !m.content && !m.thinking) body = `<div class="wait"><span class="dots3"><i></i><i></i><i></i></span>${esc(m.phase || "sto pensando…")}</div>`;
  else body = renderMd(m.content);
  if (m.thinking) body = `<details class="think"${live && !m.content ? " open" : ""}><summary>${svg("right")}${live && !m.content ? "Sta ragionando…" : `Ha ragionato${m.thinkSecs ? ` per ${fmt(m.thinkSecs)} s` : ""}`}</summary><div>${esc(m.thinking)}</div></details>` + body;
  if (m.azioni?.length) body = `<div class="acts">${m.azioni.map((a) => `<span>${svg(a.fonte ? "file" : "search")}${esc(a.testo)}</span>`).join("")}</div>` + body;
  if (m.proposte?.length) body += `<div class="props">${m.proposte.map((p, k) => propHtml(p, i, k)).join("")}</div>`;
  const LINK = (w) => { let h = w.url; try { h = new URL(w.url).hostname.replace(/^www\./, ""); } catch {} return `<a class="wsrc" href="${esc(w.url)}" target="_blank" rel="noopener">${svg("globe")}${esc(w.titolo || h)}</a>`; };
  const { usati, altri } = live ? { usati: m.web || [], altri: [] } : webUsati(m);
  const web = usati.map(LINK).join("") + (altri.length ? `<details class="web-altri"><summary>${svg("globe")}${altri.length} ${altri.length === 1 ? "risultato" : "risultati"} del web non usati</summary><div class="lista">${altri.map(LINK).join("")}</div></details>` : "");
  const st = m.stats, costo = st?.costo ? ` · ${st.costo < 0.01 ? "<1 cent" : fmt(st.costo * 100, 1) + " cent"}` : "";
  const tags = [m.fonti?.length || m.nota ? `${m.fonti?.length || 0} fonti${m.nota ? " + nota" : ""}` : "", m.noteWs?.length ? `${m.noteWs.length} note` : "", m.usaWeb ? "web" : ""].filter(Boolean).join(" · ");
  return `<div class="msg b${live ? " live" : ""}" data-i="${i}">
    <div class="who"><span class="av"${pc(m.model)}>${svg("cloud")}</span><b>${esc(shortName(m.model))}</b>${tags ? `<small>${tags}</small>` : ""}</div>
    <div class="md">${body}</div>${web ? `<div class="wsrcs">${web}</div>` : ""}${notaAutoHtml(m, i)}${m.rimandi?.length && !live ? `<div class="rimandi">${m.rimandi.map((r) => `<button data-sapere="${esc(r.x)}" style="--c:${esc(r.colore || "#999")}"><i></i><span><b>C'entra con «${esc(r.nome)}»</b>${esc(r.perche)}</span>${svg("right")}</button>`).join("")}</div>` : ""}
    ${live ? "" : `<div class="mfoot"><button data-copy="${i}">${svg("copy")}</button>${i === A.chat.messages.length - 1 ? `<button data-redo>${svg("redo")}Rigenera</button>` : ""}<span>${st?.eval_count ? `${st.prompt_eval_count ? pesoHtml(st) + " · " : ""}${kTok(st.eval_count)} scritti${costo}` : ""}</span></div>`}</div>`;
}
// quanto ha letto il modello per rispondere: tutta la chat, la nota, gli estratti, le fonti citate. Oltre 100k token la chat
// è «pesante»: ogni domanda costa e aspetta di più, e conviene aprirne una nuova
const kTok = (n) => n >= 1000 ? fmt(n / 1000, n >= 100000 ? 0 : 1) + "k" : String(n);
function pesoHtml(s) {
  if (!s?.prompt_eval_count) return "";
  const n = s.prompt_eval_count, liv = n > 100000 ? " pesante" : n > 50000 ? " medio" : "";
  const tit = n > 100000 ? "Chat pesante: a ogni domanda il modello rilegge tutto questo. Per risparmiare tempo e soldi apri una nuova chat (la nota del workspace resta)."
    : "Token letti dal modello per questa risposta: chat, nota, estratti e fonti citate.";
  return `<span class="peso${liv}" title="${tit}">${kTok(n)} letti</span>`;
}
const PROP_IC = { crea_documento: "plus", modifica_documento: "edit", rinomina_fonte: "right", rimuovi_fonte: "trash" };
function propHtml(p, i, k) {
  let prev = "";
  if (p.tipo === "crea_documento") prev = `<div class="pbox">${esc(p.dopo.slice(0, 1500))}${p.dopo.length > 1500 ? "\n…" : ""}</div>`;
  if (p.tipo === "modifica_documento") prev = `<div class="pbox diff">${lineDiff(p.prima, p.dopo)}</div>`;
  if (p.tipo === "rinomina_fonte") prev = `<div class="pline">${esc(p.nome)} → <b>${esc(p.nuovo)}</b></div>`;
  const stato = { "in attesa": `<div class="row2"><button class="btn sm" data-prop="scarta" data-mi="${i}" data-pk="${k}">Scarta</button><button class="btn sm main" data-prop="applica" data-mi="${i}" data-pk="${k}">${svg("ok")}Applica</button></div>`,
    applicata: `<span class="chip ok">${svg("ok")}applicata</span>`, scartata: '<span class="chip">scartata</span>', errore: `<span class="chip bad">non riuscita</span>` }[p.stato] || "";
  return `<div class="prop${p.tipo === "rimuovi_fonte" ? " del" : ""}"><div class="phd">${svg(PROP_IC[p.tipo] || "file")}<b>${esc(p.titolo)}</b></div>${prev}${stato}</div>`;
}
function notaAutoHtml(m, i) {
  const n = m.notaAuto;
  if (!n) return "";
  if (n.stato === "controllo") return `<div class="nauto wait"><span class="spin"></span>Guardo se c'è da aggiornare la nota…</div>`;
  if (n.stato === "errore") return `<div class="nauto bad">${svg("note")}Nota non aggiornata: ${esc((n.errore || "errore").slice(0, 80))}</div>`;
  const off = n.stato === "annullato";
  const righe = n.modifiche.map((x) => x.op === "aggiungi" ? x.righe.map((r) => `<div class="na-add">${esc(r)}</div>`).join("")
    : x.op === "sostituisci" ? `<div class="na-del">${esc(x.vecchia)}</div><div class="na-add">${esc(x.nuova)}</div>` : `<div class="na-del">${esc(x.vecchia)}</div>`).join("");
  return `<details class="nauto${off ? " off" : ""}"><summary>${svg(off ? "redo" : "note")}<b>${off ? "Modifica annullata" : "Nota aggiornata"}</b>${svg("chev")}</summary><div class="na-body">${righe}${off ? "" : `<button class="btn sm" data-nundo="${i}">${svg("redo")}Annulla</button>`}</div></details>`;
}
function legaThread() {
  const t = $("thread"); if (!t) return;
  t.onclick = async (e) => {
    const b = e.target.closest("button, sup.cite, img[data-src], .code [data-copy]");
    if (!b) return;
    const m = (sel) => A.chat.messages[+b.dataset[sel]];
    if (b.dataset.sapere) return sapereSheet(b.dataset.sapere);
    if (b.matches("sup.cite")) return citazione(b.closest(".msg"), +b.dataset.n);
    if (b.matches("img")) return zoom(b.src);
    if (b.dataset.copy !== undefined && b.closest(".code")) { navigator.clipboard?.writeText(b.closest(".code").querySelector("code").innerText); return toast("Copiato"); }
    if (b.dataset.copy !== undefined) { navigator.clipboard?.writeText(m("copy").content); return toast("Copiato"); }
    if (b.dataset.redo !== undefined) { A.chat.messages.pop(); return genera(A.chat); }
    if (b.dataset.nundo !== undefined) return annullaNota(m("nundo"));
    if (b.dataset.prop) {
      const msg = m("mi"), p = msg.proposte[+b.dataset.pk];
      if (b.dataset.prop === "scarta") p.stato = "scartata";
      else {
        if (p.tipo === "rimuovi_fonte" && !await ask(`Togliere «${p.nome}»? Finisce nella cartella _rimosse sul Mac.`, "Togli", true)) return;
        try { await api("POST", `workspace/${A.wid}/applica`, p); p.stato = "applicata"; toast("Fatto"); caricaFonti(); }
        catch (err) { p.stato = "errore"; p.errore = err.message; toast(err.message, true); }
      }
      salvaChat(A.chat); disegnaThread();
    }
  };
}
function citazione(row, n) {
  const m = A.chat.messages[+row.dataset.i], f = m?.fonti?.[n - 1];
  if (!f) return;
  const s = sheet(`<h3 class="sh"><span class="num">${n}</span>${esc(f.nome)}${f.pagina ? ` <small>pag. ${f.pagina}</small>` : ""}</h3>${f.ws_nome ? `<p class="note">dal workspace «${esc(f.ws_nome)}»</p>` : ""}
    <blockquote class="estratto">${esc(f.testo)}</blockquote><button class="btn main wide" id="apriF">${svg("open")}Apri la fonte</button>`);
  s.querySelector("#apriF").onclick = () => { closeSheet(); const w = f.ws || A.wid; apriFonte({ id: f.fonte, nome: f.nome, tipo: f.tipo }, w); };
}
function zoom(src) { sheet(`<img class="zoom" src="${esc(src)}" alt="">`, "full"); }

// ================================================================ il riquadro per scrivere
function disegnaComposer() {
  const c = $("composer"); if (!c) return;
  c.innerHTML = `<div class="comp">
    ${A.pins.length || A.foto.length ? `<div class="att">${A.pins.map((p, k) => `<span class="pin">${svg(TIPO_IC[p.tipo] || "file")}${esc(p.nome)}<button data-xp="${k}">${svg("x")}</button></span>`).join("")}${A.foto.map((f, k) => `<span class="ph"><img src="${f.url}" alt=""><button data-xf="${k}">${svg("x")}</button></span>`).join("")}</div>` : ""}
    <div class="box"><button class="ib" id="cam" aria-label="Scatta una foto">${svg("camera")}</button><button class="ib" id="clip" aria-label="Foto dalla galleria">${svg("image")}</button>
      <textarea id="input" rows="1" placeholder="${A.chat ? "Rispondi…" : "Scrivi…"}" enterkeyhint="enter"></textarea>
      <button class="ib main" id="send" aria-label="Invia">${svg(A.busy ? "stop" : "up")}</button></div>
    <input type="file" id="pick" accept="image/*" multiple hidden><input type="file" id="scatto" accept="image/*" capture="environment" hidden></div>`;
  const inp = $("input");
  inp.oninput = autosize;
  campoConFonti(inp, () => A.pins, (p) => {             // l'etichetta è sparita dal testo: la fonte si stacca
    A.pins = A.pins.filter((x) => x !== p);
    const v = inp.value, c = inp.selectionStart; disegnaComposer();
    const n = $("input"); n.value = v; n.setSelectionRange(c, c); autosize(); n.focus();
  });
  $("send").onclick = () => A.busy ? A.ctrl?.abort() : invia();
  $("clip").onclick = () => $("pick").click();
  $("cam").onclick = () => $("scatto").click();       // apre direttamente la fotocamera posteriore
  for (const id of ["pick", "scatto"]) $(id).onchange = async () => { for (const f of $(id).files) A.foto.push(await toJpeg(f)); disegnaComposer(); $("input").focus(); };
  c.querySelectorAll("[data-xp]").forEach((b) => b.onclick = () => { const testo = togliCitazione($("input").value, A.pins[+b.dataset.xp].nome); A.pins.splice(+b.dataset.xp, 1); disegnaComposer(); $("input").value = testo; autosize(); });
  c.querySelectorAll("[data-xf]").forEach((b) => b.onclick = () => { A.foto.splice(+b.dataset.xf, 1); disegnaComposer(); });
}
function autosize() { const t = $("input"); if (!t) return; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; t._specchio?.agg(); }
async function toJpeg(file, lato = 1600) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, lato / Math.max(img.width, img.height)), cv = document.createElement("canvas");
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
  const b64s = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
  return { blob, b64: b64s, url: URL.createObjectURL(blob) };
}
async function invia() {
  if (A.busy) return;
  const text = $("input").value.trim();
  if (!text && !A.foto.length && !A.pins.length) return;
  const model = modello();
  if (!model) return toast("Nessun modello cloud disponibile", true);
  if (!A.chat) {
    A.chat = { id: Math.random().toString(36).slice(2, 10), title: (text || "Foto").slice(0, 60), created: Date.now(), updated: Date.now(), messages: [], telefono: true };
    A.chats.unshift(A.chat); history.pushState({ v: "chat" }, "");
  }
  const foto = A.foto, pins = A.pins;
  A.foto = []; A.pins = [];
  const msg = { role: "user", content: text || (pins.length ? "Leggi la fonte indicata e dimmi in breve cosa contiene." : "Cosa vedi in questa immagine?"), imgs: [], t: Date.now() };
  if (pins.length) msg.pins = pins;
  A.chat.messages.push(msg);
  $("input").value = ""; autosize();
  disegnaThread(); disegnaComposer(); scorri();
  for (const f of foto) {
    try { const r = await api("POST", `workspace/${A.wid}/carica?dove=allegati&nome=foto.jpg`, null, { corpo: new Uint8Array(await f.blob.arrayBuffer()), ct: "image/jpeg" }); msg.imgs.push(r.file); blobs.set(`workspace/${A.wid}/${r.file}`, f.url); }
    catch (e) { toast("Foto non inviata: " + e.message, true); }
  }
  genera(A.chat, foto.map((f) => f.b64));
}

// ================================================================ la risposta (come generate() della pagina del Mac, solo cloud)
async function genera(chat, freshImages) {
  const model = modello(), info = minfo(model), wid = A.wid, w = ws();
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const reply = { role: "assistant", content: "", model, phase: "", t: Date.now() };
  const wantWeb = A.srv?.web_motore !== "spento";        // il web è uno strumento: il modello cerca solo quando serve
  chat.messages.push(reply); chat.updated = Date.now();
  A.busy = true; A.ctrl = new AbortController();
  const ridisegna = () => { if (A.chat !== chat || A.tab !== "chat") return; const row = $("thread")?.querySelector(`.msg[data-i="${chat.messages.length - 1}"]`); if (row) { row.outerHTML = msgHtml(reply, chat.messages.length - 1); } const t = $("corpo"); if (t && t.scrollHeight - t.scrollTop - t.clientHeight < 220) scorri(); };
  disegnaThread(); disegnaComposer(); scorri();
  const t0 = performance.now(); let first = 0, lastPaint = 0;
  try {
    let system = "Rispondi in italiano, in modo chiaro e concreto. L'utente ti scrive dal telefono: vai al punto, niente preamboli." + `\n\nOggi è ${oggi()}.` + DATA_REGOLA;
    const rules = "\n\nRegole: usa note ed estratti quando sono pertinenti; quando usi un estratto citalo col suo numero tra parentesi quadre, per esempio [2]. "
      + "Se le fonti non bastano dillo chiaramente, poi rispondi con quello che sai distinguendo ciò che viene dalle fonti da ciò che è conoscenza generale. "
      + "Non inventare numeri, date o nomi." + (wantWeb ? " Se ti servono informazioni dal web hai lo strumento cerca_web: usalo solo quando serve davvero (prezzi, schede tecniche, manuali, notizie), scrivi tu una ricerca breve e precisa, e cita con un link Markdown le pagine che usi." : "");
    const users = chat.messages.filter((m) => m.role === "user").slice(-2).map((m) => m.content);
    if (isTutti()) {
      reply.phase = "cerco in tutti i workspace…"; ridisegna();
      const ctx = await api("POST", "tutti/contesto", { domanda: users.join("\n"), k: 6, nota_max: 80000 });
      reply.fonti = ctx.estratti.map((e) => ({ ws: e.ws, ws_nome: e.ws_nome, fonte: e.fonte, nome: e.nome, pagina: e.pagina, tipo: e.tipo, testo: e.testo.slice(0, 600) }));
      reply.noteWs = ctx.note.map((n) => ({ ws: n.ws, nome: n.nome }));
      system += `\n\nSei MyMind e qui guardi insieme tutti i workspace dell'utente: ${ctx.workspace.map((x) => `«${x.nome}» (${x.fonti} fonti)`).join(", ")}.`;
      if (ctx.note.length) system += "\n\n## Note dei workspace (memoria di lungo periodo, ognuna completa)\n" + ctx.note.map((n) => `### ${n.nome}\n${n.testo}`).join("\n\n");
      const fuori = ctx.workspace.filter((x) => !ctx.note.some((n) => n.ws === x.id)).length;
      if (ctx.estratti.length) system += "\n\n## Estratti dalle fonti\n" + ctx.estratti.map((e, k) => `[${k + 1}] workspace «${e.ws_nome}» · ${e.nome}${e.pagina ? `, pag. ${e.pagina}` : ""}\n${e.testo}`).join("\n\n");
      if (fuori) system += `\n\n(${fuori} note non entrano intere: di quelle vedi solo i pezzi pertinenti tra gli estratti.)`;
      system += rules + " Per ogni informazione di' da quale workspace viene; se la domanda riguarda date o scadenze, mettile in ordine di tempo rispetto a oggi.";
    }
    const tools = !isSpecial() && info?.strumenti !== false;
    if (tools) system += `\n\nPuoi usare gli strumenti sui file del workspace «${w.nome}»: elenca_fonti, leggi_fonte (testo intero), cerca_fonti; `
      + "e puoi PROPORRE crea_documento, modifica_documento (solo testi .md .txt .csv), rinomina_fonte, rimuovi_fonte. "
      + "Le proposte compaiono all'utente con un'anteprima e si eseguono solo se lui preme «Applica»: non dire mai che una modifica è fatta. "
      + "Usa gli strumenti quando l'utente chiede di creare, cambiare, riordinare o togliere file, o quando gli estratti non bastano. "
      + "La nota del workspace non si cambia con questi strumenti: si aggiorna da sola dopo ogni risposta.";
    if (!isSpecial()) {
      reply.phase = "cerco nelle fonti…"; ridisegna();
      const ctx = await api("POST", `workspace/${wid}/contesto`, { domanda: users.join("\n"), k: 6, nota_max: 80000 });
      reply.fonti = ctx.estratti.map((e) => ({ fonte: e.fonte, nome: e.nome, pagina: e.pagina, tipo: e.tipo, testo: e.testo.slice(0, 600) }));
      reply.nota = !!ctx.nota.trim();
      system += `\n\nSei MyMind, l'assistente personale del workspace «${w.nome}».`;
      if (ctx.nota.trim()) system += `\n\n## Nota del workspace (memoria di lungo periodo, COMPLETA: la vedi tutta, non a estratti)\n${ctx.nota.trim()}`;
      if (ctx.estratti.length) system += "\n\n## Estratti dalle fonti del workspace\n" + ctx.estratti.map((e, k) => `[${k + 1}] ${e.nome}${e.pagina ? `, pag. ${e.pagina}` : ""}${tools ? ` (id ${e.fonte})` : ""}\n${e.testo}`).join("\n\n");
      system += rules + (notaAutoOn(model)
        ? " La nota si aggiorna da sola dopo ogni tua risposta: un archivista rilegge lo scambio e ci mette quello che conta (fatti, numeri, "
          + "decisioni, correzioni). Se l'utente ti dà informazioni nuove o ti chiede di annotare, correggere o togliere qualcosa, rispondi "
          + "normalmente e conferma in breve: non dirgli che deve aggiornarla lui e non dire che non puoi."
        : " Non modifichi tu la nota: dal Mac l'utente può aggiornarla con «Aggiorna la nota».");
    }
    // fonti indicate: il testo intero va dentro il messaggio che le indica, come un documento allegato
    const pinned = [], owner = new Map(), docs = new Map();
    for (const m of [...chat.messages].reverse()) for (const p of m.pins || []) if (!owner.has(p.fonte)) { owner.set(p.fonte, m); pinned.push(p); }
    // si riallegano (testo e immagini) solo le fonti citate nelle ultime 3 domande: quelle di giorni fa costavano
    // decine di migliaia di token a ogni messaggio. Le vecchie restano una riga col nome, e si possono rileggere.
    const recenti = new Set(chat.messages.filter((m) => m.role === "user").slice(-3).flatMap((m) => (m.pins || []).map((p) => p.fonte)));
    if (pinned.length && !isSpecial()) {
      reply.phase = "leggo le fonti indicate…"; ridisegna();
      let budget = 150000;
      for (const p of pinned) {
        if (!recenti.has(p.fonte)) continue;
        if (budget < 500) break;
        const r = await api("GET", `workspace/${wid}/fonti/${p.fonte}/intero?max=${budget}`).catch(() => null);
        if (!r) continue;
        if (info?.vede && ["pdf", "foto"].includes(p.tipo)) r.immagini = (await api("GET", `workspace/${wid}/fonti/${p.fonte}/immagini?max=8`).catch(() => ({}))).immagini || [];
        docs.set(p.fonte, r); budget -= r.testo.length;
      }
      system += "\n\nNel messaggio dell'utente «@nome» segna il punto della frase in cui cita quella fonte (per esempio «quando l'interruttore @interruttore1.jpg è spento»): "
        + "è il documento allegato con lo stesso nome, e la frase va letta riferendo ogni @ al suo documento."
        + "\n\nQuando l'utente indica una fonte, il suo testo completo è allegato al suo messaggio tra <documento> e </documento>: "
        + "è di quel documento che parla («questa scheda», «questi pannelli»…), leggilo e usalo; ha la precedenza sugli estratti. "
        + "Se ci sono anche le immagini delle pagine o la foto, per tabelle, numeri e targhette fidati delle immagini: il testo estratto può mescolare le colonne.";
      reply.indicate = pinned.filter((p) => recenti.has(p.fonte)).map((p) => ({ fonte: p.fonte, nome: p.nome }));
    }
    const attached = (m) => (m.pins || []).filter((p) => owner.get(p.fonte) === m).map((p) => {
      const d = docs.get(p.fonte);
      return d ? `\n\n<documento nome="${d.nome}"${tools ? ` id="${p.fonte}"` : ""}>\n${d.testo}\n</documento>` : (recenti.has(p.fonte) ? `\n\n[l'utente ha indicato «${p.nome}», ma il testo non è disponibile]` : `\n\n[qui l'utente citava la fonte «${p.nome}»${tools ? ` (id ${p.fonte})` : ""}: non è più allegata per intero; ` + (tools ? "se ti serve, rileggila con leggi_fonte]" : "se ti serve, chiedi all'utente di citarla di nuovo]"));
    }).join("");
    const riass = await comprimi(chat,
      (b) => api("POST", `workspace/${wid}/riassunto`, b, { attesa: 240e3 }),
      () => { reply.phase = "riassumo la parte vecchia della chat…"; ridisegna(); });
    if (riass) { system += REGOLA_RIASSUNTO + riass.testo; salvaChat(chat, wid); }
    const msgs = chat.messages.slice(riass ? riass.fino : 0, -1).filter((m) => !m.error);
    const history = msgs.map((m) => ({ role: m.role, content: timbro(m) + m.content + (m.role === "user" ? attached(m) : "") + (m.imgs?.length && m !== lastUser ? `\n[${m.imgs.length} immagine/i allegate in precedenza]` : "") }));
    msgs.forEach((m, k) => { const imgs = (m.pins || []).filter((p) => owner.get(p.fonte) === m).flatMap((p) => docs.get(p.fonte)?.immagini || []); if (imgs.length) history[k].images = imgs; });
    if (freshImages?.length) history[history.length - 1].images = [...(history[history.length - 1].images || []), ...freshImages];
    else if (lastUser?.imgs?.length) {                     // rigenerazione: ricarico le foto dell'ultima domanda
      const again = await Promise.all(lastUser.imgs.map(async (p) => {
        const b = await Tunnel.blob(`workspace/${wid}/${p}`);
        return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(b); });
      }));
      history[history.length - 1].images = [...(history[history.length - 1].images || []), ...again];
    }
    history.unshift({ role: "system", content: system });
    reply.phase = "chiedo a " + shortName(model) + "…"; ridisegna();
    const body = { model, messages: history, stream: true, think: false, web: wantWeb, strumenti: tools ? wid : undefined, options: { temperature: 0.6, num_predict: 32000 } };
    let buf = "";
    const w2 = await Tunnel.chiama("POST", "openrouter/chat", { corpo: body, segnale: A.ctrl.signal, attesa: 180e3, onPezzo: (testo) => {
      buf += testo;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.error) { reply.error = "Errore: " + j.error; continue; }
        const m = j.message || {};
        if (m.thinking) { first = first || performance.now(); reply.thinking = (reply.thinking || "") + m.thinking; }
        if (m.content) { first = first || performance.now(); if (reply.thinking && !reply.content) reply.thinkSecs = (performance.now() - first) / 1000; reply.content += m.content; }
        if (m.citazioni) reply.web = [...(reply.web || []), ...m.citazioni];
        if (m.azione) { (reply.azioni ||= []).push(m.azione); reply.phase = m.azione.testo.toLowerCase() + "…"; }
        if (m.proposta) (reply.proposte ||= []).push(m.proposta);
        if (j.done) { reply.stats = j; if (j.ricerche_web) reply.usaWeb = true; }
      }
      const now = performance.now();
      if (now - lastPaint > 90) { lastPaint = now; ridisegna(); }
    } });
    if (w2.st >= 400) { let j = {}; try { j = JSON.parse(w2.parti.join("")); } catch {} throw new Error(j.errore || w2.errore || `errore ${w2.st}`); }
  } catch (e) {
    if (e.name === "AbortError") reply.content += reply.content ? "\n\n*(interrotta)*" : "*(interrotta)*";
    else reply.error = "Errore: " + e.message;
  }
  delete reply.phase;
  A.busy = false; A.ctrl = null; chat.updated = Date.now();
  if (notaAutoOn(model) && wid === A.wid && !reply.error && reply.content.trim() && !reply.content.endsWith("*(interrotta)*")) autoNota(chat, reply, wid);
  if (!reply.error && reply.content.trim() && !reply.content.endsWith("*(interrotta)*") && wid !== "_tutti") cercaRimandi(chat, reply, wid);
  salvaChat(chat, wid);
  if (A.chat === chat) { disegnaThread(); disegnaComposer(); }
  navigator.vibrate?.(12);
}
// Dopo la risposta: questa cosa c'entra con un altro workspace? Se sì compare un rimando sotto, che apre «Tutto su…»
async function cercaRimandi(chat, reply, wid) {
  const domanda = chat.messages.slice(0, chat.messages.indexOf(reply)).reverse().find((m) => m.role === "user")?.content || "";
  const r = await api("POST", "rimandi", { ws: wid, domanda, risposta: reply.content.slice(0, 800) }).catch(() => null);
  if (!r?.rimandi?.length) return;
  reply.rimandi = r.rimandi; salvaChat(chat, wid); aggiornaMsg(chat, reply);
}
async function autoNota(chat, reply, wid) {
  const prima = chat.messages.slice(0, chat.messages.indexOf(reply)).reverse().find((m) => m.role === "user");
  reply.notaAuto = { stato: "controllo" }; aggiornaMsg(chat, reply);
  try {
    const r = await api("POST", `workspace/${wid}/nota/auto`, { domanda: prima?.content || "", risposta: reply.content, chat: chat.id, pos: chat.messages.indexOf(reply) });
    if (r.modifiche.length) { reply.notaAuto = { stato: "fatto", modifiche: r.modifiche }; A.nota = null; navigator.vibrate?.([10, 60, 10]); }
    else delete reply.notaAuto;
  } catch (e) { reply.notaAuto = { stato: "errore", errore: e.message }; }
  salvaChat(chat, wid); aggiornaMsg(chat, reply);
}
function aggiornaMsg(chat, m) {
  if (A.chat !== chat || A.tab !== "chat") return;
  const i = chat.messages.indexOf(m), row = $("thread")?.querySelector(`.msg[data-i="${i}"]`);
  if (row) row.outerHTML = msgHtml(m, i);
}
async function annullaNota(m) {
  const inv = [];
  for (const x of [...m.notaAuto.modifiche].reverse()) {
    if (x.op === "aggiungi") inv.push(...x.righe.map((r) => ({ op: "elimina", vecchia: r })));
    else if (x.op === "sostituisci") inv.push({ op: "sostituisci", vecchia: x.nuova, nuova: x.vecchia });
    else inv.push({ op: "aggiungi", sezione: x.sezione, righe: [x.vecchia] });
  }
  try { await api("POST", `workspace/${A.wid}/nota/modifiche`, { modifiche: inv }); m.notaAuto.stato = "annullato"; A.nota = null; salvaChat(A.chat); aggiornaMsg(A.chat, m); toast("Modifica alla nota annullata"); }
  catch (e) { toast(e.message, true); }
}
// Salvataggio con ripresa: se il broker perde un pezzo o il Mac dorme, la chat resta «da salvare» e riprovo
// (dopo 5 s, poi sempre più di rado, e ogni volta che torni sull'app) finché il Mac non conferma.
const daSalvare = new Map();          // chat.id → { chat, wid, prove, timer }
function salvaChat(chat, wid = A.wid) {
  const d = daSalvare.get(chat.id) || { prove: 0 };
  clearTimeout(d.timer);
  Object.assign(d, { chat, wid }); daSalvare.set(chat.id, d);
  if (d.inCorso) { d.ancora = true; return; }          // ne parte uno solo per volta: quello dopo porta la versione nuova
  d.inCorso = true;
  const copia = JSON.parse(JSON.stringify(chat));
  api("PUT", `workspace/${wid}/chats/${encodeURIComponent(chat.id)}`, copia).then((r) => {
    if (r?.rev != null) chat.rev = r.rev;
    // il Mac aveva scritto nella stessa chat: il server rimanda l'unione delle due versioni
    if (r?.chat) { adottaChat(chat, r.chat); if (A.chat === chat && !A.busy) disegnaThread(); }
    if (d.prove) toast("Chat salvata sul Mac");
    d.prove = 0; d.inCorso = false;
    if (d.ancora) { d.ancora = false; salvaChat(d.chat, d.wid); } else daSalvare.delete(chat.id);
  }).catch(() => {
    d.inCorso = false; d.ancora = false; d.prove++;
    if (d.prove === 1) toast("Chat non ancora salvata sul Mac: riprovo da solo", true);
    d.timer = setTimeout(() => salvaChat(d.chat, d.wid), Math.min(60e3, 5e3 * 2 ** (d.prove - 1)));
  });
}
function risalvaTutto() { for (const d of daSalvare.values()) if (!d.inCorso) salvaChat(d.chat, d.wid); }
const stessoMsg = (a, b) => a.role === b.role && (a.content === b.content || (a.role === "assistant" && ((a.content || "").startsWith(b.content || "") || (b.content || "").startsWith(a.content || ""))));
function adottaChat(loc, srv) {
  const liberi = [...(loc.messages || [])];     // tengo i miei oggetti: una risposta in scrittura continua a crescere lì
  loc.messages = (srv.messages || []).map((m) => { const i = liberi.findIndex((x) => stessoMsg(x, m)); return i < 0 ? m : liberi.splice(i, 1)[0]; }).concat(liberi);
  loc.updated = Math.max(loc.updated || 0, srv.updated || 0); loc.rev = srv.rev;
}
// torni sull'app dopo aver scritto dal Mac: ricarico le chat del workspace aperto
async function ricaricaChats() {
  const wid = A.wid;
  if (!wid || A.busy || !A.sec) return;
  const srv = await api("GET", `workspace/${wid}/chats`).catch(() => null);
  if (!srv || A.wid !== wid || A.busy) return;
  const mie = new Map(A.chats.map((c) => [c.id, c]));
  const daRimandare = [];
  A.chats = srv.map((s) => {
    const c = mie.get(s.id); if (!c) return s;
    if ((c.rev || 0) !== (s.rev || 0) || c.messages.length > (s.messages || []).length) {
      adottaChat(c, s);
      if (c.messages.length > (s.messages || []).length) daRimandare.push(c);   // qui ci sono messaggi che il Mac non ha
    }
    return c;
  })
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (A.chat && !A.chats.includes(A.chat)) A.chat = A.chats.find((c) => c.id === A.chat.id) || A.chat;
  daRimandare.forEach((c) => salvaChat(c, wid));
  if (A.tab === "chat") { if (A.chat) { disegnaThread(); } else disegnaTab(); }
}

// ================================================================ nota
async function disegnaNota() {
  const c = $("corpo");
  if (!A.nota) {
    c.innerHTML = `<div class="nota"><div class="sk-lines"><i></i><i></i><i></i><i></i></div></div>`;
    try { A.nota = await api("GET", `workspace/${A.wid}/nota`); } catch (e) { c.innerHTML = `<p class="vuoto">${esc(e.message)}</p>`; return; }
    if (A.tab !== "nota") return;
  }
  if (A.notaEdit) {
    c.innerHTML = `<div class="nota edit"><textarea id="notaTxt" spellcheck="true">${esc(A.nota.testo)}</textarea>
      <div class="row2 sticky"><button class="btn" id="nAnn">Annulla</button><button class="btn main" id="nSalva">${svg("ok")}Salva</button></div></div>`;
    $("nAnn").onclick = () => { A.notaEdit = false; disegnaNota(); };
    $("nSalva").onclick = async () => {
      try { A.nota = await api("PUT", `workspace/${A.wid}/nota`, { testo: $("notaTxt").value }); A.notaEdit = false; toast("Nota salvata · la precedente resta tra le versioni"); disegnaNota(); }
      catch (e) { toast(e.message, true); }
    };
    return;
  }
  c.innerHTML = `<div class="nota"><div class="nhead"><span>${svg("note")}aggiornata ${ago(A.nota.aggiornata)}</span><span class="nhead-b"><button class="btn sm" id="nReg">${svg("layers")}Registri</button><button class="btn sm" id="nEdit">${svg("edit")}Modifica</button></span></div>
    <article class="md carta" id="memCorpo">${A.nota.testo.trim() ? (A.mem?.agg === A.nota.aggiornata ? "" : renderMd(A.nota.testo)) : '<p class="vuoto">La nota è vuota. Scrivi in chat cosa ricordare («annota che…») e si riempie da sola.</p>'}</article></div>`;
  $("nEdit").onclick = () => { A.notaEdit = true; disegnaNota(); };
  $("nReg").onclick = () => registroSheet();
  if (A.nota.testo.trim()) memDisegna();
}
// le tre lenti sulla memoria (il codice che le disegna è più sotto, uguale a quello del Mac)
async function memDisegna() {
  const wid = A.wid, agg = A.nota.aggiornata;
  if (A.mem?.agg !== agg || A.mem.wid !== wid) {
    const d = await api("GET", `workspace/${wid}/memoria`).catch(() => null);
    if (!d || A.wid !== wid) return;
    A.mem = { agg, wid, d };
  }
  const dis = () => {
    const c = $("memCorpo"); if (!c || A.wid !== wid || A.tab !== "nota" || A.notaEdit || !A.mem.d.argomenti.length) return;
    c.classList.add("mem-carta");
    c.innerHTML = memHtml(A.mem.d, A.lente || "argomenti");
    memLega(c, { lente: (l) => { A.lente = l; dis(); $("corpo").scrollTop = 0; }, fatto: memFatto, cosa: memCosa });
  };
  dis();
}
const memChiama = (wid) => (m, pezzo, body) => api(m, `workspace/${wid}/${pezzo}`, body);
const memApri = {
  cosa: (id) => memCosa(id), fatto: (id) => memFatto(id), registro: () => registroSheet(),
  chiedi: (titolo, valore) => chiediTesto(titolo, valore),
  chat: (id) => {
    const c = A.chats.find((x) => x.id === id); if (!c) return toast("Quella chat non c'è più", true);
    closeSheet(); A.tab = "chat"; A.chat = c; history.pushState({ v: "chat" }, ""); schermoWs();
  },
  altrove: async (ws, id) => { closeSheet(); history.back(); setTimeout(async () => { await apriWs(ws, "nota"); memCosa(id); }, 350); },
};
async function memRicarica() { A.nota = null; A.mem = null; if (A.tab === "nota") await disegnaNota(); caricaAvvisi?.(); }
async function memFatto(id) {
  const wid = A.wid, s = sheet(`<div id="memFoglio"><div class="sk-lines"><i></i><i></i><i></i></div></div>`, "tall");
  let f; try { f = await api("GET", `workspace/${wid}/fatti/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, true); return closeSheet(); }
  const box = s.querySelector("#memFoglio"); if (!box) return;
  box.innerHTML = memFattoHtml(f);
  memFattoLega(box, f, memChiama(wid), async (nuovo) => { await memRicarica(); nuovo ? memFatto(nuovo) : closeSheet(); }, memApri);
}
async function memCosa(id) {
  const wid = A.wid, s = sheet(`<div id="memFoglio"><div class="sk-lines"><i></i><i></i><i></i></div></div>`, "tall");
  let c; try { c = await api("GET", `workspace/${wid}/cose/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, true); return closeSheet(); }
  const box = s.querySelector("#memFoglio"); if (!box) return;
  box.innerHTML = memCosaHtml(c, new Date().toLocaleDateString("sv"));
  memCosaLega(box, c, memChiama(wid), async () => { await memRicarica(); memCosa(c.id); }, memApri);
}


// ---------------------------------------------------------------- registri: le cose che si ripetono, coi conti fatti dal Mac
// La nota racconta, i registri contano: una serie per ogni cosa che si ripete (un sacco aperto, una pulizia, una lettura).
// Le righe arrivano da sole da appunti e chat; qui si guardano, si correggono e se ne aggiungono a mano.
const REG_TIPO = { scorta: "scorta", evento: "si ripete", misura: "misura" };
const REG_EVENTI = { scorta: ["aperto", "finito", "comprato"], evento: ["fatto"], misura: ["lettura"] };
const regData = (g) => new Date(g + "T12:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const regNum = (x, d = 2) => x == null ? "" : Number(x).toLocaleString("it-IT", { maximumFractionDigits: d });
function regBarre(s) {
  let dati;
  if (s.tipo === "scorta") dati = s.voci.filter((v) => v.evento === "aperto").map((v) => ({ n: v.giorni, e: v.data, vivo: v.in_corso, t: v.in_corso ? `in uso da ${v.giorni} g` : `durato ${v.giorni} g` }));
  else if (s.tipo === "evento") dati = s.voci.filter((v) => v.giorni).map((v) => ({ n: v.giorni, e: v.data, t: `${v.giorni} g dalla volta prima` }));
  else dati = s.voci.map((v) => ({ n: v.quantita, e: v.data, t: regNum(v.quantita) + (s.unita ? " " + s.unita : "") }));
  dati = dati.filter((d) => d.n != null).slice(-12);
  if (dati.length < 2) return "";
  const max = Math.max(...dati.map((d) => d.n), 1), giorno = (g) => new Date(g + "T12:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `<div class="reg-barre"><em>${s.tipo === "misura" ? esc(s.unita || "valori") : "giorni"}</em>${dati.map((d) => `<span class="${d.vivo ? "vivo" : ""}" title="${esc(regData(d.e) + " · " + d.t)}"><b>${regNum(d.n, 1)}</b><i style="height:${Math.max(8, Math.round(d.n / max * 100))}%"></i><small>${esc(giorno(d.e))}</small></span>`).join("")}</div>`;
}
function regRiga(s, v) {
  const u = s.unita ? " " + s.unita : "";
  const quanto = [v.quantita != null ? regNum(v.quantita) + u + (v.presunto_q ? "~" : "") : "", v.costo != null ? regNum(v.costo) + " €" + (v.presunto_c ? "~" : "") : ""].filter(Boolean).join(" · ");
  const esito = v.in_corso ? `in uso da ${v.giorni} g` : v.fino ? `${v.giorni} g${v.fino_presunto ? "~" : ""}${v.al_giorno ? ` · ${regNum(v.al_giorno)}${u}/g` : ""}` : s.tipo === "evento" && v.giorni ? `dopo ${v.giorni} g` : "";
  return `<button class="reg-r${v.in_corso ? " vivo" : ""}" data-v="${v.id}"><span class="d">${regData(v.data)}</span><span class="reg-ev ${v.evento}">${v.evento}</span><span class="q">${esc(quanto)}</span><span class="x">${esc(esito)}</span>${v.nota ? `<small>${esc(v.nota)}</small>` : ""}</button>`;
}
function regForm(s, v) {
  const oggi = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return `<form class="reg-f"><input type="date" name="data" value="${v ? v.data : oggi}" required>
    <select name="evento"${REG_EVENTI[s.tipo].length < 2 ? " hidden" : ""}>${REG_EVENTI[s.tipo].map((e) => `<option${v?.evento === e ? " selected" : ""}>${e}</option>`).join("")}</select>
    <input name="quantita" inputmode="decimal" autocomplete="off" placeholder="${s.tipo === "misura" ? "valore" : "quantità"}${s.unita ? " (" + esc(s.unita) + ")" : ""}" value="${v && v.quantita != null && !v.presunto_q ? regNum(v.quantita, 3) : ""}">
    <input name="costo" inputmode="decimal" autocomplete="off" placeholder="costo (€)" value="${v && v.costo != null && !v.presunto_c ? regNum(v.costo, 2) : ""}"${s.tipo === "misura" ? " hidden" : ""}>
    <input name="nota" autocomplete="off" placeholder="nota (facoltativa)" value="${esc(v?.nota || "")}">
    <div class="reg-fb">${v ? `<button type="button" class="via" data-via>${svg("trash")}Togli</button>` : ""}<span></span><button type="button" data-no>Annulla</button><button class="salva">${svg("ok")}Salva</button></div></form>`;
}
const regOggi = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
// un tocco per le cose di tutti i giorni: finito, aperto uno nuovo, rifatto. La data è oggi (si corregge toccando la riga)
function regRapidi(s) {
  const b = (ev, testo, forte) => `<button data-ora="${ev}" class="${forte ? "forte" : ""}">${svg(ev === "aperto" ? "plus" : "ok")}${testo}</button>`;
  if (s.tipo === "scorta") return `<div class="reg-az">${s.voci.some((v) => v.in_corso) ? b("finito", "Finito oggi", true) : ""}${b("aperto", "Aperto uno nuovo oggi")}</div>`;
  if (s.tipo === "evento") return `<div class="reg-az">${b("fatto", "Fatto oggi", true)}</div>`;
  return "";
}
function regHtml(d) {
  if (!d.serie.length) return `<div class="reg-vuoto">${svg("layers")}<b>${d.aggiorno ? "Leggo la nota e preparo i registri…" : "Ancora nessun registro"}</b>
    <p>Qui finiscono da sole le cose che si ripetono: un sacco aperto, un rabbocco, una lettura. Scrivile in un appunto o in chat («stamattina ho aperto un sacco di mangime») e MyMind tiene il conto: quanto dura, quanto consuma, quando finisce.</p></div>`;
  return (d.aggiorno ? `<p class="reg-attesa"><span class="waiting"><i></i><i></i><i></i></span>Rileggo la nota…</p>` : "") + d.serie.map((s) => `<section class="reg" data-s="${s.id}">
    <header><h4>${esc(s.nome)}</h4><span class="reg-tipo">${REG_TIPO[s.tipo]}${s.unita ? " · " + esc(s.unita) : ""}</span><button class="reg-piu" data-piu title="Aggiungi una riga a mano">${svg("plus")}</button></header>
    <div class="reg-riep">${s.riepilogo.map(([k, v]) => `<div class="${/verso/i.test(k) ? "forte" : ""}"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>
    ${regRapidi(s)}
    ${regBarre(s)}
    <div class="reg-righe">${[...s.voci].reverse().map((v) => regRiga(s, v)).join("")}</div>
  </section>`).join("") + `<p class="reg-nota">Tocca una riga per correggerla. Il segno ~ indica un valore abituale o una fine dedotta dall'apertura successiva.</p>`;
}
// chiama(metodo, pezzo, corpo) parla col Mac; ridisegna(dati) rifà la vista
function regLega(root, d, chiama, ridisegna) {
  root.querySelectorAll(".reg").forEach((sec) => {
    const s = d.serie.find((x) => x.id === sec.dataset.s);
    const apri = (v, riga) => {
      root.querySelector(".reg-f")?.remove(); root.querySelectorAll(".reg-r[hidden]").forEach((r) => r.hidden = false);
      const t = document.createElement("div"); t.innerHTML = regForm(s, v); const f = t.firstElementChild;
      if (v) { riga.hidden = true; riga.after(f); } else sec.querySelector(".reg-righe").prepend(f);
      f.querySelector("[data-no]").onclick = () => ridisegna(d);
      if (v) f.querySelector("[data-via]").onclick = async () => { try { ridisegna(await chiama("DELETE", "voce/" + v.id)); } catch (e) { toast(e.message, true); } };
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { ridisegna(await chiama("POST", "voce", { ...Object.fromEntries(new FormData(f)), serie: s.id, id: v?.id })); } catch (err) { toast(err.message, true); }
      };
      if (!v) f.querySelector("[name=quantita]").focus();
    };
    sec.querySelector("[data-piu]").onclick = () => apri(null);
    sec.querySelectorAll("[data-ora]").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { ridisegna(await chiama("POST", "voce", { serie: s.id, evento: b.dataset.ora, data: regOggi() })); toast(`${s.nome}: ${b.dataset.ora} oggi`); } catch (e) { toast(e.message, true); b.disabled = false; }
    });
    sec.querySelectorAll(".reg-r").forEach((r) => r.onclick = () => apri(s.voci.find((v) => v.id === r.dataset.v), r));
  });
}
// ================================================================ memoria: tre lenti sugli stessi fatti
// La memoria di un workspace sono fatti collegati (li tiene il Mac). Qui si guardano in tre modi: per argomento (com'è la
// nota), per cosa (tutto quello che riguarda l'incubatrice, il mangime…), per tempo (cosa è successo e cosa deve succedere).
// Toccando un fatto si vede da dove viene e cosa c'era prima. Questo pezzo è uguale sul Mac e sul telefono.
const MEM_TIPI = { dato: ["Dato", "file"], decisione: ["Decisione", "bulb"], evento: ["È successo", "history"], previsto: ["Previsto", "bell"],
  da_fare: ["Da fare", "ok"], manca: ["Manca un dato", "search"], misura: ["Misura", "layers"], testo: ["Testo", "note"] };
const MEM_DA = { chat: "chat", appunto: "edit", fonte: "file", mano: "edit", nota: "note", registro: "layers" };
const MEM_GENERI = { oggetto: "oggetto", scorta: "scorta", luogo: "luogo", persona: "persona", fornitore: "fornitore", attivita: "attività", animale: "animali", documento: "documento" };
const memInl = (t) => renderMd(t).trim().replace(/^<p>/, "").replace(/<\/p>$/, "");
const memGiorno = (g, corto) => new Date(g + "T12:00").toLocaleDateString("it-IT", corto ? { day: "numeric", month: "short" }
  : { weekday: "long", day: "numeric", month: "long", ...(g.slice(0, 4) !== String(new Date().getFullYear()) ? { year: "numeric" } : {}) });
const memQuando = (t) => t ? new Date(t * 1000).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const memAperto = (f) => f.stato === "vale" && !f.zitto && ["da_fare", "previsto", "manca"].includes(f.tipo);
function memRiga(r, oggi, conCose) {
  if (!r.id) return `<div class="mem-reg">${svg("layers")}${memInl(r.testo)}</div>`;
  if (r.testo.startsWith("|")) return `<div class="mem-tab md" data-f="${esc(r.id)}">${renderMd(r.testo)}</div>`;
  const segno = r.stato === "chiuso" ? svg("ok") : r.tipo === "da_fare" ? "" : ["previsto", "manca", "decisione"].includes(r.tipo) ? svg(MEM_TIPI[r.tipo][1]) : "";
  const data = r.data && ["previsto", "da_fare"].includes(r.tipo) && r.stato === "vale" ? `<em class="mem-d${r.data < oggi ? " tardi" : r.data === oggi ? " oggi" : ""}">${memGiorno(r.data, true)}</em>` : "";
  const cose = conCose && r.cose?.length ? `<span class="mem-chi">${r.cose.map((c) => esc(c.nome)).join(" · ")}</span>` : "";
  return `<button class="mem-r t-${r.tipo}${r.zitto ? " zitto" : ""}${r.stato === "chiuso" ? " chiuso" : ""}${r.registro ? " reg" : ""}" data-f="${esc(r.id)}" style="--rie:${r.rientro || 0}">
    <i class="mem-s">${segno}</i><span class="mem-t">${cose}${memInl(r.testo)}</span>${data}</button>`;
}
function memHtml(d, lente) {
  const n = d.conta, aperti = d.argomenti.reduce((s, a) => s + a.righe.filter((r) => r.id && memAperto(r)).length, 0);
  let corpo = "";
  if (lente === "cose") {
    corpo = d.cose.length ? `<div class="mem-cose">${d.cose.map((c) => `<button class="mem-cosa" data-cosa="${esc(c.id)}">
      <b>${esc(c.nome)}</b><small>${[MEM_GENERI[c.genere], c.serie ? "tiene un registro" : "", `${c.fatti} ${c.fatti === 1 ? "fatto" : "fatti"}`].filter(Boolean).join(" · ")}</small>
      ${c.aperti ? `<i>${c.aperti}</i>` : ""}</button>`).join("")}</div>`
      : `<p class="mem-vuoto">Ancora nessuna cosa: nascono da sole quando la memoria parla più volte dello stesso oggetto, luogo o persona.</p>`;
  } else if (lente === "tempo") {
    const poi = d.tempo.filter((f) => f.giorno > d.oggi && f.stato === "vale").reverse(), prima = d.tempo.filter((f) => !(f.giorno > d.oggi && f.stato === "vale"));
    const gruppi = (lista) => { const g = []; for (const f of lista) { if (!g.length || g[g.length - 1][0] !== f.giorno) g.push([f.giorno, []]); g[g.length - 1][1].push(f); } return g; };
    const blocco = (lista) => gruppi(lista).map(([g, fs]) => `<div class="mem-g${g === d.oggi ? " oggi" : ""}"><h4>${g === d.oggi ? "Oggi · " : ""}${memGiorno(g)}</h4>${fs.map((f) => memRiga(f, d.oggi, true)).join("")}</div>`).join("");
    corpo = (poi.length ? `<div class="mem-lab">In arrivo</div>${blocco(poi)}` : "") + (prima.length ? `<div class="mem-lab">${poi.length ? "Fin qui" : "Nel tempo"}</div>${blocco(prima)}` : "")
      || `<p class="mem-vuoto">Qui compaiono i fatti che hanno un giorno: quello che è successo e quello che deve succedere.</p>`;
  } else {
    corpo = d.argomenti.map((a) => `<section class="mem-arg"><h3>${esc(a.nome)}</h3>${a.righe.map((r) => memRiga(r, d.oggi)).join("")}</section>`).join("")
      || `<p class="mem-vuoto">La memoria è vuota. Scrivi in chat cosa ricordare, o usa «Annota al volo»: si riempie da sola.</p>`;
  }
  return `<div class="mem" data-lente="${lente}"><div class="mem-lenti">
      <button data-lente="argomenti" class="${lente === "argomenti" ? "on" : ""}">${svg("note")}Argomenti</button>
      <button data-lente="cose" class="${lente === "cose" ? "on" : ""}">${svg("layers")}Cose<b>${n.cose}</b></button>
      <button data-lente="tempo" class="${lente === "tempo" ? "on" : ""}">${svg("history")}Tempo</button></div>
    <div class="mem-conta">${n.fatti} fatti${aperti ? ` · <b>${aperti}</b> ${aperti === 1 ? "aspetta te" : "aspettano te"}` : ""}${n.superati ? ` · ${n.superati} ${n.superati === 1 ? "cambiato" : "cambiati"} nel tempo` : ""}</div>
    ${corpo}</div>`;
}
function memLega(root, { lente, fatto, cosa }) {
  root.querySelectorAll("[data-lente]").forEach((b) => { if (b.tagName === "BUTTON") b.onclick = () => lente(b.dataset.lente); });
  root.querySelectorAll("[data-f]").forEach((b) => b.onclick = (e) => { if (!e.target.closest("a")) fatto(b.dataset.f); });
  root.querySelectorAll("[data-cosa]").forEach((b) => b.onclick = () => cosa(b.dataset.cosa));
}
// ---- un fatto: cos'è, da dove viene, cosa c'era prima, cosa ci puoi fare
function memOrigine(o) {
  return `<div class="mem-o"><i>${svg(MEM_DA[o.tipo] || "file")}</i><div><b>${esc(o.titolo)}${o.ruolo === "chiuso" ? " · chiuso qui" : o.ruolo === "ripetuto" ? " · ridetto qui" : ""}</b>
    ${o.quando && o.tipo !== "nota" ? `<small>${memQuando(o.quando)}</small>` : ""}${o.testo ? `<q>${esc(o.testo)}</q>` : ""}
    ${o.tipo === "chat" && o.rif && !/non c'è più/.test(o.titolo) ? `<button class="mem-link" data-chat="${esc(o.rif)}" data-pos="${o.pos ?? ""}">Apri la chat ${svg("right")}</button>` : ""}</div></div>`;
}
function memFattoHtml(f) {
  const [nome, icona] = MEM_TIPI[f.tipo] || MEM_TIPI.dato, vale = f.stato === "vale";
  const az = [];
  if (vale && f.tipo === "da_fare") az.push(["chiudi", "ok", "Fatto", "main"], ["lascia", "x", "Non la faccio"]);
  if (vale && f.tipo === "previsto") az.push(["chiudi", "ok", "È successo", "main"]);
  if (vale && f.tipo === "manca") az.push(["chiudi", "ok", "Non manca più", "main"]);
  if (vale && ["previsto", "manca"].includes(f.tipo)) az.push(f.zitto ? ["parla", "bell", "Ricordamelo"] : ["zitto", "bell", "Non ricordarmelo"]);
  if (!vale) az.push(["riapri", "redo", "Riapri", "main"]);
  az.push(["correggi", "edit", "Correggi"]);
  if (vale) az.push(["togli", "trash", "Togli", "rosso"]);
  return `<div class="mem-f">
    <div class="mem-f-su"><span class="mem-tipo t-${f.tipo}">${svg(icona)}${nome}</span>${f.data ? `<span class="mem-quando">${svg("bell")}${memGiorno(f.data)}</span>` : ""}
      ${!vale ? `<span class="mem-quando">${f.stato === "chiuso" ? (f.esito === "lasciato" ? "lasciata perdere" : "fatto") : f.stato}</span>` : f.zitto ? `<span class="mem-quando">non te lo ricordo</span>` : ""}
      ${f.fiducia === "dedotto" ? `<span class="mem-quando" title="È una stima o un valore generale dell'assistente, non una cosa detta da te">dedotto</span>` : f.fiducia === "fonte" ? `<span class="mem-quando">da una fonte</span>` : ""}</div>
    <div class="mem-f-t md" id="memTesto">${f.testo.startsWith("|") ? renderMd(f.testo) : memInl(f.testo)}</div>
    <div class="mem-f-dove">${esc(f.argomento)}${f.sotto_di ? ` › ${esc(f.sotto_di.replace(/\*\*/g, "").slice(0, 60))}` : ""}</div>
    ${f.cose.length ? `<div class="mem-f-cose">${f.cose.map((c) => `<button data-cosa="${esc(c.id)}">${svg("layers")}${esc(c.nome)}</button>`).join("")}</div>` : ""}
    <div class="mem-az">${az.map(([k, ic, t, cl]) => `<button class="btn ${cl === "main" ? "main primary" : cl === "rosso" ? "mem-rosso" : ""}" data-fai="${k}">${svg(ic)}${t}</button>`).join("")}</div>
    <div class="mem-lab">Da dove viene</div>
    ${f.origini.length ? f.origini.map(memOrigine).join("") : `<p class="mem-vuoto">Non lo so: non è rimasta traccia.</p>`}
    ${f.storia.length ? `<div class="mem-lab">Prima era</div>${f.storia.map((v) => `<div class="mem-prima"><span class="md">${memInl(v.testo)}</span>
      <small>${v.origini[0] ? esc(v.origini[0].titolo) + (v.origini[0].quando && v.origini[0].tipo !== "nota" ? " · " + memQuando(v.origini[0].quando) : "") : memQuando(v.detto)}</small></div>`).join("")}` : ""}
  </div>`;
}
// chiama(metodo, pezzo, corpo) parla col workspace; dopo(idNuovo|null) ridisegna; apri = { cosa(id), chat(id, pos) }
function memFattoLega(root, f, chiama, dopo, apri) {
  root.querySelectorAll("[data-cosa]").forEach((b) => b.onclick = () => apri.cosa(b.dataset.cosa));
  root.querySelectorAll("[data-chat]").forEach((b) => b.onclick = () => apri.chat(b.dataset.chat, b.dataset.pos === "" ? null : +b.dataset.pos));
  const fai = async (corpo, detto) => { try { const r = await chiama("POST", "fatti/" + f.id, corpo); toast(detto); dopo(corpo.fai === "togli" ? null : r.id); } catch (e) { toast(e.message, true); } };
  root.querySelectorAll("[data-fai]").forEach((b) => b.onclick = () => {
    const k = b.dataset.fai;
    if (k !== "correggi") return fai({ fai: k }, { chiudi: "Segnato", lascia: "Lasciata perdere", zitto: "Non te lo ricordo più", parla: "Te lo ricordo", riapri: "Riaperto", togli: "Tolto: resta nella storia" }[k]);
    const box = root.querySelector("#memTesto");
    box.outerHTML = `<div class="mem-ed"><textarea id="memEd" rows="4">${esc(f.testo)}</textarea>
      <div class="mem-ed-r"><label>Tipo<select id="memTipo">${Object.entries(MEM_TIPI).map(([k2, v]) => `<option value="${k2}"${k2 === f.tipo ? " selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <label>Giorno<input type="date" id="memData" value="${f.data || ""}"></label>
        <label>Argomento<select id="memArg">${f.argomenti.map((a) => `<option${a === f.argomento ? " selected" : ""}>${esc(a)}</option>`).join("")}</select></label></div>
      <div class="mem-az"><button class="btn" data-no>Annulla</button><button class="btn main primary" data-si>${svg("ok")}Salva</button></div>
      <small class="mem-nota">Se cambi il testo, quello di prima resta nella storia del fatto.</small></div>`;
    root.querySelector(".mem-az:not(.mem-ed .mem-az)")?.remove();
    const ed = root.querySelector("#memEd"); ed.focus();
    root.querySelector("[data-no]").onclick = () => dopo(f.id);
    root.querySelector("[data-si]").onclick = () => fai({ testo: ed.value, tipo: root.querySelector("#memTipo").value, data: root.querySelector("#memData").value || null, argomento: root.querySelector("#memArg").value }, "Corretto");
  });
}
// ---- una cosa: tutto quello che la riguarda, in un posto solo
function memCosaHtml(c, oggi) {
  const gruppo = (titolo, lista) => lista.length ? `<div class="mem-lab">${titolo}<b>${lista.length}</b></div>${lista.map((f) => memRiga(f, oggi)).join("")}` : "";
  const vale = c.fatti.filter((f) => f.stato === "vale"), giorno = (f) => f.data || "";
  const aperti = vale.filter(memAperto), storia = c.fatti.filter((f) => !memAperto(f) && (["evento", "misura"].includes(f.tipo) || f.stato === "chiuso")).sort((a, b) => giorno(b).localeCompare(giorno(a)));
  const so = vale.filter((f) => !aperti.includes(f) && !storia.includes(f));
  return `<div class="mem-c"><div class="mem-c-su"><h3>${esc(c.nome)}</h3><button class="btn sm" data-rin>${svg("edit")}Rinomina</button></div>
    <div class="mem-f-dove">${[MEM_GENERI[c.genere], c.sopra ? "parte di " + c.sopra : "", c.alias.length ? "detta anche " + c.alias.join(", ") : ""].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div>
    ${c.parti?.length ? `<div class="mem-f-cose">${c.parti.map((p) => `<button data-cosa="${esc(p.id)}">${svg("layers")}${esc(p.nome)}</button>`).join("")}</div>` : ""}
    ${c.registro?.riepilogo?.length ? `<div class="mem-conti">${c.registro.riepilogo.slice(0, 4).map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div><button class="mem-link" data-registro>Apri il registro ${svg("right")}</button>` : ""}
    ${c.altrove?.length ? `<div class="mem-altrove">${c.altrove.map((a) => `<button data-ws="${esc(a.ws)}" data-altra="${esc(a.id)}" style="--c:${esc(a.colore || "#999")}"><i></i>Se ne parla anche in «${esc(a.nome)}» · ${a.fatti} ${a.fatti === 1 ? "fatto" : "fatti"}${svg("right")}</button>`).join("")}</div>` : ""}
    ${gruppo("Aspetta te", aperti)}${gruppo("Quello che so", so)}${gruppo("Storia", storia)}
    ${c.tutte?.length ? `<details class="mem-unisci"><summary>È la stessa cosa di un'altra?</summary><div><select id="memAltra"><option value="">scegli…</option>${c.tutte.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("")}</select>
      <button class="btn sm" data-unisci>Unisci</button></div><small class="mem-nota">I fatti dell'altra passano a questa, e il suo nome resta come secondo nome.</small></details>` : ""}</div>`;
}
function memCosaLega(root, c, chiama, dopo, apri) {
  root.querySelectorAll("[data-f]").forEach((b) => b.onclick = (e) => { if (!e.target.closest("a")) apri.fatto(b.dataset.f); });
  root.querySelectorAll("[data-cosa]").forEach((b) => b.onclick = () => apri.cosa(b.dataset.cosa));
  root.querySelectorAll("[data-altra]").forEach((b) => b.onclick = () => apri.altrove(b.dataset.ws, b.dataset.altra));
  const reg = root.querySelector("[data-registro]"); if (reg) reg.onclick = () => apri.registro();
  root.querySelector("[data-rin]").onclick = async () => {
    const nome = await apri.chiedi("Come si chiama?", c.nome); if (!nome || nome === c.nome) return dopo();
    try { await chiama("POST", "cose/" + c.id, { nome }); toast("Rinominata"); } catch (e) { toast(e.message, true); } dopo();
  };
  const un = root.querySelector("[data-unisci]");
  if (un) un.onclick = async () => {
    const altra = root.querySelector("#memAltra").value; if (!altra) return;
    try { await chiama("POST", "cose/" + c.id, { unisci: altra }); toast("Unite"); } catch (e) { toast(e.message, true); } dopo();
  };
}

async function registroSheet() {
  const wid = A.wid, chiama = (m, pezzo, body) => api(m, `workspace/${wid}/registro` + (pezzo ? "/" + pezzo : ""), body);
  const s = sheet(`<div class="registri"><h3 class="sh">${svg("layers")}Registri<small>i conti li fa il Mac</small></h3><div id="regCorpo"><div class="sk-lines"><i></i><i></i><i></i><i></i></div></div></div>`, "tall");
  const dis = (d) => {
    const c = s.querySelector("#regCorpo"); if (!c) return;
    c.innerHTML = regHtml(d) + `<button class="btn" id="regRil">${svg("redo")}Rileggi dalla nota</button>`;
    regLega(c, d, chiama, dis);
    c.querySelector("#regRil").onclick = async () => { try { dis(await chiama("POST", "rileggi", {})); } catch (e) { toast(e.message, true); } };
    if (d.aggiorno) setTimeout(async () => { if (s.querySelector("#regCorpo") && !s.querySelector(".reg-f")) { try { dis(await chiama("GET")); } catch {} } }, 4000);
  };
  try { dis(await chiama("GET")); } catch (e) { const c = s.querySelector("#regCorpo"); if (c) c.innerHTML = `<p class="vuoto">${esc(e.message)}</p>`; }
}

// ================================================================ fonti
async function caricaFonti() {
  const wid = A.wid;
  try { const f = await api("GET", `workspace/${wid}/fonti`); if (A.wid !== wid) return; A.fonti = f; } catch { return; }
  if ($("sottoWs")) $("sottoWs").textContent = `${A.fonti.length} fonti`;
  if (A.tab === "fonti") disegnaListaFonti();
  if (A.fonti.some((f) => LAVORA.includes(f.stato))) setTimeout(() => A.wid === wid && A.tab === "fonti" && caricaFonti(), 4000);
}
function disegnaFonti() {
  $("corpo").innerHTML = `<div class="fonti">
    <div class="fbar"><label class="search">${svg("search")}<input id="fq" placeholder="Cerca per nome" value="${esc(A.cerca)}" autocomplete="off"></label></div>
    <div class="chipsrow">${[["tutte", "Tutte"], ["foto", "Foto"], ["pdf", "PDF"], ["documento", "Documenti"], ["testo", "Testi"]].map(([k, l]) => `<button data-f="${k}" class="${A.filtro === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="list" id="flist"></div>
    <div class="addbar"><button class="btn main" id="scatta">${svg("image")}Scatta</button><button class="btn" id="aggiungi">${svg("upload")}Foto o PDF</button></div>
    <input type="file" id="fcam" accept="image/*" capture="environment" hidden><input type="file" id="ffile" accept="image/*,application/pdf" multiple hidden></div>`;
  $("fq").oninput = () => { A.cerca = $("fq").value; disegnaListaFonti(); };
  $("corpo").querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { A.filtro = b.dataset.f; $("corpo").querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); disegnaListaFonti(); });
  $("scatta").onclick = () => $("fcam").click();
  $("aggiungi").onclick = () => $("ffile").click();
  $("fcam").onchange = () => manda($("fcam").files);
  $("ffile").onchange = () => manda($("ffile").files);
  disegnaListaFonti();
}
function disegnaListaFonti() {
  const el = $("flist"); if (!el) return;
  const q = A.cerca.trim().toLowerCase();
  const fs = A.fonti.filter((f) => (A.filtro === "tutte" || f.tipo === A.filtro) && (!q || f.nome.toLowerCase().includes(q)));
  el.innerHTML = fs.length ? fs.map((f) => `<button class="li f" data-fid="${esc(f.id)}"><span class="th">${f.miniatura ? `<img data-src="workspace/${esc(A.wid)}/${esc(f.miniatura)}" alt="">` : svg(TIPO_IC[f.tipo] || "file")}</span>
      <span class="in"><b>${esc(f.nome)}</b><small>${LAVORA.includes(f.stato) ? `<em class="lav">${esc(f.stato)}…</em>` : f.stato === "errore" ? '<em class="bad">non letta</em>' : esc(f.tipo)}${f.size ? ` · ${sizeTxt(f.size)}` : ""} · ${ago(f.aggiunta)}</small></span></button>`).join("")
    : `<p class="vuoto">${A.fonti.length ? "Nessuna fonte con questo filtro." : "Ancora nessuna fonte. Scatta una foto o manda un PDF: arriva sul Mac e viene letta e catalogata."}</p>`;
  el.querySelectorAll("[data-fid]").forEach((b) => b.onclick = () => apriFonte(A.fonti.find((f) => f.id === b.dataset.fid), A.wid));
  caricaImmagini(el);
}
async function manda(files) {
  const lista = [...files]; if (!lista.length) return;
  for (const f of lista) {
    const t = document.createElement("div"); t.className = "toast up"; t.innerHTML = `<span class="spin"></span>Mando «${esc(f.name)}»…`; $("toasts").appendChild(t);
    try {
      const foto = f.type.startsWith("image/");
      const dati = foto ? await toJpeg(f, 2400) : null;
      const corpo = new Uint8Array(await (foto ? dati.blob : f).arrayBuffer());
      const nome = foto ? f.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg") : f.name;
      await api("POST", `workspace/${A.wid}/carica?nome=${encodeURIComponent(nome)}`, null, { corpo, ct: f.type || "application/octet-stream", attesa: 180e3 });
      t.innerHTML = `${svg("ok")}Arrivata: la leggo e la catalogo`; t.className = "toast";
    } catch (e) { t.textContent = "Non inviata: " + e.message; t.className = "toast bad"; }
    setTimeout(() => t.remove(), 3500);
  }
  caricaFonti();
}
async function apriFonte(f, wid) {
  if (!f) return;
  const base = `workspace/${wid}/fonti/${f.id}`;
  const s = sheet(`<div class="fsheet"><div class="fprev" id="fprev"><span class="spin"></span></div>
    <h3 class="sh">${svg(TIPO_IC[f.tipo] || "file")}<span id="fnome">${esc(f.nome)}</span></h3>
    ${f.stato && f.stato !== "pronta" ? `<p class="note">stato: ${esc(f.stato)}</p>` : ""}
    <div class="fbtns"><button class="btn main" id="fChiedi">${svg("chat")}Chiedi in chat</button><button class="btn" id="fApri">${svg("open")}Apri</button>
      <button class="btn" id="fRin">${svg("edit")}Rinomina</button><button class="btn danger-t" id="fVia">${svg("trash")}Togli</button></div></div>`, "tall");
  const prev = s.querySelector("#fprev");
  if (f.tipo === "foto") {
    Tunnel.blob(`${base}/file`).then((b) => { prev.innerHTML = `<img src="${URL.createObjectURL(b)}" alt="">`; prev.querySelector("img").onclick = (e) => zoom(e.target.src); }).catch((e) => prev.textContent = e.message);
  } else {
    api("GET", `${base}/testo`).then((pezzi) => {
      const t = pezzi.map((p) => p.testo).join("\n\n");
      prev.innerHTML = `<div class="ftxt">${t ? esc(t.slice(0, 6000)) + (t.length > 6000 ? "\n…" : "") : '<span class="vuoto">Nessun testo letto.</span>'}</div>`;
    }).catch((e) => prev.textContent = e.message);
  }
  s.querySelector("#fChiedi").onclick = () => {
    closeSheet();
    const go = () => {
      A.pins.push({ fonte: f.id, nome: f.nome, tipo: f.tipo }); A.tab = "chat"; A.chat = null; schermoWs();
      const inp = $("input"); if (inp) { inp.value = `@${f.nome} `; autosize(); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }   // il segnaposto, e scrivi intorno
    };
    if (wid !== A.wid) apriWs(wid).then(go); else go();
  };
  s.querySelector("#fApri").onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = `<span class="spin"></span>Scarico…`;
    try {
      const blob = await Tunnel.blob(`${base}/file`), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = f.file || f.nome; document.body.appendChild(a); a.click(); a.remove();
    } catch (err) { toast(err.message, true); }
    b.disabled = false; b.innerHTML = `${svg("open")}Apri`;
  };
  s.querySelector("#fRin").onclick = async () => {
    closeSheet();
    const nuovo = await chiediTesto("Nuovo nome", f.nome.replace(/\.[^.]+$/, ""), "Rinomina");
    if (!nuovo) return;
    try { await api("PATCH", base, { nome: nuovo.trim() }); toast("Rinominata"); closeSheet(); caricaFonti(); } catch (err) { toast(err.message, true); }
  };
  s.querySelector("#fVia").onclick = async () => {
    closeSheet();
    if (!await ask(`Togliere «${f.nome}» dal workspace? Il file finisce in _rimosse sul Mac, da dove si recupera.`, "Togli", true)) return;
    try { await api("DELETE", base); toast("Tolta"); caricaFonti(); } catch (err) { toast(err.message, true); }
  };
}

// ================================================================ indietro di Android, avvio
addEventListener("popstate", (e) => {
  if (popAtteso) {                                     // è il ritorno chiesto da closeSheet, non il tasto Indietro
    popAtteso = false;
    if ($("sheet").classList.contains("open")) history.pushState({ sheet: 1 }, "");   // nel frattempo se n'è aperto un altro
    return;
  }
  if ($("sheet").classList.contains("open")) return closeSheet(true);
  if (!A.sec) return;
  if (A.busy && A.chat) { history.pushState({ v: "chat" }, ""); return toast("Sta rispondendo: aspetta o premi ■"); }
  const v = e.state?.v;
  if (A.chat && v !== "chat") {
    A.chat = null;
    if (v === "ws") {                                       // un passo solo, dalla chat al workspace
      if (A.tab === "chat") { disegnaTab(); return; }       // sulla scheda Chat: torna all'elenco
      history.back(); return;                               // su Nota o Fonti la chat non si vede: prosegue fino alla home
    }
  }
  if (A.wid && v !== "ws" && v !== "chat") { casa(); carica(); }
});
function avvio() {
  const nuovo = leggiAbbinamento();
  if (nuovo) return creaPin(nuovo);
  // scorciatoia «Annota» dall'icona dell'app: si apre già sul foglio, senza PIN
  const vuoleAnnotare = new URLSearchParams(location.search).has("annota");
  if (vuoleAnnotare) history.replaceState(null, "", location.pathname);
  if (Cassa.c()) { sblocca(); if (vuoleAnnotare && Busta.pronta()) annotaSheet(); return; }
  nessunAbbinamento();
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
avvio();
controllaVersione();
