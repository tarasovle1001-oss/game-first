// day 21.11 23:15. Trials: x_fpov (her POV, hands from the viewer) WORKS as a composition (finger / fist in him), but the hand is often dark and male-looking;
// x_side, x_otk, x_face flip the roles (0%); the public ProstateMilking LoRA at 0.8 gives the right composition (he on all fours, she beside him)
// but destroys the picture with our 9-step Lightning flow. So: fpov_finger / fpov_fist with pale female hands, and pm_side2 / pm_side3 at weights 0.4 / 0.55.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: fpov_finger")) { console.log("already patched"); process.exit(0); }
const block = (id) => {
  const a = s.indexOf(`      - id: ${id}\n`);
  if (a < 0) throw new Error("no " + id);
  const rest = s.slice(a + 10);
  return [a, a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1];
};
const q = (x) => JSON.stringify(x);
const [a1, b1] = block("x_fpov");
const fp = s.slice(a1, b1);
const HAND = "(female hand:1.3), (pale hand:1.3), pale arm, slender arm, slender fingers, (red nails:1.2), nail polish, bracelet";
const mkF = (nid, title, acts, extraNeg) => {
  let blk = fp.replace("- id: x_fpov", `- id: ${nid}`).replace(/title: ".*"/, `title: ${q(title)}`).replace(/acts: \[.*\]/, `acts: [${acts.map(q).join(", ")}]`)
    .replace("pov hands, slender fingers, nail polish,", `pov hands, ${HAND},`).replace('negative: "', `negative: "(dark-skinned hand:1.4), (dark hand:1.3), tan hand, dark arm, veiny arm, muscular arm, male arm, ${extraNeg}`);
  if (!blk.includes(HAND) || !blk.includes("dark-skinned hand") || !blk.includes(acts[0])) throw new Error("mkF " + nid);
  return blk;
};
const finger = mkF("fpov_finger", "ПАЛЕЦ В НЁМ: её глазами, светлая женская рука от зрителя",
  ["(anal fingering:1.4), index finger in anus, one finger, (prostate milking:1.2)", "(anal fingering:1.4), two fingers in anus, lube", "(anal fingering:1.4), fingering from behind, finger in anus, precum, dripping"], "(anal fisting:1.3), fist, ");
const fist = mkF("fpov_fist", "КУЛАК В НЁМ: её глазами, светлая женская рука от зрителя",
  ["(anal fisting:1.4), fisting, fist in anus, wrist", "(anal fisting:1.4), fisting, forearm, deep insertion, stretched anus", "(anal fisting:1.4), four fingers in anus, hand in anus, lube"], "");
const [a2, b2] = block("pm_side");
const pm = s.slice(a2, b2);
const mkP = (nid, w) => {
  const blk = pm.replace("- id: pm_side", `- id: ${nid}`).replace(/title: ".*"/, `title: ${q(`ПРОСТАТА с чужой LoRA на весе ${w}: вид сбоку`)}`).replace("ProstateMilking_IL_V1_0.safetensors:0.8", `ProstateMilking_IL_V1_0.safetensors:${w}`);
  if (!blk.includes(`:${w}"`)) throw new Error("mkP " + nid);
  return blk;
};
const [, end] = block("pm_fist");
s = s.slice(0, end) + finger + fist + mkP("pm_side2", 0.4) + mkP("pm_side3", 0.55) + s.slice(end);
writeFileSync(f, s);
console.log("patched");
