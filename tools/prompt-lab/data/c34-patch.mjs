// night 22.11: the goth keeps her face; four variants of her FIGURE to choose from (Alexey: balanced, the lower half a little more
// expressive than the upper, breasts small-medium, the rear expressive but not big, "ass visible through thighs", hip bones). No LoRA needed.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("  - id: figure")) { console.log("already patched"); process.exit(0); }
const FACE = "black hair, long hair, blunt bangs, purple eyes, tsurime, thick eyebrows, mascara, long eyelashes, lips, thick lips, black lipstick, eyeliner, pale skin, black choker, ear piercing, mature woman";
const BODY = {
  a: "slim, slender body, medium breasts, (narrow waist:1.3)", // the current body, for comparison
  b: "slender, medium breasts, (narrow waist:1.2), (wide hips:1.1), (ass visible through thighs:1.2), thigh gap, hip bones, toned",
  c: "slender, small breasts, (narrow waist:1.2), (wide hips:1.2), (pear-shaped figure:1.1), (ass visible through thighs:1.3), round ass, hip bones",
  d: "fit, medium breasts, (narrow waist:1.3), (wide hips:1.2), thick thighs, (ass visible through thighs:1.2), bubble butt, hip bones, hip dips",
};
const q = (x) => JSON.stringify(x);
const NEG = "plump, fat, chubby, (huge breasts:1.3), large breasts, (huge ass:1.3), love handles, belly fat, muffin top, skindentation, thick waist, petite, flat chest, child, loli, muscular female, abs, 1boy, penis";
let out = `  - id: figure
    title: "ФИГУРА готки: четыре варианта тела на одном лице"
    trigger: figtest
    negative: ${q(NEG)}
    targets:
`;
for (const [k, body] of Object.entries(BODY)) out += `      - id: fig_${k}
        title: ${q("Фигура " + k.toUpperCase() + ": " + body.slice(0, 70))}
        count: 40
        size: 832x1216
        prompt: ${q(`1girl, solo, ${FACE}, ${body}, {pose}, {wear}, {room}`)}
        axes:
          pose: ["standing, from behind, looking back, full body", "standing, facing viewer, cowboy shot, hand on hip", "bent over, from behind, ass focus, looking back", "all fours, from behind, top-down bottom-up", "lying on side, from front, full body", "kneeling, from side, arched back"]
          wear: ["nude, nipples", "black lingerie, black panties, black bra", "(red dress:1.2), off-shoulder dress, short dress, dress lift, black panties", "(white shirt:1.2), dress shirt, (black skirt:1.1), pencil skirt, black pantyhose"]
`;
const m = /\n {2}- id: sixty_nine\r?\n/.exec(s);
if (!m) throw new Error("no sixty_nine");
s = s.slice(0, m.index + 1) + out + s.slice(m.index + 1);
writeFileSync(f, s);
console.log("patched");
