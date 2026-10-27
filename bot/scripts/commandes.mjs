// Enregistre les commandes du bot et branche l'adresse des interactions (lancé par GitHub Actions).
const { DISCORD_TOKEN, DISCORD_APP_ID, BOT_URL } = process.env;
const H = { Authorization: "Bot " + DISCORD_TOKEN, "content-type": "application/json" };
const STR = 3, INT = 4;
const commandes = [
  { name: "dispo", description: "Créer une session et demander les dispos", options: [
    { type: STR, name: "titre", description: "Ex. VFT - Mercredi", required: true, max_length: 100 },
    { type: STR, name: "date", description: "Ex. 28/10, demain, mercredi", required: true },
    { type: STR, name: "heure", description: "Ex. 20h45", required: true },
    { type: STR, name: "competition", description: "Ex. VFT, EPL, Ligue, Tournoi", required: false, max_length: 40 } ] },
  { name: "mvp", description: "Ouvrir le vote MVP de la dernière session", options: [
    { type: INT, name: "minutes", description: "Durée du vote (10 par défaut)", required: false, min_value: 2, max_value: 180 } ] },
  { name: "classement", description: "Classement MVP", options: [
    { type: STR, name: "periode", description: "Période", required: false, choices: [{ name: "Semaine", value: "semaine" }, { name: "Mois", value: "mois" }, { name: "Depuis le début", value: "total" }] } ] },
  { name: "lier", description: "Relier ton compte Discord à ton pseudo EA (pour tes stats)", options: [
    { type: STR, name: "pseudo_ea", description: "Ton pseudo EA exact, ex. chocolinex", required: true, max_length: 40 },
    { type: STR, name: "postes", description: "Tes postes préférés, ex. MG/MD/MC", required: false, max_length: 60 } ] },
  { name: "compo", description: "Afficher la dernière compo publiée" }
];
const r = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`, { method: "PUT", headers: H, body: JSON.stringify(commandes) });
console.log("Commandes :", r.status, r.ok ? "ok" : await r.text());
if (!r.ok) process.exit(1);
if (BOT_URL) {
  const r2 = await fetch("https://discord.com/api/v10/applications/@me", { method: "PATCH", headers: H, body: JSON.stringify({ interactions_endpoint_url: BOT_URL + "/interactions" }) });
  console.log("Adresse des interactions :", r2.status, r2.ok ? "ok" : await r2.text());
  if (!r2.ok) process.exit(1);
}
