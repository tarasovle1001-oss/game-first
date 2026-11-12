// Balance curves: games played by bots, day by day.
// pnpm exec tsx tools/curves.ts [days=30] [seeds=8] [out.html]
// Every wife preset with every kind of husband (SET=playtest: only the three playtest games). Prints a table per game
// (mean over seeds); with a third argument writes a page with the curves and a .json next to it.
// BASE=old.json overlays an earlier run dashed; DIAG=desire,trust prints what moved these.
import { readFileSync, writeFileSync } from "node:fs";
import { baseMod, bs, content } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import type { Action, GameState } from "../packages/core/src";
import { lovingStrategy, ownerStrategy } from "../packages/bots/src";
import type { Strategy } from "../packages/bots/src";

const [daysArg = "30", seedsArg = "8", out] = process.argv.slice(2);
const DAYS = Number(daysArg);
const SEEDS = Number(seedsArg);
const engine = createEngine([baseMod]);
const tierOf = new Map(content.acts.map((a) => [a.id, a.tier]));

const find = (actions: Action[], type: string, test: (p: Record<string, unknown>) => boolean = () => true) => actions.find((a) => a.type === type && test((a.payload ?? {}) as Record<string, unknown>));
/** The husband's nights: he asks for sex once a night (the game takes one ask a night) and is attentive in bed. */
function nights(day: Strategy): Strategy {
  return (actions, state, roll) =>
    actions.some((a) => a.type === "base/bed") ? lovingStrategy(actions, state, roll) : (find(actions, "base/night-act", (p) => p.act === "sex") ?? day(actions, state, roll));
}
const away: Strategy = (actions, state) => lovingStrategy(actions.filter((a) => a.type !== "base/night-act" && a.type !== "base/night-self"), state, () => 1);

/** 1. Allows nothing: forbids every item, stops whatever he sees. */
function strict(): Strategy {
  const home = nights(ownerStrategy);
  return (actions, state, roll) => find(actions, "base/react-stop") ?? find(actions, "base/caught-stop") ?? find(actions, "base/allow", (p) => p.say === "forbid") ?? home(actions, state, roll);
}

/** 3. Pushes from day one: allows everything, says what he wants every day, cheers on what he sees. */
function pusher(): Strategy {
  const said = new Map<number, Set<string>>();
  const home = nights(ownerStrategy);
  return (actions, state, roll) => {
    const day = state.time.day;
    const today = said.get(day) ?? said.set(day, new Set()).get(day)!;
    const wish = ["friendlier", "sexier", "watch_you", "your_call"].find((id) => !today.has(id) && find(actions, "base/wish", (p) => p.id === id));
    if (wish) {
      today.add(wish);
      return find(actions, "base/wish", (p) => p.id === wish)!;
    }
    return find(actions, "base/react-approve") ?? find(actions, "base/caught-watch") ?? find(actions, "base/allow", (p) => p.say === "allow") ?? home(actions, state, roll);
  };
}

const HUSBANDS: { id: string; title: string; make: () => Strategy }[] = [
  { id: "strict", title: "муж всё запрещает", make: strict },
  { id: "neutral", title: "муж на кухне, не мешает", make: () => nights(away) },
  { id: "push", title: "муж толкает", make: pusher },
];
const WIVES = content.presets.map((p) => p.id);
const WIFE_RU: Record<string, string> = { faithful: "верная", ordinary: "обычная", curious: "любопытная", hungry: "голодная" };
type Scenario = { id: string; title: string; preset: string; husband: string; make: () => Strategy };
// SET=playtest: only the three games of docs/PLAYTEST.md; otherwise every wife with every husband
const SCENARIOS: Scenario[] =
  process.env.SET === "playtest"
    ? [["faithful", 0], ["ordinary", 1], ["ordinary", 2]].map(([w, h]) => ({ id: `${w}/${HUSBANDS[h as number]!.id}`, title: `${WIFE_RU[w as string]}, ${HUSBANDS[h as number]!.title}`, preset: w as string, husband: HUSBANDS[h as number]!.id, make: HUSBANDS[h as number]!.make }))
    : WIVES.flatMap((w) => HUSBANDS.map((h) => ({ id: `${w}/${h.id}`, title: `${WIFE_RU[w] ?? w}, ${h.title}`, preset: w, husband: h.id, make: h.make })));

