// Outils Discord : vérification de signature, appels REST, réponses d'interaction.
export const API = "https://discord.com/api/v10";
export const T = { PONG: 1, MESSAGE: 4, DEFER: 5, DEFER_UPDATE: 6, UPDATE: 7 };
export const EPHEMERE = 64;

const hex = h => new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)));

export async function signatureOk(req, body, cle) {
  const sig = req.headers.get("x-signature-ed25519"), ts = req.headers.get("x-signature-timestamp");
  if (!sig || !ts || !cle) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(cle), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
  } catch (_) { return false; }
}

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/* Appel REST avec le token du bot (messages hors interaction : rappels, compos, résultats). */
export async function rest(env, method, path, body, fichiers) {
  const headers = { Authorization: "Bot " + env.DISCORD_TOKEN, "User-Agent": "WolfsBot (https://github.com/gaetandamaris-maker/wolfs-tracker, 1.0)" };
  let payload;
  if (fichiers && fichiers.length) {
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ ...body, attachments: fichiers.map((f, i) => ({ id: i, filename: f.nom })) }));
    fichiers.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.data], { type: f.type || "image/png" }), f.nom));
    payload = fd;
  } else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  for (let essai = 0; essai < 3; essai++) {
    const r = await fetch(API + path, { method, headers, body: payload });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise(res => setTimeout(res, Math.min(5000, (j.retry_after || 1) * 1000))); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error(`Discord ${r.status} ${path} : ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
  }
  throw new Error("Discord : trop de requêtes");
}

/* Modifier la réponse d'une interaction (valable 15 min, sans token de bot). */
export async function editerReponse(env, token, body, fichiers) {
  return webhook(env, "PATCH", `/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, body, fichiers);
}
export async function suivi(env, token, body) {
  return webhook(env, "POST", `/webhooks/${env.DISCORD_APP_ID}/${token}`, body);
}
async function webhook(env, method, path, body, fichiers) {
  let payload, headers = {};
  if (fichiers && fichiers.length) {
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ ...body, attachments: fichiers.map((f, i) => ({ id: i, filename: f.nom })) }));
    fichiers.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.data], { type: "image/png" }), f.nom));
    payload = fd;
  } else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(API + path + "?wait=true", { method, headers, body: payload });
  const t = await r.text();
  if (!r.ok) throw new Error(`Discord ${r.status} : ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
