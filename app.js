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
const oggi = () => new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
function applicaTema() {
  const scuro = pref.tema === "dark" || (pref.tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = scuro ? "dark" : "light";
}
applicaTema(); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applicaTema);

// ================================================================ foglio dal basso (scelte, conferme, anteprime)
function sheet(html, cls = "") {
  $("sheet").className = "open " + cls; $("sheet").innerHTML = `<div class="grip"></div>${html}`;
  $("sheet-bg").className = "open";
  $("sheet-bg").onclick = closeSheet;
  history.pushState({ sheet: 1 }, "");
  return $("sheet");
}
function closeSheet(fromPop) {
  if (!$("sheet").classList.contains("open")) return;
  $("sheet").className = ""; $("sheet-bg").className = "";
  setTimeout(() => { if (!$("sheet").classList.contains("open")) $("sheet").innerHTML = ""; }, 260);
  if (fromPop !== true && history.state?.sheet) history.back();
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
const VERSIONE = "1.4";
let nuovaVersione = null;
async function controllaVersione() {
  if (location.protocol !== "https:" && !/^localhost$|^127\./.test(location.hostname)) return;
  try {
    const r = await fetch(`versione.json?t=${Date.now()}`, { cache: "no-store" });
    const v = r.ok && (await r.json()).v;
    if (!v || v === VERSIONE) return;
    nuovaVersione = v;
    if (!A.sec && sessionStorage.getItem("mmt-agg") !== v) return aggiorna();
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
  el.onclick = nuovaVersione ? () => { if (!A.busy || confirm("Sta ancora rispondendo: aggiorno lo stesso?")) aggiorna(); } : null;
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
        await entra(segreto);
        toast("Telefono abbinato");
      } });
    } });
}
function sblocca() {
  const c = Cassa.c();
  pinPad({ titolo: "MyMind", sotto: `${esc(c?.nome || "Telefono")} · inserisci il PIN`, onPin: async (p) => entra(await Cassa.apri(p)),
    extra: `<button class="link" id="dimentica">Ho dimenticato il PIN</button>` });
  $("dimentica").onclick = async () => {
    if (await ask("Senza PIN la chiave non si recupera: cancello l'abbinamento e lo rifai dal Mac (Impostazioni → Telefono, ovunque).", "Cancella", true)) { Cassa.cancella(); avvio(); }
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
async function carica() {
  try {
    const [wss, srv, modelli] = await Promise.all([api("GET", "workspace"), api("GET", "impostazioni").catch(() => ({})), api("GET", "openrouter/modelli").catch(() => [])]);
    A.wss = wss.sort((a, b) => (b.nota_agg || b.creato || 0) - (a.nota_agg || a.creato || 0)); A.srv = srv; A.modelli = modelli; A.macOk = Date.now();
    for (const id of Object.keys(SPECIALI)) api("GET", `workspace/${id}`).then((m) => { if (m.modello) SPECIALI[id].modello = m.modello; }).catch(() => {});
  } catch (e) { A.macOk = 0; A.macErr = e.message; }
  if (!A.wid) casa(); else dipingiStato();
}
function dipingiStato() {
  const el = $("stato"); if (!el) return;
  const s = A.statoTunnel;
  const [cls, txt] = s !== "collegato" ? ["off", s === "collego" ? "collego…" : "fuori linea"]
    : A.macOk ? ["on", "Mac in linea"] : A.macOk === 0 ? ["bad", "il Mac non risponde"] : ["off", "chiedo al Mac…"];
  el.className = "stato " + cls; el.innerHTML = `<i></i>${txt}`;
}
function blocca() {
  if (nuovaVersione) return aggiorna();      // si richiudeva comunque: è il momento giusto per la versione nuova
  Tunnel.ferma(); A.sec = null; A.chat = null; A.wid = null;
  blobs.forEach((u) => URL.revokeObjectURL(u)); blobs.clear();
  sblocca();
}
// dopo 5 minuti in sottofondo l'app si richiude: chi prende il telefono sbloccato non trova MyMind aperto
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { A.nascosto = Date.now(); return; }
  if (A.sec && A.nascosto && Date.now() - A.nascosto > 5 * 60e3 && !A.busy) blocca();
  controllaVersione();
});

