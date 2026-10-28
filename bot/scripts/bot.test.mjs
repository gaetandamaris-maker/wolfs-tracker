// Tests de la logique du bot, sans réseau : Discord et le Google Sheet sont simulés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nuitCalme } from "../src/discord.js";
import worker, { dateSession, lireDate, embedDispo, messageVote, taches, dispoInstantanee, pseudoPropre, messageBulletin } from "../src/index.js";

const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", kp.publicKey)).toString("hex");
const env = { DISCORD_PUBLIC_KEY: pub, DISCORD_APP_ID: "app1", DISCORD_TOKEN: "tok", APPS_SCRIPT_URL: "https://script.test/exec", CLE: "K" };

const appels = [];
let reponsesSheet = {};
globalThis.fetch = async (url, opt = {}) => {
  const body = typeof opt.body === "string" ? opt.body : opt.body instanceof FormData ? JSON.parse(opt.body.get("payload_json")) : null;
  appels.push({ url: String(url), method: opt.method || "GET", body });
  if (String(url).startsWith(env.APPS_SCRIPT_URL)) { const b = JSON.parse(body); const r = reponsesSheet[b.bot.action]; return new Response(JSON.stringify({ v: 1, ...(typeof r === "function" ? r(b.bot) : r || { ok: true }) })); }
  return new Response(JSON.stringify({ id: "msg1" }), { status: 200 });
};
async function req(obj) {
  const body = JSON.stringify(obj); const ts = String(Math.floor(Date.now() / 1000));
  const sig = Buffer.from(await crypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(ts + body))).toString("hex");
  return new Request("https://bot.test/interactions", { method: "POST", body, headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts } });
}
const ctx = () => { const p = []; return { waitUntil: x => p.push(x), fini: () => Promise.all(p) }; };

test("signature : refusée si fausse, PING accepté", async () => {
  const bad = new Request("https://bot.test/interactions", { method: "POST", body: "{}", headers: { "x-signature-ed25519": "00".repeat(64), "x-signature-timestamp": "1" } });
  assert.equal((await worker.fetch(bad, env, ctx())).status, 401);
  const r = await worker.fetch(await req({ type: 1 }), env, ctx());
  assert.deepEqual(await r.json(), { type: 1 });
});

test("dates de session", () => {
  const ref = Date.UTC(2026, 9, 27, 15, 0); // mardi 27/10/2026 16h Paris
  assert.equal(dateSession("28/10", "20h45", ref).texte, "28/10/2026 20:45");
  assert.equal(dateSession("demain", "21h", ref).texte, "28/10/2026 21:00");
  assert.equal(dateSession("vendredi", "21:30", ref).texte, "30/10/2026 21:30");
  assert.equal(dateSession("ce soir", "20h", ref).texte, "27/10/2026 20:00");
  assert.equal(dateSession("03/01", "20h", ref).texte, "03/01/2027 20:00");
  assert.throws(() => dateSession("n'importe", "20h", ref));
  assert.equal(new Date(lireDate("28/10/2026 20:45")).toISOString(), "2026-10-28T19:45:00.000Z"); // heure d'hiver
  assert.equal(new Date(lireDate("15/07/2026 20:45")).toISOString(), "2026-07-15T18:45:00.000Z"); // heure d'été
});

test("/dispo : message avec 3 boutons puis session enregistrée", async () => {
  appels.length = 0; const c = ctx();
  const r = await worker.fetch(await req({ type: 2, token: "T1", channel_id: "chan", member: { nick: "Chocolinex/CO-GM", user: { id: "u1", username: "choco" } }, data: { name: "dispo", options: [{ name: "titre", value: "VFT - Mercredi" }, { name: "date", value: "28/10" }, { name: "heure", value: "20h45" }, { name: "competition", value: "VFT" }] } }), env, c);
  const j = await r.json(); assert.equal(j.type, 4);
  assert.equal(j.data.components[0].components.length, 3);
  assert.match(j.data.embeds[0].title, /VFT - Mercredi/);
  await c.fini();
  const gs = appels.find(a => a.url === env.APPS_SCRIPT_URL); const b = JSON.parse(gs.body).bot;
  assert.equal(b.action, "session_creer"); assert.equal(b.salon, "chan"); assert.equal(b.message, "msg1"); assert.equal(b.date, "28/10/2026 20:45");
});

test("bouton Présent : mise à jour différée du message", async () => {
  appels.length = 0; const c = ctx();
  reponsesSheet.dispo = b => ({ ok: true, etat: { session: { id: b.session, titre: "VFT", date: "28/10/2026 20:45", comp: "", statut: "ouverte" }, present: [{ id: "u1", pseudo: b.user.pseudo, ea: "chocolinex" }], absent: [], indecis: [] } });
  const r = await worker.fetch(await req({ type: 3, token: "T2", channel_id: "chan", member: { nick: "Kiki /BU/MOC", user: { id: "u2" } }, message: { id: "m" }, data: { custom_id: "d:s1:present" } }), env, c);
  assert.equal((await r.json()).type, 6);
  await c.fini();
  const patch = appels.find(a => a.method === "PATCH"); assert.match(patch.url, /webhooks\/app1\/T2\/messages\/@original/);
  assert.match(patch.body, /Présents \(1\)/); assert.match(patch.body, /Kiki/);
});

