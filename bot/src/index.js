// Bot Discord des Wolfs : dispos, compo publiée depuis l'app, rappels, vote MVP, classement.
// Hébergé sur Cloudflare Workers ; toutes les données vivent dans le Google Sheet (via Apps Script).
import { signatureOk, json, rest, editerReponse, suivi, T, EPHEMERE } from "./discord.js";
import { compoSVG, bulletinSVG } from "./rendu.js";

const ROUGE = 0xdb1012, AMBRE = 0xfea40b, VERT = 0x2f9e6c, OR = 0xc9a227;
const LIGNE = { G: "Gardien", DC: "Défense", DG: "Défense", DD: "Défense", DLG: "Défense", DLD: "Défense", MDC: "Milieu", MC: "Milieu", MG: "Milieu", MD: "Milieu", MOC: "Milieu", AG: "Attaque", AD: "Attaque", AT: "Attaque", BU: "Attaque" };
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/* ------------------------------------------------------------ heure de Paris */
function partsParis(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
export function epochParis(y, m, d, h, mi) {
  const guess = Date.UTC(y, m - 1, d, h, mi); const p = partsParis(guess);
  const off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
  return guess - off;
}
export function lireDate(txt) { // "dd/mm/yyyy hh:mm" (heure de Paris) -> epoch ms
  const m = String(txt || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/); if (!m) return 0;
  return epochParis(+m[3], +m[2], +m[1], +m[4], +m[5]);
}
/* « 28/10 », « 28/10/2026 », « auj », « ce soir », « demain », « mercredi » + « 20h45 » / « 20:45 » / « 21h » */
export function dateSession(date, heure, maintenant = Date.now()) {
  const auj = partsParis(maintenant); let y = auj.y, m = auj.m, d = auj.d;
  const t = String(date || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let x;
  if (/^(auj|aujourd|ce soir|today|ce jour)/.test(t)) { /* aujourd'hui */ }
  else if (/^demain/.test(t)) { const p = partsParis(maintenant + 864e5); y = p.y; m = p.m; d = p.d; }
  else if ((x = JOURS.findIndex(j => t.startsWith(j.normalize("NFD").replace(/[̀-ͯ]/g, "")))) >= 0) {
    const jAuj = new Date(Date.UTC(auj.y, auj.m - 1, auj.d)).getUTCDay(); const delta = (x - jAuj + 7) % 7;
    const p = partsParis(maintenant + delta * 864e5); y = p.y; m = p.m; d = p.d;
  } else if ((x = t.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) {
    d = +x[1]; m = +x[2]; if (x[3]) y = +x[3] < 100 ? 2000 + +x[3] : +x[3];
    else if (Date.UTC(y, m - 1, d) < Date.UTC(auj.y, auj.m - 1, auj.d) - 30 * 864e5) y++;
  } else throw new Error("Date non comprise. Exemples : 28/10, demain, mercredi.");
  const h = String(heure || "").trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:)?\s*(\d{2})?$/);
  if (!h || +h[1] > 23 || +(h[2] || 0) > 59) throw new Error("Heure non comprise. Exemples : 20h45, 21:00, 21h.");
  if (d < 1 || d > 31 || m < 1 || m > 12) throw new Error("Date impossible.");
  const p2 = n => String(n).padStart(2, "0");
  return { texte: `${p2(d)}/${p2(m)}/${y} ${p2(+h[1])}:${p2(+(h[2] || 0))}`, ts: epochParis(y, m, d, +h[1], +(h[2] || 0)) };
}
export function dateLongue(ts) { const p = partsParis(ts); const j = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); return `${JOURS[j]} ${p.d} ${MOIS[p.m - 1]} à ${p.h}h${String(p.mi).padStart(2, "0")}`; }

