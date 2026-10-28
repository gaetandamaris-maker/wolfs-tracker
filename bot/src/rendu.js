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

/* ------------------------------------------------------------ Bulletin de la semaine (image) */
const F = (taille, poids = 700, fam = "Barlow") => `font-family="${fam}" font-weight="${poids}" font-size="${taille}"`;
const FC = taille => F(taille, 800, "Barlow Condensed");
const couleurNote = n => n >= 7.5 ? "#22c55e" : n >= 6.5 ? "#fea40b" : "#ef4444";
const signe = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x);
const nb = (x, d = 2) => Number(x || 0).toFixed(d);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function bulletinSVG(b) {
  const W2 = 1000;
  const recs = [...(b.records || []).map(r => ({ lib: r.lib, val: String(r.val), n: r.n || "", ancien: String(r.ancien ?? "") }))];
  if (b.serieV) recs.push({ lib: "Série de victoires", val: String(b.serieV), n: "toute l'équipe", ancien: "" });
  const R = recs.slice(0, 6);
  const yRec = 1120, H2 = yRec + (R.length ? 76 + R.length * 50 + 24 : 0) + 56;
  const v = b.v || 0, nu = b.n || 0, d = b.d || 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">
  <rect width="${W2}" height="${H2}" fill="#0b0d11"/>
  <path d="M0 0H${W2}V150H0Z" fill="#090b0d"/><path d="M760 0H${W2}V150H700Z" fill="#db1012"/><path d="M732 0H752L692 150H672Z" fill="#db1012"/>
  <rect y="150" width="${W2}" height="5" fill="#fea40b"/>
  <text x="40" y="78" ${FC(58)} fill="#f2f2f2">BULLETIN DE LA SEMAINE</text>
  <text x="40" y="120" ${F(26)} fill="#fea40b">X2RUE PLK WOLfS  ·  du ${esc(b.debut)} au ${esc(b.fin)}</text>
  <text x="${W2 - 44}" y="92" text-anchor="end" ${FC(84)} fill="#ffffff">${b.matchs}</text>
  <text x="${W2 - 44}" y="126" text-anchor="end" ${F(22)} fill="#ffe1e1">${b.matchs > 1 ? "MATCHS" : "MATCH"}</text>`;
  // Bilan
  const tuiles = [[v, "VICTOIRES", "#22c55e"], [nu, "NULS", "#f59e0b"], [d, "DÉFAITES", "#ef4444"], [`${b.bp || 0}–${b.bc || 0}`, "BUTS POUR – CONTRE", "#e5e7eb"]];
  tuiles.forEach(([val, lib, col], i) => {
    const x = 40 + i * 235, w = i === 3 ? 215 : 215;
    s += `<rect x="${x}" y="180" width="${w}" height="140" rx="14" fill="#14171d" stroke="#232833" stroke-width="2"/>
      <rect x="${x}" y="180" width="${w}" height="6" rx="3" fill="${col}"/>
      <text x="${x + w / 2}" y="270" text-anchor="middle" ${FC(i === 3 ? 72 : 84)} fill="${col}">${esc(val)}</text>
      <text x="${x + w / 2}" y="302" text-anchor="middle" ${F(17, 600)} fill="#8d94a1">${lib}</text>`;
  });
  const types = Object.entries(b.parType || {}).map(([t, x]) => `${t} ${x.v}/${x.m}`).join("   ·   ");
  s += `<text x="40" y="364" ${F(21, 600)} fill="#c9cdd3">Victoires : <tspan fill="#ffffff" font-weight="700">${esc(types || "—")}</tspan></text>`;
  if (b.skill) {
    const dl = b.skill.fin - b.skill.debut, col = dl > 0 ? "#22c55e" : dl < 0 ? "#ef4444" : "#c9cdd3";
    s += `<text x="${W2 - 40}" y="364" text-anchor="end" ${F(21, 600)} fill="#c9cdd3">Skill <tspan fill="#ffffff" font-weight="700">${b.skill.debut} &#8250; ${b.skill.fin}</tspan> <tspan fill="${col}" font-weight="700">(${signe(dl)})</tspan>  ·  D${b.skill.divFin}</text>`;
  }
  // Équipe type (terrain)
  const PX = 40, PY = 395, PW = 540, PH = 700;
  s += `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="16" fill="#14171d" stroke="#232833" stroke-width="2"/>
    <text x="${PX + 24}" y="${PY + 42}" ${F(22)} fill="#fea40b">ÉQUIPE TYPE</text>
    <text x="${PX + PW - 24}" y="${PY + 42}" text-anchor="end" ${F(17, 600)} fill="#8d94a1">meilleure note par ligne</text>`;
  const TX = PX + 18, TY = PY + 62, TW = PW - 36, TH = PH - 80;
  for (let i = 0; i < 10; i++) s += `<rect x="${TX}" y="${TY + i * TH / 10}" width="${TW}" height="${TH / 10 + 1}" fill="${i % 2 ? "#0f321f" : "#123a24"}"/>`;
  const L = `stroke="rgba(255,255,255,0.3)" stroke-width="2.5" fill="none"`;
  s += `<rect x="${TX + 8}" y="${TY + 8}" width="${TW - 16}" height="${TH - 16}" ${L}/><line x1="${TX + 8}" y1="${TY + TH / 2}" x2="${TX + TW - 8}" y2="${TY + TH / 2}" ${L}/><circle cx="${TX + TW / 2}" cy="${TY + TH / 2}" r="60" ${L}/>
    <rect x="${TX + TW * 0.24}" y="${TY + 8}" width="${TW * 0.52}" height="96" ${L}/><rect x="${TX + TW * 0.24}" y="${TY + TH - 104}" width="${TW * 0.52}" height="96" ${L}/>`;
  const Ypos = { Gardien: 0.87, Défenseur: 0.65, Milieu: 0.41, Attaquant: 0.16 };
  for (const l of b.equipe || []) {
    const js = (l.joueurs || []).slice(0, 4), n = js.length;
    js.forEach((j, i) => {
      const x = TX + TW * (n === 1 ? 0.5 : 0.14 + 0.72 * i / (n - 1)), y = TY + TH * (Ypos[l.ligne] ?? 0.5);
      s += `<g transform="translate(${x} ${y})"><circle r="33" fill="${couleurNote(j.note)}" stroke="#ffffff" stroke-width="3"/>
        <text y="10" text-anchor="middle" ${FC(29)} fill="#0b0d11">${nb(j.note, 1)}</text>
        <rect x="-64" y="40" width="128" height="30" rx="6" fill="rgba(9,11,13,0.9)"/>
        <text y="61" text-anchor="middle" ${F(17)} fill="#ffffff">${esc(court(j.n, 14))}</text></g>`;
    });
  }
  // Colonne droite
  const CX = 600, CW = 360;
  const j = b.joueur;
  s += `<rect x="${CX}" y="${PY}" width="${CW}" height="250" rx="16" fill="#14171d" stroke="#fea40b" stroke-width="2"/>
    <text x="${CX + 24}" y="${PY + 42}" ${F(22)} fill="#fea40b">JOUEUR DE LA SEMAINE</text>`;
  if (j) {
    const det = [pluriel(j.mj, "match"), j.b ? pluriel(j.b, "but") : "", j.pd ? pluriel(j.pd, "passe") + " D" : "", j.hdm ? `${j.hdm}× HDM` : ""].filter(Boolean);
    s += `<text x="${CX + 24}" y="${PY + 98}" ${FC(44)} fill="#ffffff">${esc(court(j.n, 17))}</text>
      <text x="${CX + 24}" y="${PY + 196}" ${FC(92)} fill="${couleurNote(j.note)}">${nb(j.note)}</text>
      <text x="${CX + 24}" y="${PY + 228}" ${F(17, 600)} fill="#8d94a1">de moyenne${j.ligne ? " · " + esc(String(j.ligne).toLowerCase()) : ""}</text>`;
    det.slice(0, 4).forEach((t, i) => { s += `<text x="${CX + CW - 24}" y="${PY + 132 + i * 28}" text-anchor="end" ${F(20, 600)} fill="#e5e7eb">${esc(t)}</text>`; });
  }
  const yD = PY + 270;
  s += `<rect x="${CX}" y="${yD}" width="${CW}" height="230" rx="16" fill="#14171d" stroke="#232833" stroke-width="2"/>
    <text x="${CX + 24}" y="${yD + 42}" ${F(22)} fill="#fea40b">LES PLUS DÉCISIFS</text>`;
  const med = ["#f5c542", "#c9d1d9", "#d08a4a"];
  (b.buteurs || []).slice(0, 3).forEach((x, i) => {
    const y = yD + 92 + i * 52;
    s += `<circle cx="${CX + 40}" cy="${y - 8}" r="17" fill="${med[i]}"/><text x="${CX + 40}" y="${y}" text-anchor="middle" ${FC(22)} fill="#0b0d11">${i + 1}</text>
      <text x="${CX + 68}" y="${y}" ${F(22)} fill="#ffffff">${esc(court(x.n, 15))}</text>
      <text x="${CX + CW - 24}" y="${y}" text-anchor="end" ${F(22)} fill="#e5e7eb">${x.b}<tspan fill="#8d94a1" font-weight="600" font-size="17">&#160;B</tspan>&#160;&#160;&#160;${x.pd}<tspan fill="#8d94a1" font-weight="600" font-size="17">&#160;PD</tspan></text>`;
  });
  const yF = yD + 250;
  const forme = [...(b.enForme || []).map(x => ({ ...x, up: true })), ...(b.enBaisse || []).map(x => ({ ...x, up: false }))].slice(0, 3);
  s += `<rect x="${CX}" y="${yF}" width="${CW}" height="${PY + PH - yF}" rx="16" fill="#14171d" stroke="#232833" stroke-width="2"/>
    <text x="${CX + 24}" y="${yF + 42}" ${F(22)} fill="#fea40b">FORME</text><text x="${CX + CW - 24}" y="${yF + 42}" text-anchor="end" ${F(15, 600)} fill="#8d94a1">vs semaines d'avant</text>`;
  if (!forme.length) s += `<text x="${CX + 24}" y="${yF + 92}" ${F(19, 600)} fill="#8d94a1">Pas assez de matchs pour comparer</text>`;
  forme.forEach((x, i) => {
    const y = yF + 90 + i * 44, col = x.up ? "#22c55e" : "#ef4444";
    s += `<path d="${x.up ? `M${CX + 30} ${y - 2}l10 -16l10 16z` : `M${CX + 30} ${y - 18}l10 16l10 -16z`}" fill="${col}"/>
      <text x="${CX + 62}" y="${y}" ${F(21)} fill="#ffffff">${esc(court(x.n, 14))}</text>
      <text x="${CX + CW - 24}" y="${y}" text-anchor="end" ${F(21)} fill="${col}">${x.up ? "+" : "−"}${nb(Math.abs(x.delta))}</text>`;
  });
  // Records
  if (R.length) {
    s += `<rect x="40" y="${yRec}" width="${W2 - 80}" height="${76 + R.length * 50}" rx="16" fill="#14171d" stroke="#db1012" stroke-width="2"/>
      <text x="64" y="${yRec + 44}" ${F(22)} fill="#fea40b">RECORDS DU CLUB BATTUS</text>`;
    R.forEach((r, i) => {
      const y = yRec + 92 + i * 50;
      if (i) s += `<line x1="64" y1="${y - 32}" x2="${W2 - 64}" y2="${y - 32}" stroke="#232833" stroke-width="1.5"/>`;
      s += `<text x="64" y="${y}" ${F(21, 600)} fill="#c9cdd3">${esc(court(r.lib, 28))}</text>
        <text x="420" y="${y}" ${FC(30)} fill="#fea40b">${esc(court(r.val, 8))}</text>
        <text x="530" y="${y}" ${F(21)} fill="#ffffff">${esc(court(r.n, 18))}</text>
        <text x="${W2 - 64}" y="${y}" text-anchor="end" ${F(18, 600)} fill="#8d94a1">${r.ancien ? "ancien : " + esc(r.ancien) : ""}</text>`;
    });
  }
  s += `<text x="${W2 - 40}" y="${H2 - 22}" text-anchor="end" ${F(16, 600)} fill="#5d6470">Wolfs Vestiaire · bulletin automatique du lundi</text></svg>`;
  return s;
}
