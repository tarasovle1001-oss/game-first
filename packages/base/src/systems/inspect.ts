// The inspector: what one action changed, and where each change came from.
// Nothing here drives the game. `inspect(prev, next)` compares two states number by number; the reasons come from
// a short trace the other systems leave while an action runs (`note`), and from what he said or showed (`told`).
import type { Ctx, GameState, ModApi, Params, Tracer } from "@tc/core";
import { content } from "../content";
import { bs } from "../state";
import type { BaseState } from "../state";

export interface TraceEntry {
  k: string; // row id, e.g. "her.mood"
  r: string; // reason id
  a: number; // amount
}
export interface DeltaVia {
  key: string; // reason id or a translation key
  params?: Params;
  amount?: number;
}
export type DeltaGroup = "her" | "bond" | "feel" | "body" | "belief" | "trait" | "guest" | "him" | "house";
export interface DeltaRow {
  id: string;
  group: DeltaGroup;
  label: string; // translation key
  params?: Params;
  from: number;
  to: number;
  delta: number;
  /** Shown big, on the first line. */
  main: boolean;
  /** true: good news, false: bad news, null: neither. */
  good: boolean | null;
  via: DeltaVia[];
}
export interface Inspection {
  minutes: number; // game time the action took
  rows: DeltaRow[];
  /** What he said or showed during this action, as she took it. */
  told: { key: string; params?: Params }[];
}

const TRACE_LIMIT = 80;
// While a traced action runs: one frame per source (the action, then each event), innermost last.
// `seen` is what has already been put down to somebody inside the frame, so that nothing is counted twice.
const frames: { snap: Map<string, number>; seen: Map<string, number> }[] = [];

/** Leave a reason next to a number that is about to move. Safe to call from anywhere. */
export function note(ctx: Ctx, k: string, r: string, a: number) {
  if (!a) return;
  const b = bs(ctx.state);
  if (!b.trace || b.trace.turn !== ctx.state.turn) b.trace = { turn: ctx.state.turn, why: [] };
  const top = frames[frames.length - 1];
  if (top) top.seen.set(k, (top.seen.get(k) ?? 0) + a);
  const same = b.trace.why.find((w) => w.k === k && w.r === r);
  if (same) same.a = Math.round((same.a + a) * 100) / 100;
  else if (b.trace.why.length < TRACE_LIMIT) b.trace.why.push({ k, r, a: Math.round(a * 100) / 100 });
}

const numbers = (state: GameState): Map<string, number> => {
  const out = new Map<string, number>();
  for (const [id, w] of collect(state, [])) out.set(id, w.value);
  return out;
};
/**
 * Hand this to `engine.setTracer` and every change gets a source by itself: the action, or the event whose
 * handlers made it. Reasons left by hand (`note`) come first; the tracer only puts down what nobody explained.
 */
export const tracer: Tracer = {
  before(ctx) {
    frames.push({ snap: numbers(ctx.state), seen: new Map() });
  },
  after(ctx, source) {
    const frame = frames.pop();
    if (!frame) return;
    const now = numbers(ctx.state);
    const parent = frames[frames.length - 1];
    for (const [id, was] of frame.snap) {
      const is = now.get(id);
      if (is === undefined) continue; // a guest who walked out mid-way: nothing to say about him
      const moved = is - was;
      const own = moved - (frame.seen.get(id) ?? 0);
      if (Math.abs(own) >= 0.05) {
        const b = bs(ctx.state);
        if (!b.trace || b.trace.turn !== ctx.state.turn) b.trace = { turn: ctx.state.turn, why: [] };
        const same = b.trace.why.find((w) => w.k === id && w.r === source);
        if (same) same.a = Math.round((same.a + own) * 100) / 100;
        else if (b.trace.why.length < TRACE_LIMIT) b.trace.why.push({ k: id, r: source, a: Math.round(own * 100) / 100 });
      }
      if (parent && moved) parent.seen.set(id, (parent.seen.get(id) ?? 0) + moved);
    }
  },
};
/** Call before a traced dispatch: an action that threw may have left frames behind. */
export const resetTracer = () => void (frames.length = 0);

interface Watch {
  group: DeltaGroup;
  label: string;
  params?: Params;
  value: number;
  main?: boolean;
  /** +1: more is good, -1: more is bad, 0: neither. */
  sign?: 1 | -1 | 0;
  /** Smallest change worth a row. */
  min?: number;
}