/* ------------------------------------------------------------ Google Sheet */
async function gs(env, action, data = {}) {
  const r = await fetch(env.APPS_SCRIPT_URL, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ cle: env.CLE, bot: { action, ...data } }), redirect: "follow" });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch (_) { throw new Error("Le Google Sheet ne répond pas (script Apps Script à redéployer ?)"); }
  if (j.v === undefined) throw new Error("Le script du Google Sheet n'est pas à jour : colle le nouveau Code.gs puis Déployer › Gérer les déploiements › Modifier › Nouvelle version.");
  if (!j.ok) throw new Error(j.erreur || "Erreur côté Sheet");
  return j;
}

/* ------------------------------------------------------------ messages */
const court = (s, n) => (s = String(s || "")).length > n ? s.slice(0, n - 1) + "…" : s;
const nomCourt = p => court(String(p || "").split("/")[0].trim() || p, 24);
const liste = l => l.length ? court(l.map(x => "• " + nomCourt(x.pseudo)).join("\n"), 1000) : "—";
export function embedDispo(etat) {
  const s = etat.session; const ts = lireDate(s.date);
  return {
    title: `📅 ${court(s.titre, 200)}`, color: ROUGE,
    description: `**${ts ? dateLongue(ts) : s.date}**${s.comp ? ` · ${s.comp}` : ""}${ts ? ` · <t:${Math.floor(ts / 1000)}:R>` : ""}\nDonne ta dispo avec les boutons ci-dessous 👇`,
    fields: [
      { name: `✅ Présents (${etat.present.length})`, value: liste(etat.present), inline: true },
      { name: `❓ Indécis (${etat.indecis.length})`, value: liste(etat.indecis), inline: true },
      { name: `❌ Absents (${etat.absent.length})`, value: liste(etat.absent), inline: true }
    ],
    footer: { text: s.statut === "fermée" ? "Session fermée" : "Wolfs · la compo arrivera ici depuis l'app" }
  };
}
/* Mise à jour immédiate du message (avant la réponse du Sheet) : on déplace le joueur dans la bonne colonne. */
const CHAMPS = { present: [0, "✅ Présents"], indecis: [1, "❓ Indécis"], absent: [2, "❌ Absents"] };
export function dispoInstantanee(embed, pseudo, rep) {
  if (!embed || !Array.isArray(embed.fields) || embed.fields.length < 3 || !CHAMPS[rep]) return null;
  const moi = "• " + nomCourt(pseudo);
  const e = JSON.parse(JSON.stringify(embed));
  for (const [k, [i, titre]] of Object.entries(CHAMPS)) {
    const f = e.fields[i]; if (!f) return null;
    let l = String(f.value || "").split("\n").filter(x => x && x !== "—" && x !== moi);
    if (k === rep) l.push(moi);
    f.value = court(l.join("\n"), 1000) || "—"; f.name = `${titre} (${l.length})`;
  }
  return e;
}
export const boutonsDispo = (sid, ferme) => [{ type: 1, components: [
  { type: 2, style: 3, label: "Présent", emoji: { name: "✅" }, custom_id: `d:${sid}:present`, disabled: !!ferme },
  { type: 2, style: 2, label: "Indécis", emoji: { name: "❓" }, custom_id: `d:${sid}:indecis`, disabled: !!ferme },
  { type: 2, style: 4, label: "Absent", emoji: { name: "❌" }, custom_id: `d:${sid}:absent`, disabled: !!ferme }
] }];
const ligneStats = st => st ? `${st.note.toFixed(1)} · ${st.b} but${st.b > 1 ? "s" : ""} · ${st.pd} PD${st.hdm ? " · ⭐" : ""}` : "";
function tableauStats(stats) {
  if (!stats || !stats.length) return null;
  return "```\n" + stats.slice(0, 8).map(s => `${court(s.ea, 16).padEnd(16)} ${s.note.toFixed(2)}  ${String(s.b).padStart(2)}B ${String(s.pd).padStart(2)}PD${s.hdm ? " ⭐" + s.hdm : ""}`).join("\n") + "\n```";
}
export function messageVote(etat, stats, fin, nbVotes = 0) {
  const parEA = new Map((stats || []).map(s => [s.ea, s]));
  const cands = etat.present.slice(0, 25);
  const embed = {
    title: `🏆 Vote MVP · ${court(etat.session.titre, 150)}`, color: OR,
    description: `Qui a été le meilleur ce soir ? Choisis dans le menu (vote secret, modifiable jusqu'à la fin).\nFin du vote <t:${Math.floor(fin / 1000)}:R>.`,
    fields: tableauStats(stats) ? [{ name: "📊 Stats EA de la soirée", value: tableauStats(stats) }] : [],
    footer: { text: `🗳️ ${nbVotes} vote${nbVotes > 1 ? "s" : ""}` }
  };
  const components = cands.length ? [{ type: 1, components: [{ type: 3, custom_id: `v:${etat.session.id}`, placeholder: "Mon MVP de la soirée…", min_values: 1, max_values: 1,
    options: cands.map(c => ({ label: court(nomCourt(c.pseudo), 100), value: c.id, description: court(ligneStats(parEA.get(c.ea)) || (c.ea ? "EA : " + c.ea : "Pas de stats EA liées"), 100) })) }] }] : [];
  return { embeds: [embed], components };
}
function embedCompo(c) {
  const grp = { Gardien: [], Défense: [], Milieu: [], Attaque: [] };
  for (const j of c.joueurs) grp[LIGNE[j.poste] || "Milieu"].push(`\`${j.poste.padEnd(3)}\` ${j.discord ? `<@${j.discord}>` : j.ea || "*à placer*"}`);
  return {
    title: `📋 ${court(c.nom, 200)}`, color: AMBRE,
    description: [c.formation, c.sessionTitre].filter(Boolean).join(" · "),
    fields: [...Object.entries(grp).filter(([, l]) => l.length).map(([k, l]) => ({ name: k, value: court(l.join("\n"), 1000), inline: true })),
      ...(c.banc?.length ? [{ name: "Banc", value: court(c.banc.join(" · "), 1000) }] : [])],
    image: { url: "attachment://compo.png" }, footer: { text: "Compo publiée depuis Wolfs Vestiaire" }
  };
}
async function imageCompo(c) {
  try { const { png } = await import("./png.js"); return await png(compoSVG(c)); }
  catch (e) { console.log("rendu image impossible", e.message); return null; }
}
/* Pseudo du serveur nettoyé : « CO GM /Zayko/BU/MD » → « Zayko/BU/MD », « Kiiim - GM » → « Kiiim ».
   On garde le nom + les postes (le Sheet s'en sert), on retire les grades (GM, CO-GM, modo…). */
