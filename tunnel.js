// MyMind tascabile · il tunnel cifrato verso il Mac.
// MQTT 3.1.1 su WebSocket sicuro (wss://<broker>:8884/mqtt). Il telefono pubblica su mymind/<canale>/q e ascolta
// mymind/<canale>/r. Ogni messaggio è "MMQ1"/"MMR1" | nonce (12) | AES-256-GCM(JSON) con la sigla come dato autenticato:
// il broker vede solo byte a caso. Sul Mac ponte.py li decifra e li gira a MyMind (solo le operazioni permesse).
// La chiave sta sul telefono chiusa sotto il PIN (PBKDF2 → AES-GCM): senza PIN non si legge.
"use strict";
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4); const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const rid = () => b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, "x");
const PEZZO = 48 * 1024;

// ================================================================ la cassaforte: chiave chiusa col PIN
const CASSA = "mmt.cassa.v1", ITER = 310000;
const Cassa = {
  c() { try { return JSON.parse(localStorage.getItem(CASSA)); } catch { return null; } },
  async _k(pin, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  async chiudi(pin, segreto) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this._k(pin, salt, ITER), enc.encode(JSON.stringify(segreto))));
    localStorage.setItem(CASSA, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct), iter: ITER, errori: 0, nome: segreto.nome }));
  },
  async apri(pin) {
    const c = this.c();
    if (!c) throw new Error("niente abbinamento");
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(c.iv) }, await this._k(pin, unb64(c.salt), c.iter), unb64(c.ct));
      c.errori = 0; localStorage.setItem(CASSA, JSON.stringify(c));
      return JSON.parse(dec.decode(pt));
    } catch {
      c.errori = (c.errori || 0) + 1;
      if (c.errori >= 10) { this.cancella(); throw new Error("10 PIN sbagliati: abbinamento cancellato. Rifallo dal Mac."); }
      localStorage.setItem(CASSA, JSON.stringify(c));
      throw new Error(`PIN sbagliato · restano ${10 - c.errori} tentativi`);
    }
  },
  cancella() { localStorage.removeItem(CASSA); },
};

