// Playtest curves: the three playtest scenarios played by bots, day by day.
// pnpm exec tsx tools/curves.ts [days=30] [seeds=8] [out.html]
// Prints a table per scenario (mean over seeds) and, with a third argument, writes a page with the curves.
import { writeFileSync } from "node:fs";
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

const SCENARIOS: { id: string; title: string; preset: string; make: () => Strategy }[] = [
  { id: "strict", title: "1. верная, муж всё запрещает", preset: "faithful", make: strict },
  { id: "neutral", title: "2. обычная, муж на кухне", preset: "ordinary", make: () => nights(away) },
  { id: "push", title: "3. обычная, муж толкает", preset: "ordinary", make: pusher },
];

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
      const next = engine.dispatch(s, play(engine.listActions(s), s, rnd));
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
const marks = [1, 2, 3, 5, 7, 10, 14, 21, 30].filter((d) => d <= DAYS);
for (const sc of SCENARIOS) {
  console.log(`\n${sc.title} (${sc.preset}, среднее по ${SEEDS} сидам)`);
  console.log("день".padEnd(30) + marks.map((d) => String(d).padStart(7)).join(""));
  for (const m of METRICS) console.log(LABEL[m].padEnd(30) + marks.map((d) => String(r1(result[sc.id]![m][d - 1]!)).padStart(7)).join(""));
}

if (out) {
  const COLORS = ["#2a78d6", "#8a8f98", "#d6532a"];
  const W = 340, H = 150, L = 34, R = 8, T = 8, B = 20;
  const chart = (m: Metric) => {
    const all = SCENARIOS.flatMap((sc) => result[sc.id]![m]);
    const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    const x = (i: number) => L + (i / Math.max(1, DAYS - 1)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const lines = SCENARIOS.map((sc, k) => `<polyline fill="none" stroke="${COLORS[k]}" stroke-width="2" points="${result[sc.id]![m].map((v, i) => `${r1(x(i))},${r1(y(v))}`).join(" ")}"><title>${sc.title}</title></polyline>`).join("");
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity="0.12"/>`).join("");
    const days = [1, 7, 14, 21, 30].filter((d) => d <= DAYS).map((d) => `<text x="${x(d - 1)}" y="${H - 5}" text-anchor="middle">${d}</text>`).join("");
    return `<figure><figcaption>${LABEL[m]}</figcaption><svg viewBox="0 0 ${W} ${H}" font-size="10" fill="currentColor">${ticks}${days}${lines}</svg></figure>`;
  };
  const legend = SCENARIOS.map((sc, k) => `<span><i style="background:${COLORS[k]}"></i>${sc.title}</span>`).join("");
  writeFileSync(
    out,
    `<!doctype html><meta charset="utf-8"><title>test-city: кривые ботов</title><style>body{font:14px system-ui;margin:20px;background:#15171b;color:#dfe2e7}h1{font-size:18px}.legend{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 16px}.legend i{display:inline-block;width:14px;height:3px;margin-right:6px;vertical-align:middle}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}figure{margin:0;padding:10px;border:1px solid #2b2f36;border-radius:10px}figcaption{margin-bottom:4px;color:#aab0ba}svg{width:100%;display:block}</style><h1>Кривые ботов: ${DAYS} дней, среднее по ${SEEDS} сидам</h1><div class="legend">${legend}</div><div class="grid">${METRICS.map(chart).join("")}</div>`,
  );
  process.stderr.write(`written ${out}\n`);
}
