// Vérifie que l'image de la compo se génère (même code que dans le Worker).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { compoSVG } from "../src/rendu.js";
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
