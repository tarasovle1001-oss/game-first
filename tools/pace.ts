// Pace check: on which day the first kiss/lap and the first sex with a guest happen, per preset.
// pnpm exec tsx tools/pace.ts [days] [seeds]
import { baseMod, bs, content } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import { awayStrategy } from "../packages/bots/src";

const [days = "30", seeds = "6"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const full = { preset: "hungry", traits: { openness: 100, confidence: 100, fidelity: 0, honesty: 0, libido: 100 }, sizeTaste: 100 };
type Setup = Record<string, string | number | Record<string, number>>;
const rows: [string, Setup][] = [...content.presets.map((p) => [p.id, { preset: p.id }] as [string, Setup]), ["full", full]];
for (const [name, setup] of rows) {
  const kiss: (number | string)[] = [];
  const sex: (number | string)[] = [];
  const stats = { asked: 0, yes: 0, enc: 0, minutes: 0 };
  for (let seed = 1; seed <= Number(seeds); seed++) {
    let s = engine.init(seed, { base: setup });
    let lastEnc: unknown = null;
    for (let i = 0; i < 200000 && s.time.day <= Number(days); i++) {
      s = engine.dispatch(s, awayStrategy(engine.listActions(s), s, () => 0));
      const e = bs(s).encounter;
      if (e && !lastEnc) stats.enc++;
      if (e) stats.minutes++;
      lastEnc = e;
    }
    const m = bs(s).memories as { id: string; day: number }[];
    const day = (ids: string[]) => m.filter((x) => ids.includes(x.id)).map((x) => x.day).sort((a, b) => a - b)[0] ?? "-";
    kiss.push(day(["first.kiss", "first.sit_on_lap", "first.grope"]));
    sex.push(day(["first.sex", "first.riding", "first.standing_sex", "first.anal"]));
  }
  console.log(name.padEnd(9), "kiss/lap:", kiss.join(" ").padEnd(22), "sex:", sex.join(" ").padEnd(22), `encounters/run ${Math.round(stats.enc / Number(seeds))}`);
}
