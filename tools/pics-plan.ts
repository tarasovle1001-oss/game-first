// The picture plan for an image pack, in one go (25.11): which pictures the game asks for, how often, and the words for each.
// Bots play the hidden marriage and the open one (in the open one a husband who joins in, so the scenes of three come up),
// every picture key is counted with her look baked in. Scenes the bots never reach but that are the "after he came" twin of a reached
// one (came_x) get the keys of x, so they can be drawn too; what is still not reached is listed as "unreached".
//   pnpm pics:plan [days=30] [seeds=6] [plan=docs/pics/plan.json] [context=pics-context.json]
// plan: key + views (n = hidden + open), small, kept in the repo. context: key -> { title, prompt, views } for the generator, not kept in the repo.
import { writeFileSync } from "node:fs";
import { actOf, baseMod, bs, content, pictureFrames, pictureScene, promptFor, withLook } from "../packages/base/src";
import { createEngine, sceneKey } from "../packages/core/src";
import type { Action, GameState, SceneDesc } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";
import type { Strategy } from "../packages/bots/src";

const [days = "30", seeds = "6", planOut = "docs/pics/plan.json", ctxOut = "pics-context.json"] = process.argv.slice(2);
type Kind = "full" | "portrait" | "detail";
type Mode = "hidden" | "open";
type Row = { desc: SceneDesc; kind: Kind; hidden: number; open: number; derived?: string };
const rows = new Map<string, Row>();
const engine = createEngine([baseMod]);

// A husband of the open marriage who joins in: steps in on the floor, asks to join when she is with a guest,
// and in the scene of three goes through the acts that only exist there, one after another.
const THREE = content.intimacy.bedroom.join;
let turn = 0;
const joiner =
  (how: string): Strategy =>
  (actions, state, roll) => {
    const step = actions.find((a) => a.type === "base/join" && a.payload?.how === how);
    if (step) return step;
    const ask = actions.filter((a) => a.type === "base/react" && a.payload?.how === "join");
    if (ask.length) return ask[turn++ % ask.length]!;
    const night = bs(state).night;
    if (night?.third && actions.some((a) => a.type === "base/bed")) {
      if (!THREE.includes(night.sex?.act ?? "")) {
        const to = actions.filter((a) => a.type === "base/bed" && a.payload?.do === "switch" && THREE.includes(String(a.payload?.to)));
        if (to.length) return to[turn++ % to.length]!;
      }
      return lovingStrategy(actions, state, roll);
    }
    return snoopStrategy(actions, state, roll);
  };
const STRATEGIES: Record<Mode, Strategy[]> = {
  hidden: [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy],
  open: [joiner("hand"), joiner("mouth"), joiner("take"), lovingStrategy, snoopStrategy, awayStrategy],
};

const count = (mode: Mode, desc: SceneDesc | null, kind: Kind = "full") => {
  if (!desc) return;
  const key = sceneKey(desc);
  const r = rows.get(key) ?? { desc, kind, hidden: 0, open: 0 };
  r[mode] += 1;
  rows.set(key, r);
};
const countAll = (mode: Mode, s: GameState, desc: SceneDesc | null) => {
  if (!desc) return;
  count(mode, desc);
  const f = pictureFrames(s, desc);
  count(mode, f.portrait, "portrait");
  for (const d of f.details) count(mode, d, "detail");
};
/** What is really going on with her, whether or not the husband sees it. */
const truth = (s: GameState): SceneDesc | null => {
  const b = bs(s);
  const act = b.encounter ? actOf(b.encounter.act) : null;
  if (!b.encounter || !act) return null;
  return withLook(s, { type: act.scene, location: b.encounter.loc, participants: [{ id: "wife", role: "wife" }, { id: b.encounter.patron, role: "patron" }], tags: {} });
};