const METRICS = ["money", "debt", "reputation", "openness", "fidelity", "trust", "resent", "desire", "frustration", "vagina", "anus", "light", "deep", "home"] as const;
type Metric = (typeof METRICS)[number];
const LABEL: Record<Metric, string> = {
  money: "деньги", debt: "долг", reputation: "репутация", openness: "открытость", fidelity: "верность", trust: "доверие", resent: "обида", desire: "желание к мужу",
  frustration: "неудовлетворённость", vagina: "растяжение, влагалище", anus: "растяжение, анус", light: "с гостями: до рук (за день)", deep: "с гостями: рот и дальше (за день)", home: "с мужем (за день)",
};

function snapshot(s: GameState, day: number): Record<Metric, number> {
  const b = bs(s);
  const h = b.heroine;
  const d = b.diary?.find((x) => x.day === day);
  let light = 0;
  let deep = 0;
  let home = 0;
  for (const [who, acts] of Object.entries(d?.with ?? {}))
    for (const [act, n] of Object.entries(acts)) {
      if (who === "husband") home += n;
      else if ((tierOf.get(act) ?? 0) >= 5) deep += n;
      else light += n;
    }
  return {
    money: b.money, debt: b.debt, reputation: b.reputation, openness: h.traits.openness, fidelity: h.traits.fidelity, trust: h.marriage.trust ?? 0, resent: h.marriage.resent, desire: h.marriage.desire,
    frustration: h.frustration, vagina: h.body.vagina.stretch, anus: h.body.anus.stretch, light, deep, home,
  };
}

