// day 21.11 23:00, Alexey: "Да можешь пробовать" - the public LoRA "Prostate Milking (Dynamic Views) IL_V1_0" (civitai version 1894877) is on the box.
// Three trial targets drawn WITH it (weight 0.8, the author's trigger tags): pm_side, pm_pov, pm_fist. Frames are synthetic material for OUR concept LoRA.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: pm_side")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: x_side\n");
if (a < 0) throw new Error("no x_side");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
const src = s.slice(a, b);
const LORAS = "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7,ProstateMilking_IL_V1_0.safetensors:0.8";
const NEG = "(futanari:1.5), penis on female, newhalf, (2boys:1.5), multiple boys, yaoi, male masturbation, female anal, female penetrated, vaginal, girl on all fours, (abs:1.3), (muscular male:1.3), (dark-skinned male:1.4), dark skin, pubic hair";
const q = (x) => JSON.stringify(x);
const mk = (nid, title, prompt, acts, views) => {
  let blk = src.replace("- id: x_side", `- id: ${nid}`).replace(/title: ".*"/, `title: ${q(title)}`).replace(/(count: \d+)/, `$1\n        loras: ${q(LORAS)}`).replace(/prompt: ".*"/, `prompt: ${q(prompt)}`)
    .replace(/negative: ".*"/, `negative: ${q(NEG)}`).replace(/acts: \[.*\]/, `acts: [${acts.map(q).join(", ")}]`).replace(/view: \[.*\]/, `view: [${views.map(q).join(", ")}]`);
  if (!blk.includes(nid) || !blk.includes("loras:") || !blk.includes(views[0]) || !blk.includes(prompt)) throw new Error("mk " + nid);
  return blk;
};
const out = [
  mk("pm_side", "ПРОСТАТА с чужой LoRA: вид сбоку, рука под ним и палец в нём", "1girl, 1boy, hetero, femdom, {look}, breasts, finger stimulate prostate, anal fingering, reach-around, from side, {act}, {view}, {hbody3}, {hpenis}, {room}",
    ["handjob, boy on all fours", "handjob, boy bent over", "boy on all fours, hand on another's ass"], ["girl kneeling behind him", "girl kneeling beside him", "girl standing behind him"]),
  mk("pm_pov", "ПРОСТАТА с чужой LoRA: его глазами, ноги вверх", "1girl, 1boy, hetero, femdom, {look}, breasts, finger stimulate prostate, anal fingering, pov, male legs up, {act}, {view}, {hbody3}, {hpenis}, {room}",
    ["handjob", "smirk, looking at viewer", "two fingers, lube"], ["girl kneeling between his legs", "girl leaning forward, cleavage", "close-up"]),
  mk("pm_fist", "КУЛАК с чужой LoRA (она заявлена только под палец)", "1girl, 1boy, hetero, femdom, {look}, breasts, (anal fisting:1.4), fisting, fist in anus, {act}, {view}, {hbody3}, {hpenis}, {room}",
    ["wrist, lube", "forearm, deep insertion", "(black gloves:1.2), elbow gloves, wrist"], ["reach-around, from side, boy on all fours, girl kneeling behind him", "pov, male legs up, girl kneeling between his legs", "from side, boy bent over, girl standing behind him"]),
].join("");
s = s.slice(0, b) + out + s.slice(b);
writeFileSync(f, s);
console.log("patched");
