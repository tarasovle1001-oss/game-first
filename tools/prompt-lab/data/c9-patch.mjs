// day 21.11: in standing views "thick thighs, large frame" gives female hips. hbody4 = male silhouette; cage3, soft3, body3.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: cage3")) { console.log("already patched"); process.exit(0); }
const ins = (anchor, text) => { const i = s.indexOf(anchor); if (i < 0) throw new Error("no anchor: " + anchor); s = s.slice(0, i) + text + s.slice(i); };
const AGE = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, (slim:1.2), skinny, narrow shoulders, androgynous, otoko no ko, bishounen, small body, old man, elderly, wrinkles, grey hair, obese";
ins('  hpenis: "', `  hbody4: "(faceless male:1.2), head out of frame, (mature male:1.3), adult, male focus, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, large frame, (narrow hips:1.2), flat chest, masculine torso"
`);
ins('  patron: "pale-skinned male', `  hbody4: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (muscular male:1.3), abs, large penis, huge penis, (wide hips:1.3), hourglass, curvy, narrow waist, female, 1girl, breasts, pussy, face, (male pov:1.3), pov crotch, (2boys:1.4), multiple penises, pubic hair, ${AGE}"
`);
const clone = (from, to) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const m1 = /\r?\n( {6}- id: | {2}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:|#)/.exec(s.slice(a + 10));
  const end = m1 ? a + 10 + m1.index : s.length;
  const b = s.slice(a, end).replace(`id: ${from}`, `id: ${to}`).replaceAll("{hbody3}", "{hbody4}").replace("(муж 3)", "(муж 4: мужской силуэт)");
  s = s.slice(0, end) + "\n" + b + s.slice(end);
};
clone("cage2", "cage3"); clone("soft2", "soft3"); clone("body2", "body3");
writeFileSync(f, s);
console.log("patched");
