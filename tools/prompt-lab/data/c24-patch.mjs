// day 21.11 22:41, Alexey: "где у нее грудь в кадр попадает сразу пропадает мужской пресс, попробовать за это зацепиться".
// pegging5 = pegging3 (her POV) + her own breasts in frame from above + black strap-on; "breasts" removed from the negative.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: pegging5")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: pegging3\n");
if (a < 0) throw new Error("no pegging3");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b);
const set = (re, v) => { if (!re.test(blk)) throw new Error("no " + re); blk = blk.replace(re, v); };
set(/- id: pegging3/, "- id: pegging5");
set(/title: ".*"/, 'title: "СТРАПОН 5: её глазами, её грудь в кадре сверху, чёрный страпон"');
set(/prompt: ".*"/, 'prompt: "close-up, femdom, female pov, pov, (pov breasts:1.3), (large breasts:1.2), breasts, cleavage, {act}, (black strap-on:1.3), black dildo, strap-on harness, {view}, {hand}, {grip}, {state}, 1girl, 1boy, {hbody3}, {hpenis}, {room}"');
set(/negative: ".*"/, 'negative: "(male hand:1.3), (dark-skinned male:1.4), (2boys:1.4), multiple penises, yaoi, futanari, penis on female, gloves, female pegged, girl on all fours, (muscular male:1.3), (muscular female:1.4), abs, male wearing strap-on, vaginal, penis in pussy, flesh-colored dildo, realistic dildo, flat chest, male chest, pectorals"');
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