const POSTES = new Set(["G", "GB", "DC", "DG", "DD", "DLG", "DLD", "MDC", "MC", "MG", "MD", "MOC", "AG", "AD", "BU", "AT", "ATT", "AC", "PIV"]);
const GRADE = /^(co[\s-]*gm|gm|co|cap(itaine)?|capi|vice[\s-]*cap|modo|mod[ée]rateur|admin|staff|coach|manager|x2rue|plk|wolfs?)$/i;
export function pseudoPropre(brut, secours) {
  const t = String(brut || "").split(/\s*[\/|•·]\s*|\s+[-–—]\s+/).map(x => x.trim()).filter(Boolean);
  const nom = t.find(x => !GRADE.test(x) && !POSTES.has(x.toUpperCase()));
  const postes = t.filter(x => POSTES.has(x.toUpperCase())).map(x => x.toUpperCase());
  const base = nom && !/mod[ée]rateur|admin/i.test(nom) ? nom : (secours || nom || String(brut || "?"));
  return [base, ...postes].join("/");
}
const utilisateur = it => { const u = it.member?.user || it.user || {}; const secours = u.global_name || u.username || ""; return { id: u.id, pseudo: pseudoPropre(it.member?.nick || secours, secours) }; };
const option = (it, n) => (it.data.options || []).find(o => o.name === n)?.value;

