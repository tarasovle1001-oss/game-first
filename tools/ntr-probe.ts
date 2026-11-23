// How a hidden-mode (NTR) game goes with a strict husband: he sits in the kitchen, sleeps with his wife, says "no" to what she asks.
//   npx tsx tools/ntr-probe.ts [seeds=8] [days=14] [preset=bookish] [answer=no|polite|yes]
// Prints per day (averaged over seeds): acts with guests by kind, attempts on a size, what she did alone, what she asked and told.
import { baseMod, bs, lovingStrategy, actById } from "../packages/base/src/probe-exports";
import { createEngine } from "../packages/core/src";
import type { Action, GameState } from "../packages/core/src";

const [seedsArg, daysArg, preset = "bookish", answer = "no", his] = process.argv.slice(2); // his: JSON of the husband setup, e.g. '{"size":6,"minutes":8}'
const seeds = Number(seedsArg ?? 8);
const days = Number(daysArg ?? 14);
const engine = createEngine([baseMod]);
type Row = Record<string, number>;
const perDay: Row[] = Array.from({ length: days + 1 }, () => ({}));
const add = (d: number, k: string, n = 1) => void (perDay[d]![k] = (perDay[d]![k] ?? 0) + n);
const KIND = (key: string): string | null => {
  if (/^log\.take\.(took|partial|failed|never)/.test(key)) return key.split(".")[2]!.replace(/#.*/, "");
  if (key.startsWith("log.take.instead")) return "instead";
  if (key.startsWith("log.solo.") || key.startsWith("log.night.self") || key.startsWith("log.night.toy")) return key.includes("bought") ? "bought" : "solo";
  if (key.startsWith("log.her.browse")) return "browse";
  if (key.startsWith("log.moment.shows_her")) return "shown";
  if (key.startsWith("log.ask.her")) return key.includes("reluctant") ? "ask-" : "ask+";
  if (key.startsWith("log.approach.retro")) return "told";
  if (key.startsWith("log.her.night.") || key.startsWith("log.night.counter")) return "her-night";
  if (key.startsWith("log.act.")) {
    const [, , act, how] = key.replace(/#.*/, "").split(".");
    if (how === "refuse") return "refused";
    try {
      const a = actById(act!);
      return a.tier >= 7 ? "act:pen" : a.tier >= 5 ? "act:oral+" : a.tier >= 3 ? "act:mid" : null;
    } catch {
      return null;
    }
  }
  return null;
};
for (let seed = 1; seed <= seeds; seed++) {
  let s: GameState = engine.init(seed * 101, { base: { preset, mode: "hidden", ...(his ? { husband: JSON.parse(his) } : {}) } as never });
  let last = "";
  const key = (e: GameState["log"][number]) => `${e.turn}|${e.key}|${JSON.stringify(e.params ?? {})}`;
  for (let turn = 0; s.time.day <= days && turn < days * 500; turn++) {
    const actions = engine.listActions(s);
    const permit = actions.filter((a) => a.type === "base/permit");
    const pick: Action = permit.length ? (permit.find((a) => a.payload?.say === answer) ?? permit.find((a) => a.payload?.say === "no") ?? permit[0]!) : lovingStrategy(actions, s, () => ((seed * 7919 + turn * 104729) % 1000) / 1000);
    s = engine.dispatch(s, pick);
    const keys = s.log.map(key);
    const from = last ? keys.lastIndexOf(last) + 1 : 0;
    for (const e of s.log.slice(from)) {
      const k = KIND(e.key);
      if (k) add(Math.min(days, s.time.day), k);
    }
    last = keys[keys.length - 1] ?? last;
    if (s.time.phase === "summary") {
      const h = bs(s).heroine;
      const d = Math.min(days, s.time.day);
      perDay[d]!.open = (perDay[d]!.open ?? 0) + h.traits.openness / 1;
      perDay[d]!.fid = (perDay[d]!.fid ?? 0) + h.traits.fidelity;
      perDay[d]!.n = (perDay[d]!.n ?? 0) + 1;
      perDay[d]!.stretch = (perDay[d]!.stretch ?? 0) + (h.body.vagina.perm ?? 0);
    }
  }
}
const cols = ["act:mid", "act:oral+", "act:pen", "refused", "took", "partial", "failed", "never", "instead", "shown", "browse", "bought", "solo", "ask-", "ask+", "told", "her-night"];
console.log(`${preset}, hidden, husband answers "${answer}", ${seeds} seeds; per day per game`);
console.log(["day", ...cols, "open", "fid", "perm"].map((c) => c.padStart(8)).join(""));
for (let d = 1; d <= days; d++) {
  const r = perDay[d]!;
  const n = r.n || seeds;
  console.log([String(d), ...cols.map((c) => ((r[c] ?? 0) / seeds).toFixed(1)), ((r.open ?? 0) / n).toFixed(0), ((r.fid ?? 0) / n).toFixed(0), ((r.stretch ?? 0) / n).toFixed(1)].map((c) => c.padStart(8)).join(""));
}
