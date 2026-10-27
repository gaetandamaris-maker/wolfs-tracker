// SVG -> PNG dans le Worker (resvg compilé en WebAssembly, polices embarquées).
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import barlowB from "../fonts/Barlow-Bold.ttf";
import barlowS from "../fonts/Barlow-SemiBold.ttf";
import barlowC from "../fonts/BarlowCondensed-ExtraBold.ttf";

let pret = null;
export async function png(svg) {
  if (!pret) pret = initWasm(wasm);
  await pret;
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: 1000 },
    font: { fontBuffers: [new Uint8Array(barlowB), new Uint8Array(barlowS), new Uint8Array(barlowC)], loadSystemFonts: false, defaultFontFamily: "Barlow" }
  });
  return r.render().asPng();
}