/* ------------------------------------------------------------ interactions */
async function interaction(it, env, ctx) {
  const user = utilisateur(it);
  if (it.type === 2) { // commande
    const nom = it.data.name;
    if (nom === "dispo") {
      const titre = String(option(it, "titre") || "Session").slice(0, 120);
      const { texte, ts } = dateSession(option(it, "date"), option(it, "heure"));
      const sid = "s" + Date.now().toString(36);
      const etat = { session: { id: sid, titre, date: texte, comp: option(it, "competition") || "", statut: "ouverte" }, present: [], absent: [], indecis: [] };
      ctx.waitUntil((async () => {
        try {
          await new Promise(r => setTimeout(r, 1500));
          const msg = await rest(env, "GET", `/webhooks/${env.DISCORD_APP_ID}/${it.token}/messages/@original`).catch(() => null);
          await gs(env, "session_creer", { id: sid, titre, date: texte, comp: etat.session.comp, salon: it.channel_id, message: msg?.id || "", par: user.id });
        } catch (e) { await suivi(env, it.token, { content: "⚠️ Session non enregistrée : " + e.message, flags: EPHEMERE }).catch(() => {}); }
      })());
      return json({ type: T.MESSAGE, data: { embeds: [embedDispo(etat)], components: boutonsDispo(sid), allowed_mentions: { parse: [] } } });
    }
    if (nom === "mvp") {
      ctx.waitUntil((async () => {
        try {
          const r = await gs(env, "vote_ouvrir", { minutes: option(it, "minutes") || 10 });
          if (!r.etat.present.length) { await editerReponse(env, it.token, { content: `Personne n'est noté présent pour **${r.etat.session.titre}** : impossible d'ouvrir le vote.` }); return; }
          const m = await editerReponse(env, it.token, messageVote(r.etat, r.stats, r.fin, 0));
          await gs(env, "vote_message", { session: r.etat.session.id, message: m.id, salon: it.channel_id });
        } catch (e) { await editerReponse(env, it.token, { content: "⚠️ " + e.message }).catch(() => {}); }
      })());
      return json({ type: T.DEFER });
    }
    if (nom === "classement") {
      ctx.waitUntil((async () => {
        try { const r = await gs(env, "classement", { periode: option(it, "periode") || "semaine" }); await editerReponse(env, it.token, { embeds: [embedClassement(r)] }); }
        catch (e) { await editerReponse(env, it.token, { content: "⚠️ " + e.message }).catch(() => {}); }
      })());
      return json({ type: T.DEFER });
    }
    if (nom === "lier") {
      ctx.waitUntil((async () => {
        try { const r = await gs(env, "lier", { user, ea: option(it, "pseudo_ea"), postes: option(it, "postes") || "" }); await editerReponse(env, it.token, { content: `✅ Lié : **${nomCourt(user.pseudo)}** ↔ EA **${r.membre.ea || "—"}**${r.membre.postes ? ` · postes : ${r.membre.postes}` : ""}. Tes stats suivront dans la compo.` }); }
        catch (e) { await editerReponse(env, it.token, { content: "⚠️ " + e.message }).catch(() => {}); }
      })());
      return json({ type: T.DEFER, data: { flags: EPHEMERE } });
    }
    if (nom === "compo") {
      ctx.waitUntil((async () => {
        try {
          const r = await gs(env, "derniere_compo"); const c = r.compo; const img = await imageCompo(c);
          const e = embedCompo(c); if (!img) delete e.image;
          await editerReponse(env, it.token, { embeds: [e] }, img ? [{ nom: "compo.png", data: img }] : null);
        } catch (e) { await editerReponse(env, it.token, { content: "⚠️ " + e.message }).catch(() => {}); }
      })());
      return json({ type: T.DEFER });
    }
    return json({ type: T.MESSAGE, data: { content: "Commande inconnue.", flags: EPHEMERE } });
  }
  if (it.type === 3) { // bouton ou menu
    const [k, sid, rep] = String(it.data.custom_id).split(":");
    if (k === "d") {
      const em0 = it.message?.embeds?.[0]; const tsSess = Number((String(em0?.description || "").match(/<t:(\d+):/) || [])[1] || 0) * 1000;
      if (tsSess && Date.now() >= tsSess) {
        ctx.waitUntil(fermerDispos(env, sid, it.channel_id, it.message.id, em0).catch(e => console.log("fermeture", e.message)));
        return json({ type: T.MESSAGE, data: { content: "⏰ Les dispos sont fermées : l'heure de la session est passée.", flags: EPHEMERE } });
      }
      ctx.waitUntil((async () => {
        try {
          const r = await gs(env, "dispo", { session: sid, user, rep });
          if (r.etat) await editerReponse(env, it.token, { embeds: [embedDispo(r.etat)], components: boutonsDispo(sid, r.etat.session.statut === "fermée") });
          else await suivi(env, it.token, { content: "Session en cours d'enregistrement, réessaie dans quelques secondes.", flags: EPHEMERE });
        } catch (e) { await suivi(env, it.token, { content: "⚠️ " + e.message, flags: EPHEMERE }).catch(() => {}); }
      })());
      const vite = dispoInstantanee(it.message?.embeds?.[0], user.pseudo, rep);
      return json(vite ? { type: T.UPDATE, data: { embeds: [vite], components: it.message.components } } : { type: T.DEFER_UPDATE });
    }
    if (k === "v") {
      const pour = it.data.values?.[0];
      ctx.waitUntil((async () => {
        try {
          const r = await gs(env, "vote", { session: sid, user, pour });
          const choix = (it.message?.components?.[0]?.components?.[0]?.options || []).find(o => o.value === pour);
          await editerReponse(env, it.token, { content: `✅ Vote enregistré pour **${choix?.label || "ton choix"}**. Tu peux changer d'avis jusqu'à la fin.` });
          const em = it.message?.embeds?.[0];
          if (em) { em.footer = { text: `🗳️ ${r.nb} vote${r.nb > 1 ? "s" : ""}` }; await rest(env, "PATCH", `/channels/${it.channel_id}/messages/${it.message.id}`, { embeds: [em] }).catch(() => {}); }
        } catch (e) { await editerReponse(env, it.token, { content: "⚠️ " + e.message }).catch(() => {}); }
      })());
      return json({ type: T.DEFER, data: { flags: EPHEMERE } });
    }
  }
  return json({ type: T.MESSAGE, data: { content: "Action inconnue.", flags: EPHEMERE } });
}
function embedClassement(r) {
  const med = ["🥇", "🥈", "🥉"]; const titre = { semaine: "de la semaine", mois: "du mois", total: "depuis le début" }[r.periode] || "";
  return {
    title: `🏆 Classement MVP ${titre}`, color: OR,
    description: r.classement.length ? r.classement.slice(0, 15).map((p, i) => `${med[i] || `**${i + 1}.**`} ${nomCourt(p.pseudo)} — **${p.mvp} MVP** · ${p.voix} voix`).join("\n") : "Aucun vote pour l'instant.",
    fields: r.assidus?.length ? [{ name: "💪 Les plus présents", value: r.assidus.filter(a => a.presences).map(a => `${nomCourt(a.pseudo)} (${a.presences})`).join(" · ") || "—" }] : [],
    footer: { text: `${r.sessions} session${r.sessions > 1 ? "s" : ""} sur la période` }
  };
}