const t0 = Date.now();
let game = 0;
const notes: string[] = [];
const games = content.presets.length * Number(seeds) * 2;
for (const mode of ["hidden", "open"] as Mode[])
  for (const preset of content.presets.map((p) => p.id))
    for (let seed = 1; seed <= Number(seeds); seed++) {
      const play = STRATEGIES[mode][seed % STRATEGIES[mode].length]!;
      let s = engine.init(seed, { base: { preset, mode } });
      let inBed = 0;
      let today = 0;
      let moves = 0;
      while (s.time.day <= Number(days)) {
        if (s.time.day !== today) [today, moves] = [s.time.day, 0];
        if (++moves > 20000) {
          notes.push(`${mode} ${preset} seed ${seed}: a day that does not end (day ${s.time.day}), game cut short`);
          break;
        }
        const actions = engine.listActions(s);
        if (!actions.length) {
          notes.push(`${mode} ${preset} seed ${seed}: no actions on day ${s.time.day}, game cut short`);
          break;
        }
        // a bed scene the strategy does not know how to end (she leads, three of them): wrap it up after a while
        const bed = actions.filter((a) => a.type === "base/bed");
        inBed = bed.length ? inBed + 1 : 0;
        const out = inBed > 40 ? (bed.find((a) => a.payload?.do === "finish") ?? bed.find((a) => a.payload?.do === "stop")) : undefined;
        const a: Action = out ?? play(actions, s, () => 0) ?? actions[actions.length - 1]!;
        s = engine.dispatch(s, a);
        const seen = pictureScene(engine, s);
        countAll(mode, s, seen);
        const real = truth(s);
        if (real && (!seen || sceneKey(real) !== sceneKey(seen))) countAll(mode, s, real);
      }
      game += 1;
      process.stderr.write(`\rplaying ${game}/${games} games (${mode}), ${rows.size} keys, ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
    }
process.stderr.write("\n");

// "after he came" twins the bots did not reach: the same keys as the scene itself
const reached = new Set([...rows.values()].filter((r) => r.kind === "full").map((r) => r.desc.type));
let derived = 0;
for (const layout of content.scenes) {
  const from = layout.id.startsWith("came_") ? layout.id.slice(5) : "";
  if (reached.has(layout.id) || !from || !reached.has(from)) continue;
  for (const r of [...rows.values()]) {
    if (r.kind !== "full" || r.desc.type !== from) continue;
    const desc = { ...r.desc, type: layout.id };
    rows.set(sceneKey(desc), { desc, kind: "full", hidden: 0, open: 0, derived: from });
    derived += 1;
  }
}
const got = new Set([...rows.values()].filter((r) => r.kind === "full").map((r) => r.desc.type));
const unreached = content.scenes.map((l) => l.id).filter((id) => !got.has(id));

const ru = content.locales.ru as Record<string, string>;
const title = (type: string) => (type.startsWith("detail_") ? `Деталь крупно: ${type.slice(7).replace(/_/g, " ")}` : (ru[`scene.${type}`] ?? ru[`scene.${type}#1`] ?? type));
const list = (kind: Kind) =>
  [...rows.entries()]
    .filter(([, r]) => r.kind === kind)
    .map(([key, r]) => ({ key, n: r.hidden + r.open, hidden: r.hidden, open: r.open, ...(r.derived ? { like: r.derived } : {}) }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
const plan = { note: "picture keys the game asks for: bots, hidden + open marriage. n = views (hidden + open). like = not reached by the bots, keys taken from that scene. Made by tools/pics-plan.ts", days: Number(days), seeds: Number(seeds), plan: list("full"), portrait: list("portrait"), detail: list("detail"), unreached, notes };
writeFileSync(planOut, JSON.stringify(plan, null, 0).replace(/\},\{/g, "},\n{"));

// scenes the bots never reached still get one key with the game's current words: scene / who is in its layout / a room it happens in
// (the general key the game falls back to), so a picture of it is drawn from today's words, not from an old pack's
const ROOM: Record<string, string> = { bath_walkin: "home.bathroom", bath_together: "home.bathroom", her_cook: "cafe.kitchen", her_rest: "home.bedroom", her_dress: "home.bedroom", flash: "cafe.hall", walk_naked: "cafe.hall", her_shop_toy: "town.sexshop", deal: "cafe.hall", table_sit: "cafe.hall" };
const fallback: Record<string, SceneDesc> = {};
for (const id of unreached) {
  const layout = content.scenes.find((l) => l.id === id)!;
  const roles = [...new Set(layout.figures.map((f) => f.role))];
  const room = ROOM[id] ?? (roles.some((r) => r.startsWith("patron")) ? "cafe.staff" : "home.bedroom");
  fallback[id] = { type: id, location: room, participants: roles.map((r) => ({ id: r === "wife" || r === "husband" ? r : `${r}1`, role: r })), tags: roles.includes("wife") ? { outfit: "sheer_black" } : {} }; // the most worn thing in the plan
}
const context: Record<string, { title: string; prompt: string; views: number; fallback?: boolean }> = {};
for (const desc of Object.values(fallback)) { try { context[sceneKey(desc)] = { title: title(desc.type), prompt: promptFor(desc).positive, views: 0, fallback: true }; } catch {} }
let noWords = 0;
for (const [key, r] of rows) {
  let prompt = "";
  try {
    prompt = promptFor(r.desc).positive;
  } catch {
    noWords += 1;
  }
  context[key] = { title: title(r.desc.type), prompt, views: r.hidden + r.open };
}
writeFileSync(ctxOut, JSON.stringify(context));

console.log(`${plan.plan.length} whole pictures (${derived} of them borrowed for "after he came" scenes), ${plan.portrait.length} portraits, ${plan.detail.length} close-ups`);
console.log(`scenes: ${got.size} of ${content.scenes.length} have keys; not reached: ${unreached.join(", ") || "-"}`);
if (noWords) console.log(`keys without words: ${noWords}`);
for (const n of notes) console.log(`note: ${n}`);
console.log(`plan -> ${planOut}, words for the generator -> ${ctxOut}`);
