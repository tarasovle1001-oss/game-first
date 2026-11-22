// day 21.11 23:50. Alexey kept 2 of 32 fist frames (192, 218): both show the FOREARM going into him, hand not visible. fpov_fist2 pushes exactly that.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: fpov_fist2")) { console.log("already patched"); process.exit(0); }
const m = /      - id: fpov_fist\r?\n/.exec(s);
if (!m) throw new Error("no fpov_fist");
const a = m.index;
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b).replace("- id: fpov_fist", "- id: fpov_fist2").replace(/title: ".*"/, 'title: "КУЛАК В НЁМ 2: предплечье уходит в него, кисти не видно"')
  .replace(/acts: \[.*\]/, 'acts: ["(anal fisting:1.5), (arm in anus:1.3), forearm in anus, hand inside, wrist deep, stretched anus", "(anal fisting:1.5), (deep fisting:1.3), forearm inside, elbow deep, stretched anus, lube", "(anal fisting:1.5), fist inside anus, wrist inside, forearm, stomach bulge"]')
  .replace('negative: "', 'negative: "hand on ass, ass grab, fingers visible, open hand, handjob, penis grab, anal fingering, ');
if (!blk.includes("arm in anus") || !blk.includes("fingers visible")) throw new Error("patch");
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
