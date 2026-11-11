// What stops her: per act, how often guests asked, how she answered, and the average of each row of the formula.
// pnpm exec tsx tools/why.ts [preset] [days] [seeds]
import { baseMod, bs } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import { awayStrategy } from "../packages/bots/src";

const [preset = "ordinary", days = "20", seeds = "3"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const acc: Record<string, { n: number; yes: number; total: number; rows: Record<string, number> }> = {};
for (let seed = 1; seed <= Number(seeds); seed++) {
  let s = engine.init(seed, { base: { preset } });
  const seen = new Set<string>();
  for (let i = 0; i < 300000 && s.time.day <= Number(days); i++) {
    const a = engine.listActions(s);
    // short waits, so that no answer falls out of the 12-entry history unseen
    s = engine.dispatch(s, s.time.phase === "shift" && a.some((x) => x.type === "base/wait") && s.where.husband === "cafe.kitchen" ? { type: "base/wait", payload: { minutes: 15 } } : awayStrategy(a, s, () => 0));
    for (const p of bs(s).proposals) {
      const k = `${p.day}.${p.tick}.${p.patron}.${p.act}`;
      if (seen.has(k) || p.patron === "husband") continue;
      seen.add(k);
      const x = (acc[p.act] ??= { n: 0, yes: 0, total: 0, rows: {} });
      x.n++;
      x.total += p.total;
      if (p.verdict !== "refuse") x.yes++;
      for (const r of p.rows) x.rows[r.id.replace("consent.", "")] = (x.rows[r.id.replace("consent.", "")] ?? 0) + r.value;
    }
  }
  const h = bs(s).heroine;
  console.log(`seed ${seed}: openness ${h.traits.openness.toFixed(0)} fidelity ${h.traits.fidelity.toFixed(0)} regulars ${Object.values(bs(s).patrons).filter((p) => p.regular).length} best affinity ${Math.max(...Object.values(bs(s).patrons).map((p) => p.memory.affinity)).toFixed(0)}`);
}
for (const [act, x] of Object.entries(acc).sort((a, b) => b[1].n - a[1].n).slice(0, 12))
  console.log(`${act.padEnd(14)} asked ${String(x.n).padStart(4)}  yes ${String(Math.round((100 * x.yes) / x.n)).padStart(3)}%  avg ${(x.total / x.n).toFixed(1).padStart(6)} | ` + Object.entries(x.rows).map(([k, v]) => `${k}:${(v / x.n).toFixed(1)}`).join(" "));
