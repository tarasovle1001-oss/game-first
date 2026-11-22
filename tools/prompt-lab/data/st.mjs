// status of rounds: node st.mjs <concept> [k...]  -> per target: range, done, pre keep/drop, marks
import { readFileSync, readdirSync, existsSync } from "node:fs";
const [c, ...ks] = process.argv.slice(2);
const dir = `tools/prompt-lab/data/synth/${c}`;
const list = ks.length ? ks : readdirSync(dir).filter(n => /^k\d+\.json$/.test(n)).map(n => n.slice(1, -5)).sort((a, b) => a - b);
for (const k of list) {
  const r = JSON.parse(readFileSync(`${dir}/k${k}.json`, "utf8"));
  const by = {};
  r.frames.forEach((f, i) => {
    const t = (by[f.target] ||= { from: i, to: i, done: 0, drop: 0, keep: 0, mkeep: 0, mdrop: 0, top: 0 });
    t.to = i;
    if (existsSync(`${dir}/k${k}/${i}.png`)) t.done++;
    if (f.pre === "drop") t.drop++; else if (r.screened) t.keep++;
    if (f.mark === "keep") t.mkeep++; if (f.mark === "drop") t.mdrop++; if (f.top) t.top++;
  });
  console.log(`k${k} screened=${!!r.screened} stopped=${!!r.stopped}`);
  for (const [t, v] of Object.entries(by)) console.log(`  ${t} ${v.from}-${v.to} png=${v.done} pre:drop=${v.drop} visible=${v.keep} mark keep=${v.mkeep} drop=${v.mdrop} top=${v.top}`);
}
