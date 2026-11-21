// Outfit probe: each outfit x a few scenes x the same seeds, on your own ComfyUI, and a contact sheet to look at.
// Is it the same dress on every frame? Do the outfits differ at a glance? Does a long description break the pose?
//   npx tsx tools/outfit-probe.ts [--comfy http://127.0.0.1:8188] [--out outfit-probe] [--seeds 4] [--outfits modest,fitted,revealing,daring] [--cast default]
// Progress: one line per picture in the console, and the sheet (index.html) is rewritten after every picture.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promptFor } from "../packages/base/src";
import type { SceneDesc } from "../packages/core/src";
import { comfyRender, DEFAULT_DRAW } from "./gen/comfy";

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const COMFY = opt("comfy", "http://127.0.0.1:8188");
const OUT = opt("out", "outfit-probe");
const SEEDS = Array.from({ length: Number(opt("seeds", "4")) }, (_, i) => 1000 + i * 7919);
const OUTFITS = opt("outfits", "modest,fitted,revealing,daring").split(",");
const CAST = opt("cast", "default");
const wife = { id: "wife", role: "wife" }, guest = { id: "p1", role: "patron" };
// dressed in the hall; her top off for a flash; an act with the outfit pushed aside
const ONLY = opt("scenes", "");
const SCENES_ALL: { id: string; desc: (o: string) => SceneDesc }[] = [
  { id: "idle", desc: (o) => ({ type: "idle", location: "cafe.hall", participants: [wife], tags: { outfit: o } }) },
  { id: "flash", desc: (o) => ({ type: "flash", location: "cafe.hall", participants: [wife], tags: { outfit: o, bare: "top" } }) },
  { id: "patron_sex", desc: (o) => ({ type: "patron_sex", location: "hotel.room1", participants: [wife, guest], tags: { outfit: o, size: "3" } }) },
];
const SCENES = ONLY ? SCENES_ALL.filter((s) => ONLY.split(",").includes(s.id)) : SCENES_ALL;
mkdirSync(OUT, { recursive: true });
type Cell = { outfit: string; scene: string; seed: number; file: string; prompt: string };
const done: Cell[] = [];
const sheet = () => {
  const rows = SCENES.flatMap((s) =>
    OUTFITS.map((o) => {
      const cells = done.filter((c) => c.outfit === o && c.scene === s.id);
      return `<tr><th>${s.id}<br>${o}</th>${cells.map((c) => `<td><img src="${c.file}" title="${c.prompt.replace(/"/g, "&quot;")}"></td>`).join("")}</tr>`;
    }),
  );
  writeFileSync(join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><title>outfit probe</title><style>body{background:#111;color:#ddd;font:13px sans-serif}td img{height:300px}th{text-align:left;vertical-align:top;width:90px}</style><p>${done.length}/${SCENES.length * OUTFITS.length * SEEDS.length} - hover a picture for its prompt</p><table>${rows.join("")}</table>`);
};
const total = SCENES.length * OUTFITS.length * SEEDS.length;
for (const s of SCENES)
  for (const o of OUTFITS)
    for (const seed of SEEDS) {
      const p = promptFor(s.desc(o), CAST);
      const file = `${s.id}_${o}_${seed}.png`;
      const t0 = Date.now();
      const png = await comfyRender(COMFY, p.positive, p.negative, seed, "832x1216", "outfit-probe/x", DEFAULT_DRAW);
      writeFileSync(join(OUT, file), png);
      done.push({ outfit: o, scene: s.id, seed, file, prompt: p.positive });
      sheet();
      console.log(`${done.length}/${total}  ${file}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
console.log(`sheet: ${join(OUT, "index.html")}`);
