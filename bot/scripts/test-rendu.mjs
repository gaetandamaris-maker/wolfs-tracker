// Vérifie que l'image de la compo se génère (même code que dans le Worker).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { compoSVG, bulletinSVG } from "../src/rendu.js";
const require = createRequire(import.meta.url);
await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
const polices = ["Barlow-Bold", "Barlow-SemiBold", "BarlowCondensed-ExtraBold"].map(f => new Uint8Array(readFileSync(`fonts/${f}.ttf`)));
const c = { nom: "Compo test", formation: "4-3-3", sessionTitre: "VFT - Mercredi · 28/10/2026 20:45", banc: ["Soonick91", "JorisBoc"],
  dessins: [{ t: "course", p: [15, 60, 30, 25] }, { t: "passe", p: [50, 55, 80, 25] }, { t: "zone", p: [60, 8, 90, 20] }],
  joueurs: [["G", 50, 91, "KPRI_SUNDAY", "Shot Stopper"], ["DG", 13, 70, "SuprMess_", "Boss"], ["DC", 36, 76, "amg23233", "Boss"], ["DC", 64, 76, "Mkr-clmt", "Boss"], ["DD", 87, 70, "Jay34143", ""],
    ["MC", 28, 50, "chocolinex", "Target"], ["MC", 50, 54, "Usl kiki94", "Finisher"], ["MC", 72, 50, "", ""], ["AG", 15, 22, "clxpzcheexZFR-_-", "Finisher"], ["BU", 50, 15, "XX-THEO-XX63", "Finisher"], ["AD", 85, 22, "Nissa06_", "Finisher"]]
    .map(([poste, x, y, ea, arch]) => ({ poste, x, y, ea, arch })) };
const png = new Resvg(compoSVG(c), { fitTo: { mode: "width", value: 1000 }, font: { fontBuffers: polices, loadSystemFonts: false, defaultFontFamily: "Barlow" } }).render().asPng();
mkdirSync("dist", { recursive: true }); writeFileSync("dist/compo-test.png", png);
console.log("Image de test :", png.length, "octets");
if (png.length < 20000) process.exit(1);

// Bulletin de la semaine (données d'exemple)
const bull = {"debut": "20/10", "fin": "26/10", "matchs": 8, "v": 4, "n": 0, "d": 4, "bp": 21, "bc": 18, "parType": {"Amical": {"m": 4, "v": 3}, "Ligue": {"m": 4, "v": 1}}, "joueur": {"n": "xTeuma10", "mj": 7, "note": 7.89, "b": 4, "pd": 5, "hdm": 1, "aer": 16, "lignes": {"Milieu": 6, "Attaquant": 1}, "ligne": "Milieu"}, "equipe": [{"ligne": "Gardien", "joueurs": [{"n": "KPRI_SUNDAY", "note": 6.77, "mj": 7}]}, {"ligne": "Défenseur", "joueurs": [{"n": "JorisBoc", "note": 7.23, "mj": 4}, {"n": "Bannou I6I", "note": 7.2, "mj": 3}, {"n": "amg23233", "note": 7.12, "mj": 4}]}, {"ligne": "Milieu", "joueurs": [{"n": "xTeuma10", "note": 7.89, "mj": 7}, {"n": "Amonix5826", "note": 7.45, "mj": 6}, {"n": "XX-THEO-XX63", "note": 7.25, "mj": 4}]}, {"ligne": "Attaquant", "joueurs": [{"n": "Jay34143", "note": 6.1, "mj": 4}]}], "buteurs": [{"n": "xTeuma10", "b": 4, "pd": 5}, {"n": "chocolinex", "b": 3, "pd": 5}, {"n": "KPRI_SUNDAY", "b": 2, "pd": 1}], "enForme": [{"n": "amg23233", "note": 7.12, "avant": 6.73, "delta": 0.39}, {"n": "XX-THEO-XX63", "note": 7.25, "avant": 7.05, "delta": 0.2}], "enBaisse": [], "records": [{"lib": "Meilleure note", "val": "10.0", "ancien": "9.4", "n": "xTeuma10", "adv": "Bled ST"}, {"lib": "Le plus de passes D", "val": 3, "ancien": 2, "n": "chocolinex", "adv": "BRONX UNITED"}, {"lib": "Passes réussies", "val": 139, "ancien": 27, "n": "chocolinex", "adv": "Chicken Run"}, {"lib": "Tacles gagnés", "val": 12, "ancien": 4, "n": "chocolinex", "adv": "Fc Piatella"}], "serieV": 3, "skill": {"debut": 1420, "fin": 1363, "divDebut": 6, "divFin": 6}, "mvp": []};
const pngB = new Resvg(bulletinSVG(bull), { fitTo: { mode: "width", value: 1000 }, font: { fontBuffers: polices, loadSystemFonts: false, defaultFontFamily: "Barlow" } }).render().asPng();
writeFileSync("dist/bulletin-test.png", pngB);
console.log("Bulletin de test :", pngB.length, "octets");
if (pngB.length < 20000) process.exit(1);
