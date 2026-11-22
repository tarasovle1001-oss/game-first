// day 21.11: pegging2 drew a muscular man wearing the strap-on (6 of 48). pegging3 = only her eyes, as in the lab take that worked (came_pegging X1).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: pegging3")) { console.log("already patched"); process.exit(0); }
const anchor = "      - id: spank_him";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("no anchor");
const text = `      - id: pegging3
        title: "Страпон 3: только её глазами, её руки на его бёдрах"
        count: 300
        prompt: "close-up, femdom, female pov, pov, {act}, {view}, {hand}, {grip}, {state}, 1boy, male focus, {hbody3}, {hpenis}, {room}"
        negative: "(male hand:1.3), (dark-skinned male:1.4), (2boys:1.4), multiple penises, yaoi, futanari, gloves, 1girl, breasts, female pegged, girl on all fours, (muscular male:1.3), abs, male wearing strap-on, vaginal, penis in pussy"
        acts: ["(pegging:1.3), strap-on, anal", "(pegging:1.3), strap-on, anal, deep penetration", "(pegging:1.2), strap-on, harness, anal"]
        axes:
          view: ["man on all fours, male ass, from behind", "man lying on back, legs up, spread legs, from above", "man on all fours, top-down bottom-up, male ass, from behind"]
          grip: ["hands on another's hips", "hand on another's ass", "hands on another's thighs"]
          state: ["erection, precum", "handsfree ejaculation, cum, cumdrip"]
`;
s = s.slice(0, i) + text + s.slice(i);
writeFileSync(f, s);
console.log("patched");
