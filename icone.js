// Icone a tratto (24×24) e logo di MyMind.
const I = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M9 4v16M12 9h4M12 13h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  clip: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  ok: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  redo: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 16v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M13 12v4h1a2 2 0 0 0 0-4z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  finder: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16M8 9v1M16 9v1M8 15c2.5 1.5 5.5 1.5 8 0"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 17l9 5 9-5"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  // icone dei workspace
  ws_sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  ws_pannello: '<path d="M3 16l3-10h12l3 10z"/><path d="M4.5 11h15M9 6l-1.5 10M15 6l1.5 10M12 16v4M8 20h8"/>',
  ws_uva: '<circle cx="9" cy="10" r="2.2"/><circle cx="14" cy="10" r="2.2"/><circle cx="11.5" cy="14" r="2.2"/><circle cx="16" cy="14" r="2.2"/><circle cx="13.5" cy="18" r="2.2"/><path d="M11.5 7.5c0-2 1-3.5 3-4.5M14 5c1.5-.5 3 0 4 1.5"/>',
  ws_calice: '<path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8zM12 11v8M8 21h8"/>',
  ws_oliva: '<ellipse cx="12" cy="14" rx="4.5" ry="6" transform="rotate(-25 12 14)"/><path d="M14 7c1-2 3-3.5 6-4-1 3-3 4.5-5.5 5"/>',
  ws_foglia: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l9-9"/>',
  ws_albero: '<path d="M12 22v-7M12 15c-5 0-7-3-7-6a7 7 0 0 1 14 0c0 3-2 6-7 6z"/><path d="M12 15l-3-3M12 13l3-3"/>',
  ws_casa: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  ws_attrezzi: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  ws_goccia: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  ws_fulmine: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  ws_libro: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6"/>',
  ws_cuore: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  ws_auto: '<path d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16M3 16h18v3H3z"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  ws_soldi: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  ws_stella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  ws_gallina: '<circle cx="7.5" cy="7" r="2.3"/><path d="M6.4 4.8c.2-1 .9-1.6 1.6-1.3.4-.6 1.1-.7 1.6-.2M5.3 6.4L3.4 7.2l1.9.7M6.4 9.1C5 11.5 5.6 15.2 8.6 16.6h5.6c2.9-1 4.8-3.6 4.8-7.1l1.6-4.8-3.6 2.1c-1.8 1.8-4.4 2.9-7.2 2.3M10.3 12.6c1.6 1.4 4 1.4 5.4 0M10 16.6V20M14 16.6V20M7.6 6.8v.01"/>',
  ws_uovo: '<path d="M12 3c-3.5 0-6 5.5-6 10a6 6 0 0 0 12 0c0-4.5-2.5-10-6-10z"/><path d="M9.3 13.5a3 3 0 0 0 1.7 3"/>',
  ws_ape: '<ellipse cx="13" cy="14.5" rx="5.5" ry="4.2"/><circle cx="5.6" cy="14.5" r="1.9"/><path d="M11.5 10.5v8M14.8 10.6v7.8M18.5 14.5h2"/><ellipse cx="11" cy="7.4" rx="2.1" ry="3" transform="rotate(-25 11 7.4)"/><ellipse cx="15.2" cy="7.4" rx="2.1" ry="3" transform="rotate(25 15.2 7.4)"/>',
  ws_zampa: '<path d="M12 20.5c-2.6 0-5-1-5-3.2 0-2.4 2.5-5.4 5-5.4s5 3 5 5.4c0 2.2-2.4 3.2-5 3.2z"/><circle cx="5.6" cy="10.6" r="1.8"/><circle cx="9.2" cy="6.4" r="1.9"/><circle cx="14.8" cy="6.4" r="1.9"/><circle cx="18.4" cy="10.6" r="1.8"/>',
  ws_gatto: '<path d="M5 11L6 3.8l4.4 3.7h3.2L18 3.8l1 7.2c0 5-3 8.5-7 8.5s-7-3.5-7-7.5z"/><path d="M9.5 12v.6M14.5 12v.6M11 15.2h2l-1 1.1zM2.8 13.8l3 .6M2.8 17l3-1M21.2 13.8l-3 .6M21.2 17l-3-1"/>',
  ws_germoglio: '<path d="M12 20v-8M12 12c0-3.5-2.5-6-6.5-6 0 3.5 2.5 6 6.5 6zM12 15c0-3 2.2-5.5 6-5.5 0 3-2.2 5.5-6 5.5zM7 20h10"/>',
  ws_carota: '<path d="M14.5 9.5c-1.5-1.5-4-1.5-5.5 0L3.5 20.5l11-5.5c1.5-1.5 1.5-4 0-5.5zM15 9c.6-2 .2-4-1-5.5M15 9c2-.6 4-.2 5.5 1M15 9l3.5-3.5M8.6 12.8l1.4 1.4M6.4 16.4l1.2 1.2"/>',
  ws_trattore: '<circle cx="7.5" cy="16" r="4"/><circle cx="18" cy="18" r="2"/><path d="M4.5 12.2V5h5.5l1.2 7M11.5 16H16M11.2 12h7a1.5 1.5 0 0 1 1.5 1.5V16M16.5 12V8.5"/><circle cx="7.5" cy="16" r=".6"/>',
  ws_fuoco: '<path d="M12 21.5c-3.9 0-7-2.8-7-6.5 0-3 2-5 3.5-6.5.5 1.5 1.5 2.5 2.5 2.5 0-3 1-5.5 3.5-7.5.5 3 2.5 4.5 3.5 6 1 1.5 1.5 3 1.5 5 0 4-3 7-7.5 7z"/><path d="M12 21.5c-1.7 0-3-1.3-3-3 0-1.5 1.5-3 3-4 1.5 1 3 2.5 3 4 0 1.7-1.3 3-3 3z"/>',
  ws_barattolo: '<path d="M7 3h10v3H7zM7.5 6C6 7 5 8.5 5 10.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8.5c0-2-1-3.5-2.5-4.5M5 12h14M5 17h14"/>',
  ws_pane: '<path d="M3 15c0-5 4-9 9-9s9 4 9 9v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 9.5l1.4 2.5M11.5 8l1.4 2.5M15 9l1.4 2.5"/>',
  ws_fiore: '<path d="M12 13c-3 0-5-2-5-5V4l2.5 2L12 3.5 14.5 6 17 4v4c0 3-2 5-5 5zM12 13v8M12 18.5c-2-2.5-4.5-3-6.5-2.5.5 2 3 3.5 6.5 2.5z"/>',
  ws_salute: '<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
  ws_valigia: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M8 7v13M16 7v13"/>',
  ws_computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  ws_calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
};
const WS_ICONS = ["sole", "pannello", "fulmine", "goccia", "fuoco", "uva", "calice", "oliva", "foglia", "albero", "germoglio", "fiore", "carota",
  "gallina", "uovo", "ape", "zampa", "gatto", "trattore", "attrezzi", "casa", "barattolo", "pane", "auto", "valigia", "soldi", "computer",
  "calendario", "libro", "salute", "cuore", "stella"];