// ================================================================ MQTT + cifratura
const Tunnel = {
  sec: null, key: null, ws: null, buf: new Uint8Array(0), pronto: false, attesa: new Map(), tenta: 0, ping: 0,
  stato: "spento", onStato: () => {},
  async avvia(segreto) {
    this.sec = segreto;
    this.key = await crypto.subtle.importKey("raw", unb64(segreto.chiave), "AES-GCM", false, ["encrypt", "decrypt"]);
    this.collega();
  },
  ferma() { this.sec = null; this.key = null; try { this.ws?.close(); } catch {} this.ws = null; this.pronto = false; },
  imposta(s, msg) { this.stato = s; this.onStato(s, msg); },
  str(x) { const b = enc.encode(x); return [b.length >> 8, b.length & 255, ...b]; },
  pkt(h, body) {
    const rl = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; rl.push(d); } while (n);
    const out = new Uint8Array(1 + rl.length + body.length); out[0] = h; out.set(rl, 1); out.set(body, 1 + rl.length); return out;
  },
  collega() {
    if (!this.sec || (this.ws && this.ws.readyState <= 1)) return;
    const b = this.sec.broker || {}, host = b.h || "broker.hivemq.com", user = b.u || "", pass = b.p || "";
    let ws; try { ws = new WebSocket(`wss://${host}:8884/mqtt`, ["mqtt"]); } catch { return; }
    ws.binaryType = "arraybuffer"; this.ws = ws; this.buf = new Uint8Array(0); this.pronto = false;
    this.imposta("collego");
    ws.onopen = () => {
      ws.send(this.pkt(0x10, new Uint8Array([...this.str("MQTT"), 4, 0x02 | (user ? 0x80 : 0) | (pass ? 0x40 : 0), 0, 60,
        ...this.str("mmt-" + rid()), ...(user ? this.str(user) : []), ...(pass ? this.str(pass) : [])])));
      clearInterval(this.ping); this.ping = setInterval(() => { try { ws.send(new Uint8Array([0xC0, 0])); } catch {} }, 30e3);
    };
    ws.onmessage = (e) => {
      const add = new Uint8Array(e.data), u = new Uint8Array(this.buf.length + add.length); u.set(this.buf); u.set(add, this.buf.length); this.buf = u;
      for (;;) {                                       // un pacchetto può arrivare a pezzi, o più pacchetti insieme
        const u = this.buf; if (u.length < 2) break;
        let len = 0, mul = 1, i = 1;
        for (; i < 5 && i < u.length; i++) { len += (u[i] & 127) * mul; mul *= 128; if (!(u[i] & 128)) break; }
        if (i >= u.length || (u[i] & 128)) break;
        const end = i + 1 + len; if (u.length < end) break;
        const h = u[0], body = u.subarray(i + 1, end); this.buf = u.slice(end);
        if (h >> 4 === 2) {
          if (body[1] !== 0) { this.imposta("errore", "il broker rifiuta l'accesso"); ws.close(); return; }
          ws.send(this.pkt(0x82, new Uint8Array([0, 1, ...this.str(`mymind/${this.sec.canale}/r`), 0])));
        } else if (h >> 4 === 9) {                     // SUBACK: si può parlare
          this.pronto = true; this.tenta = 0; this.imposta("collegato");
        } else if (h >> 4 === 3) {
          const tl = body[0] << 8 | body[1], off = 2 + tl + ((h >> 1) & 3 ? 2 : 0);
          this.arriva(body.slice(off));
        }
      }
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      this.ws = null; this.pronto = false;
      for (const [, w] of this.attesa) w.ko(new Error("connessione interrotta: riprova"));
      this.attesa.clear();
      if (!this.sec) return;
      this.imposta("scollegato");
      if (!document.hidden) setTimeout(() => this.collega(), Math.min(30e3, 1000 * 2 ** this.tenta++));
    };
  },
  async pronti(ms = 15000) {
    this.collega();
    for (let t = 0; !this.pronto && t < ms; t += 200) await new Promise((r) => setTimeout(r, 200));
    if (!this.pronto) throw new Error("non riesco a collegarmi al broker: controlla la connessione");
  },
  async manda(obj) {
    const sigla = enc.encode("MMQ1"), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: sigla }, this.key, enc.encode(JSON.stringify(obj))));
    const msg = new Uint8Array(16 + ct.length); msg.set(sigla); msg.set(iv, 4); msg.set(ct, 16);
    const t = this.str(`mymind/${this.sec.canale}/q`), body = new Uint8Array(t.length + msg.length); body.set(t); body.set(msg, t.length);
    this.ws.send(this.pkt(0x30, body));
  },
  async arriva(u8) {
    if (u8.length < 32 || dec.decode(u8.subarray(0, 4)) !== "MMR1") return;
    let j;
    try { j = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u8.slice(4, 16), additionalData: u8.slice(0, 4) }, this.key, u8.slice(16)))); }
    catch { return; }
    const w = this.attesa.get(j.id); if (!w) return;
    w.visto = Date.now(); w.pezzi.set(j.n, j);
    if (j.fin) w.ultimo = j.n;
    // in ordine: chi aspetta la diretta riceve i pezzi appena sono consecutivi
    while (w.pezzi.has(w.dato)) {
      const p = w.pezzi.get(w.dato);
      if (w.dato === 0) { w.st = p.st; w.ct = p.ct || ""; w.di = p.di; if (p.errore) w.errore = p.errore; }
      if (w.onPezzo && p.d) w.onPezzo(p.d);
      else w.parti.push(p.d !== undefined ? p.d : p.b64 !== undefined ? p.b64 : "");
      if (p.errore && !w.errore) w.errore = p.errore;
      w.pezzi.delete(w.dato); w.dato++;
    }
    if (w.ultimo !== undefined && w.dato > w.ultimo) w.fatto();
  },
  // una chiamata alle API di MyMind: come fetch("/api/" + percorso), ma passando dal broker
  async chiama(metodo, percorso, { corpo, ct, onPezzo, segnale, attesa = 120e3 } = {}) {
    await this.pronti();
    const id = rid(), t = Math.round(Date.now() / 1000);
    let dati = corpo === undefined || corpo === null ? new Uint8Array(0) : corpo instanceof Uint8Array ? corpo : enc.encode(typeof corpo === "string" ? corpo : JSON.stringify(corpo));
    const w = { pezzi: new Map(), parti: [], dato: 0, onPezzo, visto: Date.now() };
    const p = new Promise((ok, ko) => {
      w.ko = (e) => { clearInterval(w.timer); this.attesa.delete(id); ko(e); };
      w.fatto = () => { clearInterval(w.timer); this.attesa.delete(id); ok(w); };
      w.timer = setInterval(() => { if (Date.now() - w.visto > attesa) { w.ko(new Error("il Mac non risponde: è acceso e collegato a internet?")); this.manda({ id, t: Math.round(Date.now() / 1000), op: "annulla" }).catch(() => {}); } }, 1000);
    });
    this.attesa.set(id, w);
    if (segnale) segnale.addEventListener("abort", () => { this.manda({ id, t: Math.round(Date.now() / 1000), op: "annulla" }).catch(() => {}); const e = new Error("interrotta"); e.name = "AbortError"; w.ko(e); });
    const testa = { id, t, m: metodo, p: percorso, ct: ct || "application/json" };
    if (dati.length <= PEZZO) {
      const binario = ct && !/json|text/.test(ct);
      await this.manda(binario ? { ...testa, b64: b64(dati) } : { ...testa, b: dec.decode(dati) });
    } else {
      const di = Math.ceil(dati.length / PEZZO);
      for (let n = 0; n < di; n++) {
        await this.manda({ ...(n === 0 ? testa : { id, t }), n, di, b64: b64(dati.subarray(n * PEZZO, (n + 1) * PEZZO)) });
        if (n % 8 === 7) await new Promise((r) => setTimeout(r, 30));     // non intasare il broker
      }
    }
    return p;
  },
  async json(metodo, percorso, corpo, opts = {}) {
    const w = await this.chiama(metodo, percorso, { corpo, ...opts });
    const testo = w.parti.join("");
    let j = {}; try { j = testo ? JSON.parse(testo) : {}; } catch {}
    if (w.st >= 400 || w.errore) throw new Error(j.errore || w.errore || `errore ${w.st}`);
    return j;
  },
  async blob(percorso) {
    const w = await this.chiama("GET", percorso);
    if (w.st >= 400 || w.errore) throw new Error(w.errore || `errore ${w.st}`);
    const parti = w.parti.map((p) => /json|text/.test(w.ct) ? enc.encode(p) : unb64(p));
    return new Blob(parti, { type: w.ct || "application/octet-stream" });
  },
};
document.addEventListener("visibilitychange", () => { if (!document.hidden && Tunnel.sec) Tunnel.collega(); });
