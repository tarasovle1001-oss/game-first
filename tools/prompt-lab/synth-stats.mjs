// Hit rates of the synthetic rounds, per target and per axis value (which wording / view / approach works).
//   node tools/prompt-lab/synth-stats.mjs <concept> [--soft] [--lab http://127.0.0.1:8195] [--targets a,b]
// --soft counts Claude's night screening too (a frame he did not drop in a screened round is a hit).
const a = process.argv.slice(2);
const lab = a.includes("--lab") ? a[a.indexOf("--lab") + 1] : "http://127.0.0.1:8195";
const only = a.includes("--targets") ? a[a.indexOf("--targets") + 1].split(",") : null;
const j = await (await fetch(`${lab}/api/synth/concepts${a.includes("--soft") ? "?soft=1" : ""}`)).json();
const c = j.concepts.find((x) => x.id === a[0]);
for (const r of c.rounds) console.log(`k${r.round} ${r.mode} ${r.status}: ${r.drawn}/${r.total} keep ${r.keep} drop ${r.drop} pre ${r.pre} err ${r.errors}`);
for (const t of c.targets) {
  if (only && !only.includes(t.id)) continue;
  const s = c.stats[t.id];
  if (!s) continue;
  console.log(`\n${t.id}: ${s.keep}/${s.seen}`);
  for (const [ax, vals] of Object.entries(t.axes)) console.log(`  ${ax}: ` + vals.map((v, i) => { const [n, k] = s.axes[ax]?.[i] ?? [0, 0]; return `${k}/${n} [${v.slice(0, 46)}]`; }).join(" | "));
}
