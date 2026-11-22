// day 21.11, Alexey 18:31: the strap-on belongs to the "from behind" concept. pegging2: her eyes / close views, the husband without a face (hbody3).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: pegging2")) { console.log("already patched"); process.exit(0); }
const anchor = "      - id: spank_him";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("no anchor");
const NEG = "(male hand:1.3), (dark-skinned male:1.4), (2boys:1.4), multiple penises, yaoi, futanari, gloves, penis in pussy, vaginal";
const text = `      - id: pegging2
        title: "Страпон 2: её глазами и крупно, муж без лица"
        count: 300
        prompt: "{who}, femdom, hetero, {act}, {view}, {state}, {hbody3}, {hpenis}, {room}"
        negative: "${NEG}"
        acts: ["(pegging:1.3), strap-on, anal", "(pegging:1.3), (strap-on:1.2), dildo, anal, sex from behind", "(pegging:1.2), strap-on, black strap-on, harness, anal, deep penetration"]
        axes:
          who: ["1boy, solo focus, male focus, female pov, pov, pov hands, {hand}, hands on another's hips", "1girl, 1boy, {look}, nude, strap-on, kneeling behind, hands on another's hips, head out of frame", "1boy, solo focus, male focus, female pov, pov, {hand}, hand on another's ass"]
          view: ["close-up, from behind, man on all fours, male ass, ass focus", "close-up, lower body, man lying on back, legs up, spread legs, from above", "from side, lower body, man on all fours, top-down bottom-up"]
          state: ["erection, precum", "handsfree ejaculation, cum, cumdrip"]
`;
s = s.slice(0, i) + text + s.slice(i);
writeFileSync(f, s);
console.log("patched");