const patronsHere = (b: BaseState): string[] => {
  const ids = new Set<string>();
  for (const v of b.shift?.visits ?? []) ids.add(v.patron);
  if (b.encounter) ids.add(b.encounter.patron);
  for (const l of Object.values(b.lodgers)) ids.add(l.patron);
  return [...ids];
};

/** Every number worth watching, by row id. */
function collect(state: GameState, also: string[]): Map<string, Watch> {
  const b = bs(state);
  const h = b.heroine;
  const out = new Map<string, Watch>();
  const put = (id: string, w: Watch) => void out.set(id, w);

  put("her.energy", { group: "her", label: "stat.energy", value: h.energy, main: true, sign: 1 });
  put("her.mood", { group: "her", label: "stat.mood", value: h.mood, main: true, sign: 1 });
  put("her.arousal", { group: "her", label: "stat.arousal", value: h.arousal, main: true, sign: 0 });
  put("her.drunk", { group: "her", label: "stat.drunk", value: h.drunk, main: true, sign: 0 });
  put("her.satisfied", { group: "her", label: "stat.satisfied", value: h.satisfied, sign: 1 });
  put("her.frustration", { group: "her", label: "stat.frustration", value: h.frustration, sign: -1 });
  put("her.annoy.guests", { group: "her", label: "ui.annoy.guests", value: h.annoyance ?? 0, main: true, sign: -1 });
  put("her.annoy.him", { group: "her", label: "ui.annoy.him", value: h.annoyHim ?? 0, main: true, sign: -1 });

  put("bond.trust", { group: "bond", label: "ui.trust", value: h.marriage.trust ?? content.mind.trust.start, main: true, sign: 1 });
  put("bond.desire", { group: "bond", label: "stat.desire", value: h.marriage.desire, main: true, sign: 1 });
  put("bond.resent", { group: "bond", label: "stat.resent", value: h.marriage.resent, main: true, sign: -1 });
  put("bond.suspicion", { group: "bond", label: "ui.suspicion", value: b.suspicion, sign: -1 });
  put("bond.power", { group: "bond", label: "ui.power", value: b.power, sign: 0 });

  for (const [e, v] of Object.entries(h.feel ?? {})) put(`feel.${e}`, { group: "feel", label: "inspect.feel", params: { what: `emotion.${e}` }, value: v ?? 0, sign: e === "tenderness" || e === "delight" || e === "pride" ? 1 : -1 });
  for (const [k, v] of Object.entries(h.traits)) put(`trait.${k}`, { group: "trait", label: "inspect.trait", params: { what: `trait.${k}` }, value: v, sign: 0, min: 0.05 });
  for (const [z, v] of Object.entries(h.sore ?? {})) put(`sore.${z}`, { group: "body", label: "inspect.sore", params: { zone: `zone.${z}` }, value: v, sign: -1 });
  for (const [z, v] of Object.entries(h.body)) put(`stretch.${z}`, { group: "body", label: "inspect.stretch", params: { zone: `zone.${z}` }, value: v.stretch, sign: 0 });
  for (const [a, v] of Object.entries(h.tastes.acts)) put(`taste.${a}`, { group: "trait", label: "inspect.taste", params: { act: `act.${a}` }, value: v, sign: 0, min: 0.05 });
  for (const [a, v] of Object.entries(h.skills)) put(`skill.${a}`, { group: "trait", label: "inspect.skill", params: { act: `act.${a}` }, value: v, sign: 1, min: 0.05 });

  // what she thinks he allows, act by act: only the ones she has an idea about
  for (const [a, v] of Object.entries(b.expect)) put(`belief.${a}`, { group: "belief", label: "inspect.belief", params: { act: `act.${a}` }, value: v, sign: 0 });
  for (const [item, say] of Object.entries(b.perm ?? {})) put(`perm.${item}`, { group: "belief", label: "inspect.perm", params: { item: `item.${item}` }, value: say === "allow" ? 1 : -1, sign: 0 });

  for (const id of new Set([...patronsHere(b), ...also])) {
    const p = b.patrons[id];
    if (!p) continue;
    const name = { name: `@name:${p.name}` };
    put(`guest.${id}.affinity`, { group: "guest", label: "inspect.guest.affinity", params: name, value: p.memory.affinity, sign: 0 });
    put(`guest.${id}.interest`, { group: "guest", label: "inspect.guest.interest", params: name, value: p.memory.interest, sign: 0 });
    put(`guest.${id}.tier`, { group: "guest", label: "inspect.guest.tier", params: name, value: p.memory.tier, sign: 0 });
    const v = b.shift?.visits.find((x) => x.patron === id);
    if (v) {
      put(`guest.${id}.heat`, { group: "guest", label: "inspect.guest.heat", params: name, value: v.heat ?? 0, sign: 0 });
      put(`guest.${id}.drunk`, { group: "guest", label: "inspect.guest.drunk", params: name, value: v.drunk ?? 0, sign: 0 });
    }
  }

  put("him.energy", { group: "him", label: "inspect.him.energy", value: b.husband.energy ?? 0, sign: 1 });
  put("him.mood", { group: "him", label: "inspect.him.mood", value: b.husband.mood ?? 0, sign: 1 });
  put("him.arousal", { group: "him", label: "inspect.him.arousal", value: b.husband.arousal ?? 0, sign: 0 });

  put("house.money", { group: "house", label: "ui.money", value: b.money, main: true, sign: 1, min: 0.5 });
  put("house.purse", { group: "house", label: "inspect.purse", value: b.purse, sign: 1, min: 0.5 });
  put("house.debt", { group: "house", label: "ui.debt", value: b.debt, sign: -1, min: 0.5 });
  put("house.stock", { group: "house", label: "ui.stock", value: b.stock, sign: 1, min: 0.5 });
  put("house.clean", { group: "house", label: "ui.clean", value: b.clean, sign: 1 });
  put("house.reputation", { group: "house", label: "ui.reputation", value: b.reputation, sign: 1 });
  put("house.gossip", { group: "house", label: "ui.gossip", value: b.gossip, sign: -1 });
  return out;
}