/* ------------------------------------------------------------ tâches planifiées */
/* Bloque les boutons d'un message de dispos (et marque la session fermée dans le Sheet). */
export async function fermerDispos(env, sid, salon, message, embed) {
  const e = embed ? { ...embed, footer: { text: "🔒 Dispos fermées · l'heure de la session est passée" } } : undefined;
  await rest(env, "PATCH", `/channels/${salon}/messages/${message}`, { ...(e ? { embeds: [e] } : {}), components: boutonsDispo(sid, true) });
  await gs(env, "session_statut", { id: sid, statut: "fermée" }).catch(() => {});
}
/* Sessions dont l'heure vient de passer : on ferme leurs dispos (vérifié à chaque passage, 6 h max après l'heure). */
async function fermerSessionsPassees(env) {
  const r = await gs(env, "sessions"); const now = Date.now(); let n = 0;
  for (const s of r.sessions || []) {
    const ts = lireDate(s.date); if (!ts || ts > now || now - ts > 6 * 3600e3) continue;
    const e = (await gs(env, "session", { id: s.id })).etat; const ss = e?.session;
    if (!ss || ss.statut !== "ouverte" || !ss.salon || !ss.message) continue;
    await rest(env, "PATCH", `/channels/${ss.salon}/messages/${ss.message}`, { embeds: [{ ...embedDispo({ ...e, session: { ...ss, statut: "fermée" } }), footer: { text: "🔒 Dispos fermées · l'heure de la session est passée" } }], components: boutonsDispo(s.id, true) });
    await gs(env, "session_statut", { id: s.id, statut: "fermée" }); n++;
  }
  return n;
}

