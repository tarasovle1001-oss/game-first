// day 22.11 00:05: thru_anal2 ("rectum, intestines" in the prompt) removed the uterus but drew guts on ~16 of 96. thru_anal3: no organ words in the prompt, uterus AND intestines in the negative.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: thru_anal3")) { console.log("already patched"); process.exit(0); }
const m = /      - id: thru_anal2\r?\n/.exec(s);
if (!m) throw new Error("no thru_anal2");
const a = m.index;
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b).replace("- id: thru_anal2", "- id: thru_anal3").replace(/title: ".*"/, 'title: "СКВОЗЬ ТЕЛО: анально 3 - без матки и без кишок"')
  .replace(" (rectum:1.2), intestines,", "").replace('negative: "', 'negative: "(intestines:1.4), guts, organs, internal organs, ');
if (blk.includes("rectum") || !blk.includes("guts")) throw new Error("patch");
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
