// day 21.11 20:55: foot4 overcorrected - legs came out stick-thin and some frames showed a small slim figure (deleted).
// foot5 = foot4 without the "thin" words, with an explicit adult curvy woman and lower legs only in frame.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: foot5")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: foot4");
const b = s.indexOf("      - id: handjob2");
if (a < 0 || b < a) throw new Error("no foot4 block");
let blk = s.slice(a, b);
const rep = (x, y) => { if (!blk.includes(x)) throw new Error("no: " + x.slice(0, 50)); blk = blk.replace(x, y); };
rep("- id: foot4", "- id: foot5");
blk = blk.replace(/title: ".*"/, 'title: "ЕГО нога 5: взрослые женские ноги (не толстые и не тонкие), только голени и ступни"');
rep("(slender legs:1.3), (thin legs:1.2), slim thighs, thin calves, smooth legs, feminine legs,", "(mature female:1.2), curvy, shapely legs, smooth legs, feminine legs, lower legs, feet focus,");
rep('negative: "', 'negative: "(petite:1.4), (flat chest:1.4), skinny, thin legs, small body, (loli:1.5), child, ');
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
