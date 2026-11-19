// Puts the same picture keys from several runs side by side in one folder (names end in ~<label><n>), for lab-pack.
//   node tools/compare-runs.mjs <out dir> <plan.json> <label>=<run dir>[,<run dir>...] ...
// The first run dir of a label that has the file wins (e.g. wai=probe-3,probe-2: husband scenes from the fixed run).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, planFile, ...specs] = process.argv.slice(2);
if (!out || !planFile || !specs.length) { console.log("node tools/compare-runs.mjs <out> <plan.json> label=dir[,dir] ..."); process.exit(1); }
const rows = JSON.parse(readFileSync(planFile, "utf8")).plan;
mkdirSync(out, { recursive: true });
let n = 0;
for (const spec of specs) {
  const [label, dirs] = spec.split("=");
  for (const r of rows)
    for (let i = 1; i <= 8; i++) {
      const name = `${r.file.replace(/\.png$/, "")}~${i}.png`;
      const src = dirs.split(",").map((d) => join(d, name)).find((f) => existsSync(f));
      if (!src) continue;
      copyFileSync(src, join(out, `${r.file.replace(/\.png$/, "")}~${label}${i}.png`));
      n++;
    }
}
writeFileSync(join(out, "prompts.json"), JSON.stringify(rows, null, 1));
console.log(`${n} pictures of ${rows.length} keys -> ${out}`);
