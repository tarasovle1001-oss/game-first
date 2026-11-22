// day 21.11 22:25, Alexey: "просто он один, вернее его зад и игрушка в нем". dildo11 = solo male, close-up of his rear, toy already in, no hands.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: dildo11")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: dildo10\n");
if (a < 0) throw new Error("no dildo10");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b);
const set = (re, v) => { if (!re.test(blk)) throw new Error("no " + re); blk = blk.replace(re, v); };
set(/- id: dildo10/, "- id: dildo11");
set(/title: ".*"/, 'title: "ДИЛДО В НЁМ 11: он один, его зад крупно, игрушка уже в нём, без рук"');
set(/prompt: ".*"/, 'prompt: "1boy, solo, male focus, {act}, {view}, (mature male:1.3), adult, (pale-skinned male:1.4), (pale skin:1.3), average build, thick thighs, large frame, ass focus, male ass, anus, testicles, arms out of frame, head out of frame, {hpenis}, {room}"');
set(/negative: ".*"/, 'negative: "1girl, female, breasts, pussy, (2boys:1.5), multiple boys, yaoi, another person, hand, hands, (abs:1.3), (muscular male:1.4), bodybuilder, (dark skin:1.3), (dark-skinned male:1.4), tan, pubic hair, hairy ass, (large penis:1.3), petite, small body, child, (shota:1.5), femboy, otoko no ko, trap, slim"');
set(/acts: \[.*\]/, 'acts: ["(anal object insertion:1.4), (dildo:1.3), dildo in anus", "(anal object insertion:1.4), (butt plug:1.3)", "(anal object insertion:1.4), (vibrator:1.2), vibrator in anus", "(anal object insertion:1.4), (anal beads:1.2)"]');
set(/view: \[.*\]/, 'view: ["close-up, from behind, all fours, ass up", "close-up, from behind, bent over, kneeling", "close-up, lying on back, legs up, spread legs, from below"]');
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