// ================================================================ casa: i workspace
function saluto() { const h = new Date().getHours(); return h < 5 ? "Buonanotte" : h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera"; }
function tile(w) { return `<span class="tile" style="--c:${esc(w.colore)}">${svg(SPECIALI[w.id] ? w.icona : "ws_" + w.icona)}</span>`; }
function casa() {
  A.wid = null; A.chat = null; tinta("#c15f3c");
  const err = A.macOk === 0 ? `<div class="banner bad">${svg("power")}<div><b>Il Mac non risponde.</b> ${esc(A.macErr || "")} Deve essere acceso, sveglio e con MyMind avviato.<button class="btn sm" id="riprova">Riprova</button></div></div>` : "";
  $("app").innerHTML = `<div class="home">
    <header class="top"><div class="brand">${LOGO}<b>MyMind</b>${versioneHtml()}</div><span id="stato" class="stato"></span><button class="ib" id="menu">${svg("dots")}</button></header>
    <section class="hero"><h1>${saluto()}</h1><p>${new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
      <form class="askall" id="askall"><span>${svg("layers")}</span><input id="askq" placeholder="Chiedi a tutti i workspace…" enterkeyhint="send" autocomplete="off"><button class="ib main" aria-label="Chiedi">${svg("up")}</button></form></section>
    ${err}
    <div class="lab">I tuoi workspace</div>
    <div class="grid">${A.wss.length ? A.wss.map((w) => `<button class="card" data-ws="${esc(w.id)}" style="--c:${esc(w.colore)}">${tile(w)}<b>${esc(w.nome)}</b><small>${w.fonti || 0} fonti${w.nota_agg ? ` · nota ${ago(w.nota_agg)}` : ""}</small></button>`).join("")
      : A.macOk ? '<p class="vuoto">Nessun workspace: crealo dal Mac.</p>' : '<div class="card sk"></div><div class="card sk"></div><div class="card sk"></div><div class="card sk"></div>'}</div>
    <div class="specials">${Object.values(SPECIALI).map((w) => `<button class="row-ws" data-ws="${w.id}">${tile(w)}<span><b>${w.nome}</b><small>${w.sotto}</small></span>${svg("right")}</button>`).join("")}</div>
    <footer class="foot-home">${svg("key")}Cifrato dal telefono al Mac · ${esc(A.sec?.nome || "")}</footer></div>`;
  dipingiStato();
  $("app").querySelectorAll("[data-ws]").forEach((b) => b.onclick = () => apriWs(b.dataset.ws));
  $("askall").onsubmit = (e) => { e.preventDefault(); const q = $("askq").value.trim(); if (!q) return; apriWs("_tutti").then(() => { $("input").value = q; invia(); }); };
  $("menu").onclick = menu;
  if ($("riprova")) $("riprova").onclick = () => { A.macOk = null; casa(); carica(); };
}
function menu() {
  const s = sheet(`<div class="menu">
    <button data-m="tema">${svg(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}<span><b>Tema</b><small>${{ auto: "Come il telefono", light: "Chiaro", dark: "Scuro" }[pref.tema]}</small></span></button>
    <button data-m="blocca">${svg("key")}<span><b>Blocca adesso</b><small>Al prossimo avvio serve il PIN</small></span></button>
    <button data-m="pin">${svg("edit")}<span><b>Cambia PIN</b><small>La chiave resta la stessa</small></span></button>
    <button data-m="via" class="danger">${svg("trash")}<span><b>Dimentica questo telefono</b><small>Cancella la chiave da qui. Sul Mac revocalo in Impostazioni.</small></span></button></div>`);
  s.querySelector('[data-m="tema"]').onclick = () => { pref.tema = { auto: "light", light: "dark", dark: "auto" }[pref.tema]; savePref(); applicaTema(); closeSheet(); };
  s.querySelector('[data-m="blocca"]').onclick = () => { closeSheet(); blocca(); };
  s.querySelector('[data-m="pin"]').onclick = () => { closeSheet(); const sec = A.sec; pinPad({ titolo: "Nuovo PIN", sotto: "Sei cifre.", onPin: async (p) => { await Cassa.chiudi(p, sec); toast("PIN cambiato"); casa(); } }); };
  s.querySelector('[data-m="via"]').onclick = async () => { closeSheet(); if (await ask("Cancello la chiave da questo telefono? Per tornare a usarlo serve un nuovo abbinamento dal Mac.", "Dimentica", true)) { Cassa.cancella(); Tunnel.ferma(); A.sec = null; nessunAbbinamento(); } };
}

// ================================================================ un workspace
async function apriWs(id, tab = "chat") {
  A.wid = id; A.tab = isSpecial() && tab !== "chat" ? "chat" : tab; A.chat = null; A.pins = []; A.foto = []; A.nota = null; A.fonti = []; A.notaEdit = false;
  history.pushState({ v: "ws" }, "");
  tinta(ws().colore);
  schermoWs();
  const wid = id;
  const [chats] = await Promise.all([api("GET", `workspace/${id}/chats`).catch(() => [])]);
  if (A.wid !== wid) return;
  A.chats = (chats || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (A.tab === "chat" && !A.chat) disegnaTab();
  if (!isSpecial()) caricaFonti();
}
function schermoWs() {
  const w = ws();
  $("app").innerHTML = `<div class="wsv">
    <header class="top ws"><button class="ib" id="indietro">${svg("left")}</button>${tile(w)}<div class="tt"><b>${esc(w.nome)}</b><small id="sottoWs">${isSpecial() ? w.sotto : `${w.fonti || 0} fonti`}</small></div><button class="mchip" id="mchip"></button></header>
    ${isSpecial() ? "" : `<nav class="tabs" id="tabs">${[["chat", "Chat"], ["nota", "Nota"], ["fonti", "Fonti"]].map(([k, l]) => `<button data-t="${k}" class="${A.tab === k ? "on" : ""}">${svg(k === "chat" ? "chat" : k === "nota" ? "note" : "files")}${l}</button>`).join("")}</nav>`}
    <main id="corpo"></main>
    <div id="composer"></div></div>`;
  $("indietro").onclick = () => history.back();
  $("app").querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { A.tab = b.dataset.t; A.notaEdit = false; $("tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); disegnaTab(); });
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

// ================================================================ chat: elenco
function disegnaChats() {
  const sugg = isTutti() ? ["Cosa scade nei prossimi tre mesi?", "Cosa ho annotato questa settimana?", "Quali cose da fare sono rimaste aperte?"]
    : isSpecial() ? ["Spiegami una cosa in due righe", "Aiutami a scrivere un messaggio", "Traduci in inglese"]
    : ["Riassumi la nota", "Cosa c'è da fare adesso?", "Annota: ", "Cerca nelle fonti…"];
  $("corpo").innerHTML = `<div class="chats">
    <div class="welcome">${tile(ws())}<h2>${isSpecial() ? esc(ws().nome) : `Cosa ti serve su «${esc(ws().nome)}»?`}</h2>
      <div class="sugg">${sugg.map((s) => `<button data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>
    ${A.chats.length ? `<div class="lab">Chat precedenti</div><div class="list">${A.chats.slice(0, 40).map((ch) => `<button class="li" data-c="${esc(ch.id)}"><span class="ic">${svg("chat")}</span><span class="in"><b>${esc((ch.title || "Chat").split("\n")[0])}</b><small>${ch.messages?.length || 0} messaggi · ${ago((ch.updated || ch.created) / 1000)}${ch.telefono ? " · dal telefono" : ""}</small></span></button>`).join("")}</div>` : ""}</div>`;
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
  $("corpo").innerHTML = `<div class="thread" id="thread">${ch.messages.map((m, i) => msgHtml(m, i)).join("")}</div>`;
  legaThread();
  caricaImmagini($("corpo"));
}
function msgHtml(m, i) {
  const base = `workspace/${A.wid}/`;
  if (m.role === "user") {
    const imgs = (m.imgs || []).map((p) => `<img data-src="${esc(base + p)}" alt="">`).join("");
    const pins = (m.pins || []).map((p) => `<span class="pin">${svg(TIPO_IC[p.tipo] || "file")}${esc(p.nome)}</span>`).join("");
    return `<div class="msg u" data-i="${i}">${pins ? `<div class="pins">${pins}</div>` : ""}${m.content ? `<div class="bubble">${esc(m.content)}</div>` : ""}${imgs ? `<div class="uimgs">${imgs}</div>` : ""}</div>`;
  }
  const live = A.busy && i === A.chat.messages.length - 1;
  let body;
  if (m.error) body = `<p class="err">${esc(m.error)}</p>`;
  else if (live && !m.content && !m.thinking) body = `<div class="wait"><span class="dots3"><i></i><i></i><i></i></span>${esc(m.phase || "sto pensando…")}</div>`;
  else body = renderMd(m.content);
  if (m.thinking) body = `<details class="think"${live && !m.content ? " open" : ""}><summary>${svg("right")}${live && !m.content ? "Sta ragionando…" : `Ha ragionato${m.thinkSecs ? ` per ${fmt(m.thinkSecs)} s` : ""}`}</summary><div>${esc(m.thinking)}</div></details>` + body;
  if (m.azioni?.length) body = `<div class="acts">${m.azioni.map((a) => `<span>${svg(a.fonte ? "file" : "search")}${esc(a.testo)}</span>`).join("")}</div>` + body;
  if (m.proposte?.length) body += `<div class="props">${m.proposte.map((p, k) => propHtml(p, i, k)).join("")}</div>`;
  const web = (m.web || []).map((w) => { let h = w.url; try { h = new URL(w.url).hostname.replace(/^www\./, ""); } catch {} return `<a class="wsrc" href="${esc(w.url)}" target="_blank" rel="noopener">${svg("globe")}${esc(w.titolo || h)}</a>`; }).join("");
  const st = m.stats, costo = st?.costo ? ` · ${st.costo < 0.01 ? "<1 cent" : fmt(st.costo * 100, 1) + " cent"}` : "";
  const tags = [m.fonti?.length || m.nota ? `${m.fonti?.length || 0} fonti${m.nota ? " + nota" : ""}` : "", m.noteWs?.length ? `${m.noteWs.length} note` : "", m.usaWeb ? "web" : ""].filter(Boolean).join(" · ");
  return `<div class="msg b${live ? " live" : ""}" data-i="${i}">
    <div class="who"><span class="av"${pc(m.model)}>${svg("cloud")}</span><b>${esc(shortName(m.model))}</b>${tags ? `<small>${tags}</small>` : ""}</div>
    <div class="md">${body}</div>${web ? `<div class="wsrcs">${web}</div>` : ""}${notaAutoHtml(m, i)}
    ${live ? "" : `<div class="mfoot"><button data-copy="${i}">${svg("copy")}</button>${i === A.chat.messages.length - 1 ? `<button data-redo>${svg("redo")}Rigenera</button>` : ""}<span>${st?.eval_count ? `${st.eval_count} token${costo}` : ""}</span></div>`}</div>`;
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
  const web = pref.web;
  c.innerHTML = `<div class="comp">
    ${A.pins.length || A.foto.length ? `<div class="att">${A.pins.map((p, k) => `<span class="pin">${svg(TIPO_IC[p.tipo] || "file")}${esc(p.nome)}<button data-xp="${k}">${svg("x")}</button></span>`).join("")}${A.foto.map((f, k) => `<span class="ph"><img src="${f.url}" alt=""><button data-xf="${k}">${svg("x")}</button></span>`).join("")}</div>` : ""}
    <div class="box"><button class="ib" id="clip" aria-label="Foto">${svg("image")}</button>
      <textarea id="input" rows="1" placeholder="${A.chat ? "Rispondi…" : `Scrivi a ${esc(isSpecial() ? "MyMind" : ws().nome)}…`}" enterkeyhint="enter"></textarea>
      <button class="ib${web ? " on" : ""}" id="web" aria-label="Web">${svg("globe")}</button>
      <button class="ib main" id="send" aria-label="Invia">${svg(A.busy ? "stop" : "up")}</button></div>
    <input type="file" id="pick" accept="image/*" multiple hidden></div>`;
  const inp = $("input");
  inp.oninput = autosize;
  $("send").onclick = () => A.busy ? A.ctrl?.abort() : invia();
  $("web").onclick = () => { pref.web = !pref.web; savePref(); $("web").classList.toggle("on", pref.web); toast(pref.web ? "Cerca anche sul web" : "Senza web"); };
  $("clip").onclick = () => $("pick").click();
  $("pick").onchange = async () => { for (const f of $("pick").files) A.foto.push(await toJpeg(f)); disegnaComposer(); $("input").focus(); };
  c.querySelectorAll("[data-xp]").forEach((b) => b.onclick = () => { A.pins.splice(+b.dataset.xp, 1); disegnaComposer(); });
  c.querySelectorAll("[data-xf]").forEach((b) => b.onclick = () => { A.foto.splice(+b.dataset.xf, 1); disegnaComposer(); });
}
function autosize() { const t = $("input"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }
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
  const msg = { role: "user", content: text || (pins.length ? "Leggi la fonte indicata e dimmi in breve cosa contiene." : "Cosa vedi in questa immagine?"), imgs: [] };
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
  const reply = { role: "assistant", content: "", model, phase: "" };
  const wantWeb = pref.web || WEB_RE.test(lastUser?.content || "");
  if (wantWeb) reply.usaWeb = true;
  chat.messages.push(reply); chat.updated = Date.now();
  A.busy = true; A.ctrl = new AbortController();
  const ridisegna = () => { if (A.chat !== chat || A.tab !== "chat") return; const row = $("thread")?.querySelector(`.msg[data-i="${chat.messages.length - 1}"]`); if (row) { row.outerHTML = msgHtml(reply, chat.messages.length - 1); } const t = $("corpo"); if (t && t.scrollHeight - t.scrollTop - t.clientHeight < 220) scorri(); };
  disegnaThread(); disegnaComposer(); scorri();
  const t0 = performance.now(); let first = 0, lastPaint = 0;
  try {
    let system = "Rispondi in italiano, in modo chiaro e concreto. L'utente ti scrive dal telefono: vai al punto, niente preamboli." + `\n\nOggi è ${oggi()}.`;
    const rules = "\n\nRegole: usa note ed estratti quando sono pertinenti; quando usi un estratto citalo col suo numero tra parentesi quadre, per esempio [2]. "
      + "Se le fonti non bastano dillo chiaramente, poi rispondi con quello che sai distinguendo ciò che viene dalle fonti da ciò che è conoscenza generale. "
      + "Non inventare numeri, date o nomi." + (wantWeb ? " Puoi usare anche i risultati della ricerca web: cita le pagine con un link." : "");
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
    if (pinned.length && !isSpecial()) {
      reply.phase = "leggo le fonti indicate…"; ridisegna();
      let budget = 150000;
      for (const p of pinned) {
        if (budget < 500) break;
        const r = await api("GET", `workspace/${wid}/fonti/${p.fonte}/intero?max=${budget}`).catch(() => null);
        if (!r) continue;
        if (info?.vede && ["pdf", "foto"].includes(p.tipo)) r.immagini = (await api("GET", `workspace/${wid}/fonti/${p.fonte}/immagini?max=8`).catch(() => ({}))).immagini || [];
        docs.set(p.fonte, r); budget -= r.testo.length;
      }
      system += "\n\nQuando l'utente indica una fonte, il suo testo completo è allegato al suo messaggio tra <documento> e </documento>: "
        + "è di quel documento che parla («questa scheda», «questi pannelli»…), leggilo e usalo; ha la precedenza sugli estratti. "
        + "Se ci sono anche le immagini delle pagine o la foto, per tabelle, numeri e targhette fidati delle immagini: il testo estratto può mescolare le colonne.";
      reply.indicate = pinned.map((p) => ({ fonte: p.fonte, nome: p.nome }));
    }
    const attached = (m) => (m.pins || []).filter((p) => owner.get(p.fonte) === m).map((p) => {
      const d = docs.get(p.fonte);
      return d ? `\n\n<documento nome="${d.nome}"${tools ? ` id="${p.fonte}"` : ""}>\n${d.testo}\n</documento>` : `\n\n[l'utente ha indicato «${p.nome}», ma il testo non è disponibile]`;
    }).join("");
    const msgs = chat.messages.slice(0, -1).filter((m) => !m.error);
    const history = msgs.map((m) => ({ role: m.role, content: m.content + (m.role === "user" ? attached(m) : "") + (m.imgs?.length && m !== lastUser ? `\n[${m.imgs.length} immagine/i allegate in precedenza]` : "") }));
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
    reply.phase = wantWeb ? "cerco sul web e penso…" : "chiedo a " + shortName(model) + "…"; ridisegna();
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
        if (j.done) reply.stats = j;
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
  salvaChat(chat, wid);
  if (A.chat === chat) { disegnaThread(); disegnaComposer(); }
  navigator.vibrate?.(12);
}
async function autoNota(chat, reply, wid) {
  const prima = chat.messages.slice(0, chat.messages.indexOf(reply)).reverse().find((m) => m.role === "user");
  reply.notaAuto = { stato: "controllo" }; aggiornaMsg(chat, reply);
  try {
    const r = await api("POST", `workspace/${wid}/nota/auto`, { domanda: prima?.content || "", risposta: reply.content });
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
function salvaChat(chat, wid = A.wid) {
  const copia = JSON.parse(JSON.stringify(chat));
  api("PUT", `workspace/${wid}/chats/${encodeURIComponent(chat.id)}`, copia).catch(() => toast("Chat non salvata sul Mac", true));
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
  c.innerHTML = `<div class="nota"><div class="nhead"><span>${svg("note")}aggiornata ${ago(A.nota.aggiornata)}</span><button class="btn sm" id="nEdit">${svg("edit")}Modifica</button></div>
    <article class="md carta">${A.nota.testo.trim() ? renderMd(A.nota.testo) : '<p class="vuoto">La nota è vuota. Scrivi in chat cosa ricordare («annota che…») e si riempie da sola.</p>'}</article></div>`;
  $("nEdit").onclick = () => { A.notaEdit = true; disegnaNota(); };
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
    const go = () => { A.pins.push({ fonte: f.id, nome: f.nome, tipo: f.tipo }); A.tab = "chat"; A.chat = null; schermoWs(); $("input")?.focus(); };
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
  if ($("sheet").classList.contains("open")) return closeSheet(true);
  if (!A.sec) return;
  if (A.busy && A.chat) { history.pushState({ v: "chat" }, ""); return toast("Sta rispondendo: aspetta o premi ■"); }
  const v = e.state?.v;
  if (A.chat && v !== "chat") { A.chat = null; disegnaTab(); return; }
  if (A.wid && v !== "ws" && v !== "chat") { casa(); carica(); }
});
function avvio() {
  const nuovo = leggiAbbinamento();
  if (nuovo) return creaPin(nuovo);
  if (Cassa.c()) return sblocca();
  nessunAbbinamento();
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
avvio();
controllaVersione();
