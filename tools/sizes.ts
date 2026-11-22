// The men she meets, by size: bots play, every guest who came is counted once. Prints cm (real and as shown) and the class.
// pnpm exec tsx tools/sizes.ts [days=30] [seeds=6] [out.json]
import { writeFileSync } from "node:fs";
import { baseMod, bs, content, shownCm, sizeClass } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import { ownerStrategy } from "../packages/bots/src";

const [days = "30", seeds = "6", out] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const byCm = new Map<number, number>();
const byType = new Map<string, number[]>();
for (let seed = 1; seed <= Number(seeds); seed++) {
  let s = engine.init(seed, { base: { preset: "ordinary" } });
  while (s.time.day <= Number(days)) s = engine.dispatch(s, ownerStrategy(engine.listActions(s), s, () => 0));
  for (const p of Object.values(bs(s).patrons)) {
    byCm.set(p.size, (byCm.get(p.size) ?? 0) + 1);
    (byType.get(p.type) ?? byType.set(p.type, []).get(p.type)!).push(p.size);
  }
}
const total = [...byCm.values()].reduce((a, b) => a + b, 0);
const NAMES = ["крошечный", "маленький", "средний", "большой", "огромный"];
const classes = NAMES.map(() => 0);
const cms = [...byCm].sort((a, b) => a[0] - b[0]);
console.log(`${total} гостей за ${days} дней x ${seeds} сидов; границы классов (см): ${content.body.sizeClasses.join(", ")}; муж: ${content.body.husband.size} см (${NAMES[sizeClass(content.body.husband.size)]})`);
console.log("см  на экране  класс        доля");
for (const [cm, n] of cms) {
  classes[sizeClass(cm)]! += n;
  console.log(`${String(cm).padStart(2)}  ${String(shownCm(cm)).padStart(9)}  ${NAMES[sizeClass(cm)]!.padEnd(11)} ${((100 * n) / total).toFixed(1).padStart(5)}%  ${"#".repeat(Math.round((60 * n) / total))}`);
}
console.log("по классам:");
NAMES.forEach((name, i) => console.log(`  ${name.padEnd(11)} ${((100 * classes[i]!) / total).toFixed(1).padStart(5)}%`));
console.log("по типам гостей (см от-до, среднее):");
for (const [type, list] of [...byType].sort()) console.log(`  ${type.padEnd(14)} ${Math.min(...list)}-${Math.max(...list)}  ${(list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)}  (${list.length})`);
if (out) writeFileSync(out, JSON.stringify({ total, cm: cms.map(([cm, n]) => ({ cm, shown: shownCm(cm), cls: sizeClass(cm), n })), classes }, null, 1));