test("vote MVP : menu des présents avec leurs stats", () => {
  const etat = { session: { id: "s1", titre: "VFT" }, present: [{ id: "u1", pseudo: "Chocolinex/CO-GM", ea: "chocolinex" }, { id: "u2", pseudo: "Kiki", ea: "" }], absent: [], indecis: [] };
  const m = messageVote(etat, [{ ea: "chocolinex", note: 7.84, b: 1, pd: 2, hdm: 1 }], Date.now() + 6e5);
  const opts = m.components[0].components[0].options;
  assert.equal(opts[0].label, "Chocolinex"); assert.match(opts[0].description, /7\.8/); assert.equal(opts[1].description, "Pas de stats EA liées");
});

test("tâches : compo publiée, rappel, résultat du vote", async () => {
  appels.length = 0;
  reponsesSheet.taches = { ok: true,
    compos: [{ ligne: 5, nom: "Compo", formation: "4-3-3", salon: "chan", sessionTitre: "VFT", banc: [], dessins: [], joueurs: [{ poste: "G", x: 50, y: 91, ea: "KPRI_SUNDAY", discord: "u9", arch: "" }, { poste: "MC", x: 28, y: 50, ea: "chocolinex", discord: "u1", arch: "Target" }] }],
    rappels: [{ session: "s1", titre: "VFT", date: "28/10/2026 20:45", salon: "chan", message: "m0", manquants: ["u3"], indecis: ["u4"] }],
    votes: [{ session: { id: "s1", titre: "VFT", salon: "chan", voteMsg: "mv" }, classement: [{ id: "u1", pseudo: "Choco", voix: 3 }, { id: "u2", pseudo: "Kiki", voix: 1 }], total: 4, stats: [] }] };
  const r = await taches(env);
  assert.deepEqual(r, { compos: 1, rappels: 1, votes: 1 });
  const posts = appels.filter(a => a.method === "POST" && a.url.includes("/channels/chan/messages"));
  assert.equal(posts.length, 3);
  const B = p => typeof p.body === "string" ? JSON.parse(p.body) : p.body;
  assert.match(B(posts[0]).content, /<@u9> <@u1>/); assert.match(JSON.stringify(B(posts[0]).embeds[0]), /<@u1>/);
  assert.match(B(posts[1]).content, /<@u3>/); assert.match(B(posts[1]).content, /<@u4>/);
  assert.match(B(posts[2]).content, /<@u1> est élu MVP/);
  const fin = appels.filter(a => a.url === env.APPS_SCRIPT_URL).map(a => JSON.parse(a.body).bot);
  assert.ok(fin.some(b => b.action === "compo_publiee" && b.ligne === 5 && b.message === "msg1"));
});

test("embed dispo : listes et date longue", () => {
  const e = embedDispo({ session: { titre: "EPL - Lundi", date: "02/11/2026 21:00", comp: "EPL", statut: "ouverte" }, present: [{ pseudo: "Joris/BU/MOC/MC" }], absent: [], indecis: [] });
  assert.match(e.description, /lundi 2 novembre à 21h00/); assert.match(e.fields[0].value, /Joris/); assert.doesNotMatch(e.fields[0].value, /BU/);
});

test("bouton : la liste se met à jour tout de suite, puis le Sheet confirme", async () => {
  appels.length = 0; const c = ctx();
  const em = embedDispo({ session: { titre: "VFT", date: "28/10/2026 20:45", comp: "", statut: "ouverte" }, present: [{ pseudo: "Joris/BU" }], absent: [{ pseudo: "Kiki /BU/MOC" }], indecis: [] });
  reponsesSheet.dispo = b => ({ ok: true, etat: { session: { id: b.session, titre: "VFT", date: "28/10/2026 20:45", comp: "", statut: "ouverte" }, present: [{ pseudo: "Joris/BU" }, { pseudo: "Kiki /BU/MOC" }], absent: [], indecis: [] } });
  const r = await worker.fetch(await req({ type: 3, token: "T3", channel_id: "chan", member: { nick: "Kiki /BU/MOC", user: { id: "u2" } }, message: { id: "m", embeds: [em], components: [] }, data: { custom_id: "d:s1:present" } }), env, c);
  const j = await r.json(); assert.equal(j.type, 7);
  const f = j.data.embeds[0].fields;
  assert.equal(f[0].name, "✅ Présents (2)"); assert.match(f[0].value, /Kiki/); assert.equal(f[2].name, "❌ Absents (0)"); assert.equal(f[2].value, "—");
  await c.fini();
  assert.ok(appels.some(a => a.method === "PATCH" && /Présents \(2\)/.test(a.body)));
});

