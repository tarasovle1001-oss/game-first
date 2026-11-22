// Which picture of a pack to show for a scene. The exact one when the pack has it; otherwise the nearest picture of the
// same scene with the same people: a pack is drawn from the keys some games ran into, and another game asks for
// combinations of her look (face, marks, what is off) that nobody drew. Weights: look.yaml: match.
import { sceneFileName, sceneKey } from "@tc/core";
import type { SceneDesc } from "@tc/core";
import { content } from "../content";
import { resolveFrames } from "./look";
import type { PictureFrames } from "./look";

export interface PackEntry {
  stem: string;
  key: string;
  room: string;
  tags: Record<string, string>;
}
/** Pictures by `type__roles`. */
export type PackIndex = Map<string, PackEntry[]>;

/** File stems (no extension, no `~N`) -> index. Names that are not picture keys are skipped. */
export function packIndex(stems: Iterable<string>): PackIndex {
  const index: PackIndex = new Map();
  for (const stem of new Set(stems)) {
    const [type, roles, room, tagText] = stem.split("__");
    if (!type || !roles || !room) continue;
    const tags: Record<string, string> = {};
    for (const pair of (tagText ?? "").split(",").filter(Boolean)) {
      const at = pair.indexOf("=");
      if (at > 0) tags[pair.slice(0, at)] = pair.slice(at + 1);
    }
    const group = `${type}__${roles}`;
    const key = [type, roles, room === "any" ? "*" : room, tagText].filter(Boolean).join("/");
    (index.get(group) ?? index.set(group, []).get(group)!).push({ stem, key, room, tags });
  }
  return index;
}

const M = () => content.look.match;
/** How far apart two values of one tag are, 0..1: sizes by distance, lists ("anus+thighs") by what they do not share. */
function apart(a: string, b: string): number {
  if (a === b) return 0;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Math.min(1, Math.abs(Number(a) - Number(b)) / 2);
  if (a.includes("+") || b.includes("+")) {
    const x = new Set(a.split("+"));
    const y = new Set(b.split("+"));
    const all = new Set([...x, ...y]);
    return [...all].filter((v) => !(x.has(v) && y.has(v))).length / all.size;
  }
  return 1;
}
/** The cost of showing this picture for that scene: 0 = the very picture. */
export function pictureCost(want: SceneDesc, have: PackEntry): number {
  const m = M();
  const asked = want.tags ?? {};
  let cost = have.room === want.location ? 0 : have.room === "any" || want.location === "any" ? m.room / 2 : m.room;
  for (const k of new Set([...Object.keys(asked), ...Object.keys(have.tags)])) {
    const w = m.tags[k] ?? m.other;
    const a = asked[k];
    const b = have.tags[k];
    // the picture leaves a thing out: less wrong than showing what is not so
    cost += a === undefined ? w : b === undefined ? w * m.lacks : w * apart(a, b);
  }
  return cost;
}

export interface Found {
  stem: string;
  key: string;
  exact: boolean;
  cost: number;
}
/** The picture for a scene: exact, or the nearest of the same scene and people. `cap`: give up beyond this cost. */
export function findPicture(index: PackIndex, desc: SceneDesc, cap = Infinity): Found | null {
  const roles = [...new Set(desc.participants.map((p) => p.role))].sort().join("+") || "none";
  const list = index.get(`${desc.type}__${roles}`);
  if (!list?.length) return null;
  const exact = sceneFileName(sceneKey(desc));
  let best: PackEntry | null = null;
  let bestCost = Infinity;
  for (const e of list) {
    if (e.stem === exact) return { stem: e.stem, key: e.key, exact: true, cost: 0 };
    const c = pictureCost(desc, e);
    // ties: the shorter name, then by name - the same answer on every run
    if (c < bestCost || (c === bestCost && best && (e.stem.length < best.stem.length || (e.stem.length === best.stem.length && e.stem < best.stem)))) {
      best = e;
      bestCost = c;
    }
  }
  return best && bestCost <= cap ? { stem: best.stem, key: best.key, exact: false, cost: bestCost } : null;
}

export type Hit = Found & { desc: SceneDesc };
/**
 * What a pack puts on screen for a scene: the whole picture when it has one close enough (look.yaml: match.wholeCap),
 * otherwise her portrait with the close-ups; a far-off whole picture only when there is no portrait either. Null = the mannequin.
 */
export function packLayout(index: PackIndex, frames: PictureFrames): { main: Hit; inserts: Hit[]; split: boolean } | null {
  const find = (cap: number) => (d: SceneDesc): Hit | null => {
    const whole = d === frames.full;
    const f = findPicture(index, d, whole ? cap : Infinity);
    return f ? { ...f, desc: d } : null;
  };
  // her alone, doing nothing: her portrait is that very picture, so the whole one must be at least as near
  const alone = frames.full.type === "idle" && frames.full.participants.every((p) => p.role === "wife") && frames.portrait;
  const portrait = alone ? findPicture(index, frames.portrait!) : null;
  const cap = portrait ? Math.min(M().wholeCap, portrait.cost) : M().wholeCap;
  return resolveFrames<Hit>(frames, find(cap)) ?? resolveFrames<Hit>(frames, find(Infinity));
}
