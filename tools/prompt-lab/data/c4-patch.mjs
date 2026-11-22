// day 21.11: the husband must read as an adult (not a boy, not old, not huge). Test targets with an axis of descriptions.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: age_full")) { console.log("already patched"); process.exit(0); }
const ins = (anchor, text) => { const i = s.indexOf(anchor); if (i < 0) throw new Error("no anchor: " + anchor); s = s.slice(0, i) + text + s.slice(i); };
const NEG = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, (slim:1.2), skinny, narrow shoulders, androgynous, otoko no ko, bishounen, small body, (dark-skinned male:1.4), (2boys:1.4), muscular male, abs, old man, elderly, wrinkles, grey hair, obese";
const PALE = "(pale-skinned male:1.4), (pale skin:1.3), white skin";
ins('      - id: spank_him', `      - id: age_full
        title: "Тест возраста мужа: в полный рост с лицом, раком (худший случай)"
        count: 96
        prompt: "1boy, solo focus, male focus, nude, all fours, from side, full body, {man}, ${PALE}, {hpenis}, {room}"
        negative: "${NEG}"
        axes:
          man:
            - "(mature male:1.3), adult, 35 years old, (stubble:1.3), facial hair, very short hair, tired eyes, average build, broad shoulders, tall male"
            - "(mature male:1.3), adult, 35 years old, (stubble:1.3), facial hair, very short hair, tired eyes, average build, broad shoulders, tall male, leg hair, arm hair, chest hair"
            - "(mature male:1.3), (middle-aged man:1.1), short hair, (beard:1.1), stubble, thick eyebrows, dad bod, tall male"
            - "(mature male:1.3), 30s, (stubble:1.2), facial hair, very short hair, manly, masculine, thick neck, large hands, tall male, adult proportions, average build"
      - id: age_close
        title: "Тест возраста мужа: крупно без лица, лёжа"
        count: 96
        prompt: "1boy, solo, male focus, nude, close-up, lower body, lying on back, legs up, spread legs, (faceless male:1.2), head out of frame, {man}, ${PALE}, {hpenis}, {room}"
        negative: "${NEG}, face"
        axes:
          man:
            - "(mature male:1.3), adult, average build, thick thighs, tall male, large frame"
            - "(mature male:1.3), adult, average build, thick thighs, tall male, leg hair, hairy legs"
            - "(mature male:1.3), adult, dad bod, belly, wide waist, thick legs"
            - "(mature male:1.3), adult, masculine, manly, large hands, big feet, adult male body, average build, soft body"
`);
writeFileSync(f, s);
console.log("patched");
