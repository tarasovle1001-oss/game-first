// day 21.11 22:55, Alexey: her hand in him (finger / fist) is a MUST for the set: "перебирай, пробуй, заходы покороче, разнообразие тегов пошире".
// Four exploratory compositions, short runs (75 each), finger and fist mixed through acts. Tags from the Danbooru vocabulary and from a public
// "Prostate Milking" Illustrious LoRA card (reach-around, from side, male legs up).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: x_side")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: dildo10\n");
if (a < 0) throw new Error("no dildo10");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
const src = s.slice(a, b);
const ACTS = ["(anal fingering:1.4), finger in anus, (prostate milking:1.2)", "(anal fingering:1.4), fingering from behind, two fingers, lube", "(anal fisting:1.4), fisting, fist in anus, wrist", "(anal fisting:1.4), fisting, forearm, deep insertion"];
const NEG = "(futanari:1.5), penis on female, newhalf, (2boys:1.5), multiple boys, yaoi, male masturbation, female anal, female penetrated, vaginal, girl on all fours, (abs:1.3), (muscular male:1.3), (dark-skinned male:1.4), dark skin, pubic hair, gloves";
const q = (x) => JSON.stringify(x);
const mk = (nid, title, prompt, views, neg = NEG) => {
  let blk = src.replace("- id: dildo10", `- id: ${nid}`).replace(/title: ".*"/, `title: ${q(title)}`).replace(/prompt: ".*"/, `prompt: ${q(prompt)}`)
    .replace(/negative: ".*"/, `negative: ${q(neg)}`).replace(/acts: \[.*\]/, `acts: [${ACTS.map(q).join(", ")}]`).replace(/view: \[.*\]/, `view: [${views.map(q).join(", ")}]`);
  if (!blk.includes(nid) || !blk.includes(views[0]) || !blk.includes(prompt)) throw new Error("mk " + nid);
  return blk;
};
const out = [
  mk("x_side", "ПРОБА рука в нём: вид сбоку, она сзади него", "1girl, 1boy, hetero, femdom, {look}, breasts, {act}, (male penetrated:1.2), {view}, {hbody3}, {hpenis}, {room}",
    ["from side, boy on all fours, girl kneeling behind him, reach-around, handjob", "from side, boy bent over, girl standing behind him, hand on another's ass", "from side, boy lying on back, male legs up, girl kneeling between his legs"]),
  mk("x_otk", "ПРОБА рука в нём: он у неё на коленях (как шлепки)", "1girl, 1boy, hetero, femdom, {look}, breasts, boy over girl's lap, over the knee, girl sitting, bare ass, male ass, {act}, (male penetrated:1.2), {view}, {hbody3}, {hpenis}, {room}",
    ["from side", "from above", "from behind, ass focus"]),
  mk("x_fpov", "ПРОБА рука в нём: её глазами, её руки от зрителя", "close-up, femdom, female pov, pov, pov hands, slender fingers, nail polish, {act}, (male penetrated:1.2), 1boy, male focus, {view}, {hbody3}, {hpenis}, {room}",
    ["man on all fours, male ass, from behind", "man lying on back, male legs up, spread legs, from above", "man bent over, male ass, from behind"],
    NEG + ", 1girl, (male hand:1.3), hairy arms"),
  mk("x_face", "ПРОБА рука в нём: её лицо рядом с его задом", "1girl, 1boy, hetero, femdom, {look}, girl beside boy, face next to ass, looking at viewer, smirk, hand on another's ass, {act}, (male penetrated:1.2), {view}, {hbody3}, {hpenis}, {room}",
    ["close-up, from behind, boy on all fours, male ass", "close-up, from behind, boy bent over, male ass", "close-up, boy lying on side, male ass"]),
].join("");
s = s.slice(0, b) + out + s.slice(b);
writeFileSync(f, s);
console.log("patched");
