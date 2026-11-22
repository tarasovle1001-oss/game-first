// day 21.11 22:40, Alexey: "женщина со страпоном выходит как мужчина" (pegging3 is her POV: only a torso, flesh-coloured strap-on = reads as a man).
// pegging4 = seen from the side: her breasts, hair and curves are in frame, the strap-on is black.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: pegging4")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: pegging3\n");
if (a < 0) throw new Error("no pegging3");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
let blk = s.slice(a, b);
const set = (re, v) => { if (!re.test(blk)) throw new Error("no " + re); blk = blk.replace(re, v); };
set(/- id: pegging3/, "- id: pegging4");
set(/title: ".*"/, 'title: "СТРАПОН 4: вид сбоку, видно что это женщина (грудь, волосы), чёрный страпон"');
set(/prompt: ".*"/, 'prompt: "1girl, 1boy, hetero, femdom, {look}, {act}, {view}, (black strap-on:1.3), black dildo, strap-on harness, breasts, cleavage, long hair, {grip}, {hand}, {state}, {hbody3}, {hpenis}, {room}"');
set(/negative: ".*"/, 'negative: "(futanari:1.5), penis on female, newhalf, (2boys:1.5), multiple boys, yaoi, male wearing strap-on, girl on all fours, female pegged, vaginal, penis in pussy, (muscular female:1.4), (muscular male:1.3), abs, (dark-skinned male:1.4), flesh-colored dildo, realistic dildo, flat chest, tomboy, gloves"');
set(/view: \[.*\]/, 'view: ["from side, man on all fours, girl kneeling behind him", "from side, man bent over bed, girl standing behind him", "from side, man lying on back, legs up, girl kneeling between his legs"]');
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