export async function taches(env) {
  await fermerSessionsPassees(env).catch(e => console.log("fermeture sessions", e.message));
  const r = await gs(env, "taches");
  for (const c of r.compos) {
    try {
      if (!c.salon) throw new Error("aucun salon : créez d'abord une session avec /dispo");
      const img = await imageCompo(c); const e = embedCompo(c); if (!img) delete e.image;
      const ids = [...new Set(c.joueurs.map(j => j.discord).filter(Boolean))];
      const m = await rest(env, "POST", `/channels/${c.salon}/messages`, { content: `📋 **La compo est tombée !** ${ids.map(i => `<@${i}>`).join(" ")}`, embeds: [e], allowed_mentions: { users: ids } }, img ? [{ nom: "compo.png", data: img }] : null);
      await gs(env, "compo_publiee", { ligne: c.ligne, message: m.id });
    } catch (e) { await gs(env, "compo_publiee", { ligne: c.ligne, erreur: e.message.slice(0, 200) }).catch(() => {}); }
  }
  for (const rp of r.rappels) {
    try {
      if (!rp.salon) continue; const ts = lireDate(rp.date);
      const parts = [`⏰ **${rp.titre}** commence <t:${Math.floor(ts / 1000)}:R> !`];
      if (rp.manquants.length) parts.push(`Pas encore répondu : ${rp.manquants.map(i => `<@${i}>`).join(" ")}`);
      if (rp.indecis.length) parts.push(`Encore indécis : ${rp.indecis.map(i => `<@${i}>`).join(" ")} — confirmez svp 🙏`);
      if (parts.length === 1) parts.push("Tout le monde a répondu 👌");
      await rest(env, "POST", `/channels/${rp.salon}/messages`, { content: parts.join("\n"), allowed_mentions: { users: [...rp.manquants, ...rp.indecis].slice(0, 100) }, ...(rp.message ? { message_reference: { message_id: rp.message, fail_if_not_exists: false } } : {}) });
    } catch (e) { console.log("rappel", e.message); }
  }
  for (const v of r.votes) {
    try {
      const s = v.session; if (!s.salon) continue;
      if (s.voteMsg) await rest(env, "PATCH", `/channels/${s.salon}/messages/${s.voteMsg}`, { components: [] }).catch(() => {});
      const med = ["🥇", "🥈", "🥉"]; const cl = v.classement;
      const gagnants = cl.filter(x => cl.length && x.voix === cl[0].voix);
      await rest(env, "POST", `/channels/${s.salon}/messages`, {
        content: gagnants.length ? `🏆 ${gagnants.map(g => `<@${g.id}>`).join(" et ")} ${gagnants.length > 1 ? "sont élus MVP" : "est élu MVP"} de **${s.titre}** !` : `Vote MVP terminé pour **${s.titre}** : aucun vote.`,
        embeds: cl.length ? [{ title: "Résultat du vote", color: OR, description: cl.slice(0, 5).map((x, i) => `${med[i] || `**${i + 1}.**`} ${nomCourt(x.pseudo)} — ${x.voix} voix`).join("\n"), fields: tableauStats(v.stats) ? [{ name: "📊 Stats EA de la soirée", value: tableauStats(v.stats) }] : [], footer: { text: `${v.total} vote${v.total > 1 ? "s" : ""}` } }] : [],
        allowed_mentions: { users: gagnants.map(g => g.id) },
        ...(s.voteMsg ? { message_reference: { message_id: s.voteMsg, fail_if_not_exists: false } } : {})
      });
    } catch (e) { console.log("vote", e.message); }
  }
  return { compos: r.compos.length, rappels: r.rappels.length, votes: r.votes.length };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET") return new Response("Bot Wolfs en ligne ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (url.pathname === "/bulletin" && req.method === "POST") {
      if (!env.CLE || req.headers.get("x-cle") !== env.CLE) return new Response("Clé invalide", { status: 401 });
      try { return json(await posterBulletin(env, await req.json().catch(() => ({})))); }
      catch (e) { return json({ ok: false, erreur: e.message }, 500); }
    }
    if (url.pathname !== "/interactions" || req.method !== "POST") return new Response("Introuvable", { status: 404 });
    const body = await req.text();
    if (!(await signatureOk(req, body, env.DISCORD_PUBLIC_KEY))) return new Response("Signature invalide", { status: 401 });
    const it = JSON.parse(body);
    if (it.type === 1) return json({ type: T.PONG });
    try { return await interaction(it, env, ctx); }
    catch (e) { return json({ type: T.MESSAGE, data: { content: "⚠️ " + e.message, flags: EPHEMERE } }); }
  },
  async scheduled(_ev, env, ctx) { ctx.waitUntil(taches(env).catch(e => console.log("tâches", e.message))); }
};

