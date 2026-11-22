// day 21.11: the "whose hand" lesson for the from-behind concept: prostate8 / dildo8 / fisting5 - she kneels between his legs, seen from his eyes,
// so the hand visibly comes from her (as handjob4, 73%).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate8")) { console.log("already patched"); process.exit(0); }
const anchor = "      - id: spank_him";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("no anchor");
const SELF = "(male masturbation:1.4), masturbation, (male hand:1.4), own hands, (2boys:1.5), multiple boys, yaoi, (dark-skinned male:1.4), futanari, penis on female";
const HER = "1girl, 1boy, hetero, femdom, {look}, kneeling, between legs, leaning forward, cleavage, smirk, pov";
const VIEW = '["man lying on back, legs up, spread legs, from above", "man lying on back, knees up, spread legs, from above", "close-up, man lying on back, legs up, lower body"]';
const text = `      - id: prostate8
        title: "Простата 8: она между его ног, вид его глазами, рука идёт от неё"
        count: 300
        prompt: "${HER}, {act}, {view}, {state}, {hand}, {hbody3}, {hpenis}, {room}"
        negative: "${SELF}, gloves"
        acts: ["(anal fingering:1.3), finger in ass, fingering", "(prostate milking:1.2), (anal fingering:1.2), finger in ass", "(anal fingering:1.3), two fingers, lube, anus"]
        axes:
          view: ${VIEW}
          state: ["erection, precum", "handsfree ejaculation, cum"]
      - id: dildo8
        title: "Дилдо в нём 8: она между его ног, игрушка в её руке"
        count: 300
        prompt: "${HER}, {act}, {view}, {state}, {hand}, {hbody3}, {hpenis}, {room}"
        negative: "${SELF}, gloves, vaginal"
        acts: ["(anal object insertion:1.3), (dildo:1.2), holding dildo", "(anal object insertion:1.3), (butt plug:1.2)", "(anal object insertion:1.3), (anal beads:1.2), pulling"]
        axes:
          view: ${VIEW}
          state: ["erection, precum", "handsfree ejaculation, cum"]
      - id: fisting5
        title: "Кулак в нём 5: она между его ног, перчатка по локоть"
        count: 300
        prompt: "${HER}, {act}, {view}, (black gloves:1.2), elbow gloves, latex gloves, {hbody3}, {hpenis}, {room}"
        negative: "${SELF}"
        acts: ["(anal fisting:1.3), fisting, fist", "(anal fisting:1.3), fist, deep insertion, forearm", "(anal fisting:1.3), wrist deep, lube"]
        axes:
          view: ${VIEW}
`;
s = s.slice(0, i) + text + s.slice(i);
writeFileSync(f, s);
console.log("patched");
