// What picture the game shows for what: every layout, when it comes up, and the events that have no picture of their own.
// pnpm exec tsx tools/scene-audit.ts [days=20] [seeds=3] out.json
// Bots play with the "watch scenes" view (the picture follows her everywhere). For every move it notes the layout on screen
// and the log lines the move wrote; lines that keep appearing under "idle" or "serving" are events without a picture.
import { writeFileSync } from "node:fs";
import { actOf, baseMod, bs, content } from "../packages/base/src";
import { createEngine, makeRng } from "../packages/core/src";
import type { GameState } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, randomStrategy, snoopStrategy } from "../packages/bots/src";

const [daysArg = "20", seedsArg = "3", out = "scene-audit.json"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const strategies = { random: randomStrategy, owner: ownerStrategy, away: awayStrategy, loving: lovingStrategy, snoop: snoopStrategy };
const family = (key: string) => key.replace(/#\d+$/, "").replace(/\.(eager|hesitant|refuse|no|kind|warm|hard|public|sauna|heard|open|hers)$/g, "").replace(/\.\d+$/, "").replace(/\.(eager|hesitant|refuse)$/, "");
const watch = (s: GameState): GameState => ({ ...s, mods: { ...s.mods, base: { ...bs(s), viewAll: true } } }) as GameState;

const shows: Record<string, number> = {}; // layout -> moves it was on screen
const starts: Record<string, Record<string, number>> = {}; // layout -> log family on the move it appeared
const under: Record<string, Record<string, number>> = {}; // log family -> layout on screen when the line was written
let moves = 0;
for (const [, play] of Object.entries(strategies))
  for (const preset of content.presets.map((p) => p.id))
    for (let seed = 1; seed <= Number(seedsArg); seed++) {
      const bot = makeRng({ rng: seed * 7919 + 13 });
      let s = engine.init(seed, { base: { preset } });
      let last = "";
      for (let i = 0; i < 200000 && s.time.day <= Number(daysArg); i++) {
        s = engine.dispatch(s, play(engine.listActions(s), s, () => bot.int(0, 9999) / 10000));
        const type = engine.currentScene(watch(s))?.type ?? "(none)";
        moves += 1;
        shows[type] = (shows[type] ?? 0) + 1;
        const lines = [...new Set(s.log.filter((e) => e.turn === s.turn && !e.tags?.includes("thought") && !e.tags?.includes("minor")).map((e) => family(e.key)))];
        for (const k of lines) ((under[k] ??= {})[type] = (under[k]![type] ?? 0) + 1);
        if (type !== last) for (const k of lines.slice(0, 3)) ((starts[type] ??= {})[k] = (starts[type]![k] ?? 0) + 1);
        last = type;
      }
    }

const top = (o: Record<string, number> | undefined, n: number) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n);
const PLAIN = new Set(["idle", "serving", "sleeping", "night_awake", "(none)", "talk", "her_cook", "her_tidy", "her_rest", "her_dress"]);
const actScenes = new Map(content.acts.map((a) => [a.scene, a]));
const layouts = content.scenes.map((l) => {
  const roles = l.figures.map((f) => f.role);
  const men = roles.filter((r) => r !== "wife" && r !== "watcher").length;
  const her = roles.includes("wife");
  const act = actScenes.get(l.id) ?? actOf(l.id) ?? actOf(l.id.replace(/^(came|fin|lead|join)_/, ""));
  const intimate = !!act && act.tier >= 5;
  // a first guess, to be overruled by the generation test: what composition this picture needs
  const bucket = !her ? "общий план без неё" : men === 0 ? "она одна" : men >= 2 ? `портрет + ${Math.min(3, men)} вставки` : intimate || /^(came|fin|lead)_/.test(l.id) ? "общий план или портрет + вставка" : "общий план";
  return { id: l.id, roles: roles.join(", "), men, intimate, tier: act?.tier ?? null, shows: shows[l.id] ?? 0, share: Math.round(((shows[l.id] ?? 0) / moves) * 10000) / 100, when: top(starts[l.id], 2).map(([k]) => k).join("; "), bucket };
});
const known = new Set(content.scenes.map((l) => l.id));
const events = Object.entries(under)
  .map(([key, by]) => {
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    const plain = Object.entries(by).filter(([t]) => PLAIN.has(t)).reduce((a, [, n]) => a + n, 0);
    return { key, total, plainShare: Math.round((plain / total) * 100), on: top(by, 3).map(([t, n]) => `${t} ${Math.round((n / total) * 100)}%`).join(", ") };
  })
  .sort((a, b) => b.total - a.total);
const unknown = Object.keys(shows).filter((t) => !known.has(t) && t !== "(none)");
writeFileSync(out, JSON.stringify({ moves, layouts, events, unknown }, null, 1));
console.log(`${moves} moves; ${layouts.length} layouts, never shown: ${layouts.filter((l) => l.shows === 0).length}; events seen: ${events.length}; scene types without a layout: ${unknown.join(", ") || "none"}`);