/** DIAG=desire,trust: also prints what moved these, summed over the run (mean over seeds). */
const DIAG = process.env.DIAG?.split(",") ?? null;
const diag: Record<string, Record<string, number>> = {};
const pick = (s: GameState, m: string): number => {
  const h = bs(s).heroine;
  return m === "trust" ? (h.marriage.trust ?? 0) : m === "desire" ? h.marriage.desire : m === "resent" ? h.marriage.resent : m === "frustration" ? h.frustration : m === "vagina" || m === "anus" ? h.body[m].stretch : m === "money" ? bs(s).money : ((h.traits as Record<string, number>)[m] ?? 0);
};
type Curve = Record<Metric, number[]>;
const result: Record<string, Curve> = {};
for (const sc of SCENARIOS) {
  const sum = Object.fromEntries(METRICS.map((m) => [m, Array(DAYS).fill(0)])) as Curve;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const play = sc.make();
    let roll = seed * 7919;
    const rnd = () => ((roll = (roll * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let s = engine.init(seed, { base: { preset: sc.preset } });
    for (let i = 0; i < 400000 && s.time.day <= DAYS; i++) {
      const action = play(engine.listActions(s), s, rnd);
      const next = engine.dispatch(s, action);
      if (DIAG) {
        // what moved it: the lines the turn wrote, or the action itself when it wrote none
        const lines = next.log.filter((e) => e.turn === next.turn).map((e) => e.key.replace(/\.\d+$/, ""));
        const key = `${action.type}${action.payload?.act ? ":" + action.payload.act : action.payload?.do ? ":" + action.payload.do : ""} [${[...new Set(lines)].slice(0, 3).join(", ")}]`;
        for (const m of DIAG) {
          const d = pick(next, m) - pick(s, m);
          if (Math.abs(d) > 0.001) (diag[`${sc.id} ${m}`] ??= {})[key] = ((diag[`${sc.id} ${m}`] ??= {})[key] ?? 0) + d / SEEDS;
        }
      }
      if (next.time.day !== s.time.day) {
        const snap = snapshot(next, s.time.day);
        for (const m of METRICS) sum[m][s.time.day - 1]! += snap[m] / SEEDS;
      }
      s = next;
    }
    process.stderr.write(`${sc.id} seed ${seed}/${SEEDS} done (day ${s.time.day})\n`);
  }
  result[sc.id] = sum;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const marks = [1, 3, 7, 10, 14, 21, 30].filter((d) => d <= DAYS);
for (const sc of SCENARIOS) {
  console.log(`\n${sc.title} (среднее по ${SEEDS} сидам)`);
  console.log("день".padEnd(34) + marks.map((d) => String(d).padStart(7)).join(""));
  for (const m of METRICS) console.log(LABEL[m].padEnd(34) + marks.map((d) => String(r1(result[sc.id]![m][d - 1]!)).padStart(7)).join(""));
}

if (DIAG)
  for (const [k, by] of Object.entries(diag)) {
    console.log(`\n${k}: что двигало (сумма за ${DAYS} дней)`);
    for (const [why, v] of Object.entries(by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 14)) console.log(`  ${(v > 0 ? "+" : "") + r1(v)}`.padEnd(10) + why);
  }
if (out) {
  // BASE=old.json: the same runs before a change, drawn dashed under the new lines
  writeFileSync(out.replace(/\.html?$/, "") + ".json", JSON.stringify(result));
  const base = process.env.BASE ? (JSON.parse(readFileSync(process.env.BASE, "utf8")) as Record<string, Curve>) : null;
  const COLORS: Record<string, string> = { strict: "#4c9aff", neutral: "#b8bec9", push: "#ff7a45" };
  const W = 300, H = 140, L = 34, R = 8, T = 8, B = 20;
  const wives = [...new Set(SCENARIOS.map((sc) => sc.preset))];
  const chart = (m: Metric, wife: string) => {
    const mine = SCENARIOS.filter((sc) => sc.preset === wife);
    // one scale per metric across all wives, so the columns can be compared by eye
    const all = SCENARIOS.flatMap((sc) => [...result[sc.id]![m], ...(base?.[sc.id]?.[m] ?? [])]);
    const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    const x = (i: number) => L + (i / Math.max(1, DAYS - 1)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = (vals: number[], sc: Scenario, dash: boolean) =>
      `<polyline fill="none" stroke="${COLORS[sc.husband]}" stroke-width="${dash ? 1 : 2}" ${dash ? 'stroke-dasharray="3 3" opacity="0.7"' : ""} points="${vals.map((v, i) => `${r1(x(i))},${r1(y(v))}`).join(" ")}"><title>${sc.title}${dash ? " (было)" : ""}: ${r1(vals.at(-1)!)} к дню ${DAYS}</title></polyline>`;
    const lines = mine.map((sc) => (base?.[sc.id] ? line(base[sc.id]![m], sc, true) : "") + line(result[sc.id]![m], sc, false)).join("");
    const ends = mine.map((sc) => `<text x="${W - R}" y="${Math.max(T + 8, y(result[sc.id]![m].at(-1)!) - 3)}" text-anchor="end" fill="${COLORS[sc.husband]}">${Math.round(result[sc.id]![m].at(-1)!)}</text>`).join("");
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity="0.12"/>`).join("");
    const days = [1, 7, 14, 21, 30].filter((d) => d <= DAYS).map((d) => `<text x="${x(d - 1)}" y="${H - 5}" text-anchor="middle">${d}</text>`).join("");
    return `<td><svg viewBox="0 0 ${W} ${H}" font-size="10" fill="currentColor">${ticks}${days}${lines}${ends}</svg></td>`;
  };
  const legend = HUSBANDS.filter((h) => SCENARIOS.some((sc) => sc.husband === h.id)).map((h) => `<span><i style="background:${COLORS[h.id]}"></i>${h.title}</span>`).join("") + (base ? `<span><i class="dash"></i>пунктир - как было до правок</span>` : "");
  const head = `<tr><th></th>${wives.map((w) => `<th>${WIFE_RU[w] ?? w}</th>`).join("")}</tr>`;
  const rows = METRICS.map((m) => `<tr><th class="m">${LABEL[m]}</th>${wives.map((w) => chart(m, w)).join("")}</tr>`).join("");
  writeFileSync(
    out,
    `<!doctype html><meta charset="utf-8"><title>test-city: кривые ботов</title><style>body{font:14px system-ui;margin:20px;background:#15171b;color:#dfe2e7}h1{font-size:18px}p{color:#aab0ba;max-width:900px}.legend{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 16px;position:sticky;top:0;background:#15171b;padding:8px 0}.legend i{display:inline-block;width:16px;height:3px;margin-right:6px;vertical-align:middle}.legend i.dash{background:repeating-linear-gradient(90deg,#b8bec9 0 3px,transparent 3px 6px)}table{border-collapse:collapse}th{font-weight:600;padding:6px 8px;color:#dfe2e7}th.m{text-align:right;color:#aab0ba;font-weight:400;max-width:130px}td{padding:4px;border:1px solid #2b2f36;min-width:240px}svg{width:100%;display:block}</style><h1>Кривые ботов: ${DAYS} дней, среднее по ${SEEDS} сидам</h1><p>Колонка - какая жена, цвет линии - как ведёт себя муж. Шкала у строки общая, колонки можно сравнивать глазами. Число справа - значение на последний день.</p><div class="legend">${legend}</div><table>${head}${rows}</table>`,
  );
  process.stderr.write(`written ${out}\n`);
}