test("pseudos nettoyés (grades retirés, postes gardés)", () => {
  assert.equal(pseudoPropre("CO GM /Zayko/BU/MD", "z"), "Zayko/BU/MD");
  assert.equal(pseudoPropre("Kiiim - GM", "k"), "Kiiim");
  assert.equal(pseudoPropre("Chocolinex/CO-GM", "c"), "Chocolinex");
  assert.equal(pseudoPropre("Modérateur X2RUE", "vraiNom"), "vraiNom");
  assert.equal(pseudoPropre("XX-THEO-XX63", "x"), "XX-THEO-XX63");
});

test("dispos fermées une fois l'heure passée", async () => {
  appels.length = 0; const c = ctx();
  const em = embedDispo({ session: { titre: "VFT", date: "01/01/2026 20:45", comp: "", statut: "ouverte" }, present: [], absent: [], indecis: [] });
  const r = await worker.fetch(await req({ type: 3, token: "T4", channel_id: "chan", member: { nick: "Kiki", user: { id: "u2" } }, message: { id: "m9", embeds: [em], components: [] }, data: { custom_id: "d:s1:present" } }), env, c);
  const j = await r.json(); assert.equal(j.type, 4); assert.match(j.data.content, /fermées/);
  await c.fini();
  const patch = appels.find(a => a.method === "PATCH" && a.url.includes("/channels/chan/messages/m9"));
  assert.ok(patch); assert.ok(JSON.parse(patch.body).components[0].components.every(b => b.disabled));
  assert.ok(!appels.some(a => a.url === env.APPS_SCRIPT_URL && JSON.parse(a.body).bot.action === "dispo"));
});

test("bulletin : message en composants v2 avec l'image", () => {
  const m = messageBulletin({ debut: "19/10", fin: "25/10", matchs: 9, v: 0, n: 2, d: 7, bp: 10, bc: 20, joueur: { n: "clxpzcheexZFR-_-", note: 7.25 }, mvp: [{ id: "u1", nb: 2 }] });
  assert.equal(m.flags, 32768); assert.equal(m.components[0].type, 17);
  assert.equal(m.components[0].components[1].items[0].media.url, "attachment://bulletin.png");
  assert.match(JSON.stringify(m), /<@u1> ×2/);
});

test("nuit calme : pas de ping entre 23h et 9h (heure de Paris)", () => {
  assert.equal(nuitCalme(Date.UTC(2026, 9, 28, 22, 30)), true);   // 23h30 Paris (hiver)
  assert.equal(nuitCalme(Date.UTC(2026, 9, 28, 7, 59)), true);    // 8h59 Paris
  assert.equal(nuitCalme(Date.UTC(2026, 9, 28, 8, 0)), false);    // 9h00 Paris
  assert.equal(nuitCalme(Date.UTC(2026, 9, 28, 21, 59)), false);  // 22h59 Paris
  assert.equal(nuitCalme(Date.UTC(2026, 6, 15, 21, 0)), true);    // 23h00 Paris (été)
});

test("vote MVP : bouton Clôturer (ouvreur ou modo seulement)", async () => {
  const etat = { session: { id: "s1", titre: "VFT" }, present: [{ id: "u1", pseudo: "Choco", ea: "" }], absent: [], indecis: [] };
  const m = messageVote(etat, [], Date.now() + 6e5, 0, "u1");
  assert.equal(m.components[1].components[0].custom_id, "vc:s1:u1");
  // quelqu'un d'autre, sans droits : refusé
  let c = ctx(); appels.length = 0;
  let r = await worker.fetch(await req({ type: 3, token: "T5", channel_id: "chan", member: { nick: "Kiki", permissions: "0", user: { id: "u2" } }, message: { id: "mv" }, data: { custom_id: "vc:s1:u1" } }), env, c);
  assert.match((await r.json()).data.content, /Seul/); await c.fini();
  assert.ok(!appels.some(a => a.url === env.APPS_SCRIPT_URL));
  // l'ouvreur : résultat annoncé
  reponsesSheet.vote_resultat = { ok: true, session: { id: "s1", titre: "VFT", salon: "chan", voteMsg: "mv" }, classement: [{ id: "u1", pseudo: "Choco", voix: 2 }], total: 2, stats: [] };
  c = ctx(); appels.length = 0;
  r = await worker.fetch(await req({ type: 3, token: "T6", channel_id: "chan", member: { nick: "Choco", permissions: "0", user: { id: "u1" } }, message: { id: "mv" }, data: { custom_id: "vc:s1:u1" } }), env, c);
  assert.equal((await r.json()).type, 6); await c.fini();
  const post = appels.find(a => a.method === "POST" && a.url.endsWith("/channels/chan/messages"));
  assert.match(JSON.parse(post.body).content, /<@u1> est élu MVP/);
  assert.ok(appels.some(a => a.method === "PATCH" && a.url.includes("/messages/mv")));
  // un modo (gérer les messages) peut aussi
  c = ctx(); appels.length = 0;
  r = await worker.fetch(await req({ type: 3, token: "T7", channel_id: "chan", member: { nick: "Modo", permissions: String(1 << 13), user: { id: "u9" } }, message: { id: "mv" }, data: { custom_id: "vc:s1:u1" } }), env, c);
  assert.equal((await r.json()).type, 6); await c.fini();
});