const WS_COLORS = ["#c2a878", "#d4af37", "#f5a524", "#f97316", "#ef4444", "#e11d74", "#1fb5b0", "#0e5c63", "#3b82f6", "#22c55e", "#84cc16", "#a47148", "#c05800", "#7c5e10", "#2a2a2a"];

function svg(name, cls = "") {
  return `<svg class="i ${cls}" viewBox="0 0 24 24">${I[name] || I.file}</svg>`;
}

// Logo di MyMind: cinque nodi collegati a forma di M, in terracotta su avorio pieno. Colori fissi, uguali in ogni palette;
// il filo sottile del bordo lo stacca dai fondi chiari.
const LOGO_INTERNO = `<rect x=".75" y=".75" width="46.5" height="46.5" rx="13.25" fill="#f8f2e6" stroke="#e2d4b8" stroke-width="1.5"/>
  <path d="M13 35L15 14L24 27L33 14L35 35" stroke="#c15f3c" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  <g fill="#c15f3c"><circle cx="13" cy="35" r="3"/><circle cx="15" cy="14" r="3"/><circle cx="24" cy="27" r="3.4"/><circle cx="33" cy="14" r="3"/><circle cx="35" cy="35" r="3"/></g>`;
const LOGO = `<svg viewBox="0 0 48 48" fill="none">${LOGO_INTERNO}</svg>`;
// icona della scheda del browser: lo stesso disegno
function paintFavicon() {
  let l = document.querySelector("link[rel=icon]");
  if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
  l.href = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">${LOGO_INTERNO}</svg>`);
}
const BRAIN_LINE = '<path d="M11 4c-4.5 0-8 3.6-8 8.3S6.5 20 11 20"/><path d="M13 4c4.5 0 8 3.6 8 8.3S17.5 20 13 20"/><path d="M11 8.5c-2 0-3.7.6-4.7 2M11 13c-2.3 0-4.3.8-5.3 2.3M13 8.5c2 0 3.7.6 4.7 2M13 13c2.3 0 4.3.8 5.3 2.3"/>';
I.brain = BRAIN_LINE;

// riempie i segnaposto <span class="ic" data-icon="..."> già nella pagina
function paintIcons(root = document) {
  root.querySelectorAll(".ic[data-icon]").forEach((el) => { if (!el.firstChild) el.innerHTML = svg(el.dataset.icon); });
}
