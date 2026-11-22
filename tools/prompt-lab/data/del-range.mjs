// deletes Claude's rejects (pre: drop, not kept by Alexey) inside a viewed stretch of a round; the hidden unviewed tail stays on disk
//   node tools/prompt-lab/data/del-range.mjs <concept> <round> <from> <to>
import { existsSync, readFileSync, unlinkSync } from "node:fs";
const [c, k, a, b] = process.argv.slice(2);
const d = `tools/prompt-lab/data/synth/${c}/`;
const j = JSON.parse(readFileSync(`${d}k${k}.json`, "utf8"));
let n = 0;
for (const f of j.frames) if (f.i >= +a && f.i <= +b && f.pre === "drop" && f.mark !== "keep") { const p = `${d}k${k}/${f.i}.png`; if (existsSync(p)) { unlinkSync(p); n++; } }
console.log(`${c} k${k} [${a}..${b}] deleted ${n}`);
