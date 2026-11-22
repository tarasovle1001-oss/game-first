// day 21.11 23:58: fpov_fist2 adds a second man (a torso with a penis above / under him) on ~17 of 96. fpov_fist3 = fpov_fist2 + a hard ban on him.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: fpov_fist3")) { console.log("already patched"); process.exit(0); }
const m = /      - id: fpov_fist2\r?\n/.exec(s);
if (!m) throw new Error("no fpov_fist2");
const a = m.index;
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b).replace("- id: fpov_fist2", "- id: fpov_fist3").replace(/title: ".*"/, 'title: "КУЛАК В НЁМ 3: предплечье в нём, жёсткий запрет второго мужчины"')
  .replace('negative: "', 'negative: "(2boys:1.6), (multiple boys:1.5), (second penis:1.4), (multiple penises:1.5), (anal sex:1.4), sex, penis in anus, male on male, (male pov:1.4), pov crotch, pov penis, another torso, abs, pectorals, ')
  .replace("1boy, male focus,", "(1boy:1.2), (solo focus:1.2), male focus,");
if (!blk.includes("second penis") || !blk.includes("solo focus")) throw new Error("patch");
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
