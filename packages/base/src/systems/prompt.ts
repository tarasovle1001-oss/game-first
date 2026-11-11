// A picture key -> the prompt that draws it. Built from the scene description only (type, roles, room, tags),
// never from live state, so the same key always gives the same prompt and a pack can be planned offline.
// Every figure gets its own prompt for regional / masked conditioning: the guest's build never leaks into her.
// Words: look.yaml (clothes, face, marks, act, room, size), prompt.yaml (style, poses), cast.yaml (who each figure is).
import type { SceneDesc } from "@tc/core";
import { sceneFileName, sceneKey } from "@tc/core";
import { content } from "../content";
import type { Act, Cast } from "../content/schema";

const W = content.look.words;
const P = content.prompt;

export interface ScenePrompt {
  key: string;
  file: string;
  /** the mannequin layout this picture is drawn over (depth, masks, skeleton) */
  layout: string;
  /** words for the whole frame: style, counts, act, the moment, room */
  shared: string;
  /** one prompt per drawn figure, by role */
  regions: Record<string, string>;
  /** all of it in one line, for a single-pass test without masks */
  positive: string;
  negative: string;
  /** slots of prompt.yaml this picture needs that are still empty */
  empty: string[];
}

/** The act a layout draws, if it is one: by the layout acts.yaml names, else by its own id (the bed uses act ids). */
export const sceneAct = (type: string): Act | undefined => content.acts.find((a) => a.scene === type) ?? content.acts.find((a) => a.id === type);

const nth = (table: [number, string][] | undefined, n: number) => (n > 0 ? table?.[n - 1]?.[1] : undefined);
/** "v2a1" -> [["v", 2], ["a", 1]] */
const levels = (v: string | undefined) => [...(v ?? "").matchAll(/([a-z])(\d)/g)].map((m) => [m[1]!, Number(m[2])] as const);
const ZONE: Record<string, string> = { v: "vagina", a: "anus", m: "mouth" };
const MEN = new Set(["husband", "patron", "patron2", "patron3"]);

function join(parts: (string | string[] | undefined | null | false)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts.flat())
    for (const tag of (p || "").split(",").map((t) => t.trim()))
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        out.push(tag);
      }
  return out.join(", ");
}

/** Her part: who she is, then what she has on, her face, her body, what is on her, then her pose. */
function wifeWords(t: Record<string, string>): string[] {
  const words: string[] = [];
  if (t.outfit) words.push(W.outfit[t.outfit] ?? t.outfit);
  if (t.bare) words.push(...(W.bare[t.bare] ?? []));
  if (t.under) words.push(W.panties[t.under] ?? "");
  if (t.skirt) words.push(W.skirtUp);
  if (t.face) words.push(...(W.mood.find((m) => m.when === t.face)?.tags ?? []));
  if (t.drunk) words.push(t.drunk);
  for (const [z, n] of levels(t.gape)) words.push(nth(W.stretch[ZONE[z]!], n) ?? "");
  for (const [z, n] of levels(t.sore)) words.push(nth(W.sore[ZONE[z]!], n) ?? "");
  for (const m of (t.marks ?? "").split("+").filter(Boolean)) words.push(W.cum[m] ?? "");
  if (t.after) words.push(...Object.values(W.after));
  return words;
}

const SIZE_TAG: Record<string, string> = { patron: "size", patron2: "size2", patron3: "size3", husband: "hsize" };

type Role = "wife" | "husband" | "patron" | "patron2" | "patron3" | "watcher";
/** Who a figure is: always an adult, then the card - the anchor, the look, the body. */
function who(cast: Cast, role: string): string[] {
  const card = cast[role as Role];
  const adult = role === "wife" ? "adult woman, mature female" : "adult man, mature male";
  if (!card) return [adult];
  return [adult, card.anchor.trim() ? `(${card.anchor.trim()}:${card.strength.toFixed(1)})` : "", card.appearance, card.body];
}

/** `castId`: whose pack this is (cast.yaml); the key does not depend on it. */
export function promptFor(desc: SceneDesc, castId = "default"): ScenePrompt {
  const cast = content.casts.find((c) => c.id === castId) ?? content.casts[0]!;
  const key = sceneKey(desc);
  const t = desc.tags ?? {};
  const layout = content.scenes.find((l) => l.id === desc.type);
  const slots = P.poses[desc.type] ?? {};
  const empty: string[] = [];
  const slot = (name: string) => {
    const v = slots[name] ?? "";
    if (!v.trim()) empty.push(`poses.${desc.type}.${name}`);
    return v;
  };
  const inDesc = new Set(desc.participants.map((p) => p.role));
  const drawn = [...new Set((layout?.figures ?? []).map((f) => f.role))].filter((r) => inDesc.size === 0 || inDesc.has(r));

  // counts: one girl, the men in the scene (several of one role still count each)
  const men = Math.max(desc.participants.filter((p) => MEN.has(p.role)).length, Number(t.men ?? 0));
  const counts = [desc.participants.some((p) => p.role === "wife") ? "1girl" : "", men > 0 ? `${men}boy${men > 1 ? "s" : ""}` : ""];
  const act = sceneAct(desc.type);
  if (!P.style.prefix.trim()) empty.push("style.prefix");
  const shared = join([
    P.style.prefix,
    counts,
    act ? W.act[act.id] : undefined,
    t.fin ? W.fin[t.fin] : undefined,
    slot("scene"),
    W.room[desc.location] ?? desc.location,
    t.crowd ? "crowd, onlookers" : undefined,
  ]);

  const regions: Record<string, string> = {};
  for (const role of drawn) {
    const size = SIZE_TAG[role] && t[SIZE_TAG[role]!] !== undefined ? W.size[Number(t[SIZE_TAG[role]!])] : undefined;
    regions[role] = join([...who(cast, role), role === "wife" ? wifeWords(t) : [], size, slot(role)]);
  }
  const negative = join([P.style.negative, ...drawn.map((r) => cast[r as Role]?.negative ?? "")]);
  return { key, file: `${sceneFileName(key)}.png`, layout: desc.type, shared, regions, positive: join([shared, ...Object.values(regions)]), negative, empty };
}