/* ------------------------------------------------------------ bulletin de la semaine */
const ECUSSON = "https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l99160204.png";
export function messageBulletin(b) {
  const v = b.v || 0, d = b.d || 0;
  const lignes = [`**${v}V · ${b.n || 0}N · ${d}D** sur ${b.matchs} match${b.matchs > 1 ? "s" : ""} · ${b.bp || 0} buts pour, ${b.bc || 0} contre`];
  if (b.joueur) lignes.push(`🏆 Joueur de la semaine : **${nomCourt(b.joueur.n)}** (${Number(b.joueur.note).toFixed(2)})`);
  if (b.records?.length) lignes.push(`🔥 ${b.records.length} record${b.records.length > 1 ? "s" : ""} du club battu${b.records.length > 1 ? "s" : ""}`);
  if (b.mvp?.length) lignes.push(`🗳️ MVP votés par l'équipe : ${b.mvp.map(x => `<@${x.id}> ×${x.nb}`).join(" · ")}`);
  return {
    flags: 1 << 15, allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: v > d ? VERT : d > v ? ROUGE : AMBRE, components: [
      { type: 9, components: [{ type: 10, content: `## 📰 Bulletin de la semaine\n-# X2RUE PLK WOLfS · du ${b.debut} au ${b.fin}` }], accessory: { type: 11, media: { url: ECUSSON } } },
      { type: 12, items: [{ media: { url: "attachment://bulletin.png" }, description: `Bulletin du ${b.debut} au ${b.fin}` }] },
      { type: 10, content: lignes.join("\n") },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: "-# Bulletin automatique chaque lundi matin · tout le détail dans Wolfs Vestiaire" }
    ] }]
  };
}
export async function posterBulletin(env, o = {}) {
  const r = await gs(env, "bulletin", o.fin ? { fin: o.fin } : {}); const b = r.bulletin;
  if (!b || !b.matchs) return { ok: true, matchs: 0, debut: b?.debut, fin: b?.fin, diag: b?.diag };
  const salon = o.salon || env.SALON_BULLETIN; if (!salon) throw new Error("aucun salon pour le bulletin");
  const { png } = await import("./png.js");
  const img = await png(bulletinSVG(b));
  const m = await rest(env, "POST", `/channels/${salon}/messages`, messageBulletin(b), [{ nom: "bulletin.png", data: img }]);
  return { ok: true, matchs: b.matchs, message: m?.id };
}
