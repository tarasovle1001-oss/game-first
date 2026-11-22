// day 21.11: cage4 / soft4 - close-up, the husband lying, her hand (what worked in the lab: chastity N1, went_soft M2). No standing views.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: cage4")) { console.log("already patched"); process.exit(0); }
const anchor = "      - id: handjob2";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("no anchor");
const NEG = "(male hand:1.3), (dark-skinned male:1.4), (2boys:1.4), standing, wide hips, female, 1girl, breasts, pussy, futanari";
const VIEW = '["lying on back, spread legs", "lying on back, knees up, from above", "sitting, spread legs, from above"]';
const text = `      - id: cage4
        title: "Клетка 4: крупно, он лёжа, её рука"
        count: 100
        prompt: "close-up, femdom, {act}, 1boy, male focus, {view}, crotch focus, lower body, head out of frame, {hand}, {hbody3}, {room}"
        negative: "${NEG}"
        acts: ["(chastity cage:1.3), male chastity, holding key, key", "(chastity cage:1.3), male chastity, finger on cage, teasing", "(chastity cage:1.3), flat chastity cage, padlock, key"]
        axes:
          view: ${VIEW}
      - id: soft4
        title: "Обмякший 4: крупно, он лёжа, её рука"
        count: 100
        prompt: "close-up, femdom, {act}, 1boy, male focus, {view}, crotch focus, lower body, head out of frame, {hand}, {hbody3}, {hpenis}, {room}"
        negative: "${NEG}, erection"
        acts: ["flaccid, soft penis, (small penis:1.2), finger on penis", "flaccid, soft penis, lifting penis, two fingers, pinching", "flaccid, small penis, hand on another's thigh"]
        axes:
          view: ${VIEW}
`;
s = s.slice(0, i) + text + s.slice(i);
writeFileSync(f, s);
console.log("patched");