const GROUP_ORDER: DeltaGroup[] = ["her", "bond", "feel", "body", "belief", "guest", "trait", "him", "house"];
const round = (v: number) => Math.round(v * 10) / 10;

/** What changed between two states of the same game, and why, as far as anybody left a note. */
export function inspect(prev: GameState, next: GameState): Inspection {
  const pb = bs(prev);
  const nb = bs(next);
  // guests who have just left still deserve their rows
  const before = collect(prev, patronsHere(nb));
  const after = collect(next, patronsHere(pb));
  const trace = nb.trace && nb.trace.turn === next.turn ? nb.trace.why : [];
  // `told` is a short rolling list: what is new sits at its tail
  const told = nb.told.filter((x) => !pb.told.includes(x));
  const rows: DeltaRow[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const z = after.get(id);
    const w = (z ?? a)!;
    if (w.group === "guest" && (!a || !z)) continue; // he has just walked in or out: not a change
    const from = a?.value ?? 0;
    const to = z?.value ?? 0;
    const delta = to - from;
    if (Math.abs(delta) < (w.min ?? 0.1)) continue;
    const via: DeltaVia[] = trace.filter((x) => x.k === id && Math.abs(x.a) >= 0.05).map((x) => ({ key: x.r, amount: round(x.a) }));
    if (w.group === "belief") for (const x of told) via.push({ key: x.key, ...(x.params ? { params: x.params } : {}) });
    const sign = w.sign ?? 0;
    rows.push({ id, group: w.group, label: w.label, ...(w.params ? { params: w.params } : {}), from: round(from), to: round(to), delta: round(delta), main: !!w.main, good: sign === 0 ? null : delta * sign > 0, via });
  }
  rows.sort((x, y) => Number(y.main) - Number(x.main) || GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || Math.abs(y.delta) - Math.abs(x.delta));
  const minutes = (next.time.day - prev.time.day) * 1440 + next.time.minute - prev.time.minute;
  return { minutes, rows, told: told.map((x) => ({ key: x.key, ...(x.params ? { params: x.params } : {}) })) };
}

export function registerInspect(api: ModApi) {
  api.invariants.add("inspect", (s) => {
    const t = bs(s).trace;
    return !t || t.why.length <= TRACE_LIMIT ? null : "the inspector trace has outgrown its limit";
  });
}
