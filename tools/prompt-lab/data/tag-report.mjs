// tag frequencies of a tagged dataset: node tag-report.mjs <concept> [regex of tags to show]; also per sub-scene (target) counts of the key tags
import { readFileSync, readdirSync } from "node:fs";
const [c, re] = process.argv.slice(2);
const d = `tools/prompt-lab/data/synth/_dataset/${c}`;
const KEY = new RegExp(re || "^(dark-skinned male|dark skin|tan|muscular male|muscular|abs|pubic hair|male pubic hair|leg hair|hairy|body hair|chest hair|small penis|large penis|veiny penis|foreskin|precum|1girl|1boy|2boys|multiple boys|solo|handjob|footjob|fellatio|chastity cage|flaccid|bulge|cum|ejaculation|interracial|faceless male|dildo|anal beads|butt plug|vibrator|sex toy|anal object insertion|anal fingering|anal fisting|fisting|strap-on|pegging|spanking|x-ray|cross-section|uterus|stomach bulge|see-through body|internal cumshot|gloves|nail polish|69|group sex|double penetration|spitroast|mmf threesome|gangbang)$");
const files = readdirSync(d).filter((n) => n.endsWith(".txt") && !n.endsWith(".prompt.txt"));
const tot = {}, per = {};
for (const n of files) {
  const t = n.replace(/^.*?_(.+)_k\d+_\d+\.txt$/, "$1").replace(new RegExp("^" + c + "_"), "");
  const tags = readFileSync(`${d}/${n}`, "utf8").trim().split(", ").slice(1);
  (per[t] ||= { n: 0 }).n++;
  for (const g of tags) if (KEY.test(g)) { tot[g] = (tot[g] || 0) + 1; per[t][g] = (per[t][g] || 0) + 1; }
}
console.log(c, files.length, "pictures");
console.log(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" | "));
for (const [t, v] of Object.entries(per)) console.log(" ", t, v.n, Object.entries(v).filter(([k]) => k !== "n").sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, n]) => `${k}:${n}`).join(" "));
