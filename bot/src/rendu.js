// Image de la compo (SVG) : même lecture que le tableau tactique de l'app.
const LIGNE = { G: "Gardien", DC: "Défenseur", DG: "Défenseur", DD: "Défenseur", DLG: "Défenseur", DLD: "Défenseur", MDC: "Milieu", MC: "Milieu", MG: "Milieu", MD: "Milieu", MOC: "Milieu", AG: "Attaquant", AD: "Attaquant", AT: "Attaquant", BU: "Attaquant" };
const COUL = { Gardien: "#f59e0b", Défenseur: "#3b82f6", Milieu: "#10b981", Attaquant: "#e2242a" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const court = (s, n) => (s = String(s || "")).length > n ? s.slice(0, n - 1) + "…" : s;

export const W = 1000, H = 1500;
export function compoSVG(c, nomPour) {
  const PX = 80, PY = 168, PW = 840, PH = 1235; // terrain
  const X = x => PX + x / 100 * PW, Y = y => PY + y / 100 * PH;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <marker id="fa" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#fea40b"/></marker>
    <marker id="fb" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#ffffff"/></marker>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0d11"/>
  <path d="M0 0H${W}V150H0Z" fill="#090b0d"/><path d="M640 0H${W}V150H580Z" fill="#db1012"/><path d="M612 0H632L572 150H552Z" fill="#db1012"/>
  <rect y="150" width="${W}" height="5" fill="#fea40b"/>
  <text x="40" y="70" font-family="Barlow Condensed" font-weight="800" font-size="56" fill="#f2f2f2">X2RUE PLK WOLfS</text>
  <text x="40" y="112" font-family="Barlow" font-weight="700" font-size="28" fill="#fea40b">${esc(court(c.nom, 34))}${c.formation ? "  ·  " + esc(c.formation) : ""}</text>
  <text x="40" y="138" font-family="Barlow" font-weight="600" font-size="19" fill="#c9cdd3">${esc(court(c.sessionTitre || "", 60))}</text>`;
  for (let i = 0; i < 14; i++) s += `<rect x="${PX}" y="${PY + i * PH / 14}" width="${PW}" height="${PH / 14 + 1}" fill="${i % 2 ? "#0f321f" : "#123a24"}"/>`;
  const L = `stroke="rgba(255,255,255,0.35)" stroke-width="3" fill="none"`;
  s += `<rect x="${PX + 10}" y="${PY + 10}" width="${PW - 20}" height="${PH - 20}" ${L}/><line x1="${PX + 10}" y1="${Y(50)}" x2="${PX + PW - 10}" y2="${Y(50)}" ${L}/><circle cx="${X(50)}" cy="${Y(50)}" r="88" ${L}/>
    <rect x="${X(26)}" y="${PY + 10}" width="${PW * 0.48}" height="170" ${L}/><rect x="${X(38.5)}" y="${PY + 10}" width="${PW * 0.23}" height="62" ${L}/>
    <rect x="${X(26)}" y="${PY + PH - 180}" width="${PW * 0.48}" height="170" ${L}/><rect x="${X(38.5)}" y="${PY + PH - 72}" width="${PW * 0.23}" height="62" ${L}/>`;
  for (const d of c.dessins || []) {
    const [x1, y1, x2, y2] = [X(d.p[0]), Y(d.p[1]), X(d.p[2]), Y(d.p[3])];
    if (d.t === "zone") s += `<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${Math.max(16, Math.abs(x2 - x1) / 2)}" ry="${Math.max(16, Math.abs(y2 - y1) / 2)}" fill="#ef4444" fill-opacity="0.2" stroke="#ef4444" stroke-width="3" stroke-dasharray="10 8"/>`;
    else { const co = d.t === "course"; const mx = (x1 + x2) / 2 + (co ? (y2 - y1) * 0.12 : 0), my = (y1 + y2) / 2 - (co ? (x2 - x1) * 0.12 : 0); s += `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="${co ? "#fea40b" : "#ffffff"}" stroke-width="5" ${co ? 'stroke-dasharray="14 10"' : ""} stroke-linecap="round" marker-end="url(#${co ? "fa" : "fb"})"/>`; }
  }
  for (const j of c.joueurs || []) {
    const col = COUL[LIGNE[j.poste]] || "#888"; const x = X(j.x), y = Y(j.y);
    const nom = j.ea ? (nomPour ? nomPour(j) : j.ea) : "À placer";
    s += `<g transform="translate(${x} ${y})"><circle r="38" fill="${col}" stroke="#ffffff" stroke-width="4"/>
      <text y="9" text-anchor="middle" font-family="Barlow" font-weight="700" font-size="${j.poste.length > 2 ? 22 : 26}" fill="#ffffff">${esc(j.poste)}</text>
      <rect x="-104" y="44" width="208" height="${j.arch ? 56 : 36}" rx="7" fill="rgba(9,11,13,0.9)"/>
      <text y="70" text-anchor="middle" font-family="Barlow" font-weight="700" font-size="23" fill="${j.ea ? "#ffffff" : "#fea40b"}">${esc(court(nom, 17))}</text>
      ${j.arch ? `<text y="92" text-anchor="middle" font-family="Barlow" font-weight="600" font-size="17" fill="#fea40b">${esc(court(j.arch, 22))}</text>` : ""}</g>`;
  }
  const banc = (c.banc || []).filter(Boolean);
  s += `<text x="40" y="1450" font-family="Barlow" font-weight="700" font-size="22" fill="#8d94a1">BANC</text>
    <text x="118" y="1450" font-family="Barlow" font-weight="600" font-size="22" fill="#eef0f2">${esc(court(banc.length ? banc.join(" · ") : "—", 70))}</text>
    <text x="${W - 40}" y="1484" text-anchor="end" font-family="Barlow" font-weight="600" font-size="16" fill="#5d6470">Wolfs Vestiaire</text></svg>`;
  return s;
}
