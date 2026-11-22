// day 21.11, after branches 4: "tall, leg hair" made the body adult but drew a hairy male viewer / a second big man.
// hbody3 = adult by frame only (thick thighs, large frame), no hair words; the viewer must not be a man. Branches 5 from 3.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate5")) { console.log("already patched"); process.exit(0); }
const ins = (anchor, text) => { const i = s.indexOf(anchor); if (i < 0) throw new Error("no anchor: " + anchor); s = s.slice(0, i) + text + s.slice(i); };
const AGE = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, (slim:1.2), skinny, narrow shoulders, androgynous, otoko no ko, bishounen, small body, old man, elderly, wrinkles, grey hair, obese";
ins('  hpenis: "', `  hbody3: "(faceless male:1.2), head out of frame, (mature male:1.3), adult, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, thick thighs, large frame"
  husband3: "(mature male:1.3), adult, 35 years old, (stubble:1.3), facial hair, very short hair, tired eyes, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, arm hair, leg hair"
`);
ins('  patron: "pale-skinned male', `  hbody3: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (muscular male:1.3), abs, large penis, huge penis, wide hips, breasts, pussy, face, (male pov:1.3), pov crotch, (2boys:1.4), multiple penises, hairy legs, pubic hair, ${AGE}"
  husband3: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (muscular male:1.3), abs, large penis, huge penis, (2boys:1.4), multiple boys, ${AGE}"
`);
const clone = (from, to, edit = (b) => b) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const m1 = /\r?\n( {6}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:)/.exec(s.slice(a + 10));
  const end = m1 ? a + 10 + m1.index : s.length;
  let b = s.slice(a, end).replace(`id: ${from}`, `id: ${to}`).replaceAll("{hbody}", "{hbody3}").replaceAll("{husband}", "{husband3}").replace(/count: \d+/, "count: 100").replace(/title: "([^"]*)"/, (_, t) => `title: "${t} (муж 3: взрослый по телу, без волос в кадре)"`);
  s = s.slice(0, end) + "\n" + edit(b) + s.slice(end);
};
clone("prostate3", "prostate5");
clone("dildo3", "dildo5");
clone("ruined3", "ruined5");
clone("spank3", "spank5", (b) => b.replace("(муж 3: взрослый по телу, без волос в кадре)", "(муж 3: взрослый, без tall / плеч)"));
writeFileSync(f, s);
console.log("patched");
