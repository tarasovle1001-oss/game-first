// day 21.11, Alexey 18:27 "clean the old rounds": (a) every frame already thrown out (his drop or Claude's pre) is deleted from disk
// in all rounds; (b) the listed dead rounds (night rounds with the old husband, never screened) lose every frame he did not keep.
//   node tools/prompt-lab/data/clean-rounds.mjs [--go]
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const go = process.argv.includes("--go");
const root = "tools/prompt-lab/data/synth";
const DEAD = { his_close: [3, 5, 6], fd_behind: [5, 7, 8, 9], sixty_nine: [4] };
let a = 0, b = 0, kept = 0;
for (const c of readdirSync(root)) {
  if (c.startsWith("_") || !existsSync(join(root, c, "k1.json"))) continue;
  for (const f of readdirSync(join(root, c)).filter((x) => /^k\d+\.json$/.test(x))) {
    const k = Number(f.slice(1, -5));
    const dead = (DEAD[c] ?? []).includes(k);
    const j = JSON.parse(readFileSync(join(root, c, f), "utf8"));
    let n = 0;
    for (const fr of j.frames ?? []) {
      const p = join(root, c, `k${k}`, `${fr.i}.png`);
      if (!existsSync(p)) continue;
      if (fr.mark === "keep") { kept++; continue; }
      const out = fr.mark === "drop" || fr.pre === "drop";
      if (!out && !dead) continue;
      if (out) a++; else b++;
      n++;
      if (go) unlinkSync(p);
    }
    if (n) console.log(`${c} k${k}${dead ? " (dead round)" : ""}: ${n}`);
  }
}
console.log(`${go ? "deleted" : "dry run"}: thrown out ${a}, dead rounds ${b}; kept by Alexey untouched: ${kept}`);
