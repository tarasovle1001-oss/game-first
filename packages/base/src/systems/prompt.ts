// A picture key -> the prompt that draws it. Built from the scene description only (type, roles, room, tags),
// never from live state, so the same key always gives the same prompt and a pack can be planned offline.
// Every figure gets its own prompt for regional / masked conditioning: the guest's build never leaks into her.
// Words: look.yaml (clothes, face, marks, act, room, size), prompt.yaml (style, poses), cast.yaml (who each figure is).
import type { SceneDesc } from "@tc/core";
import { sceneFileName, sceneKey } from "@tc/core";
import { actOf, content } from "../content";
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
export const sceneAct = (type: string): Act | undefined => content.acts.find((a) => a.scene === type) ?? actOf(type);

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
function who(cast: Cast, role: string, closeUp = false): string[] {
  const card = cast[role as Role];
  const adult = role === "wife" ? "adult woman, mature female" : "adult man, mature male";
  if (!card) return [adult];
  // a faceless close-up keeps the body and the skin of the card, not the face, hair or jewellery that would pull a face in
  if (closeUp) return [adult, card.appearance.split(",").map((w) => w.trim()).filter((w) => /skin|tan/.test(w)).join(", "), card.body];
  return [adult, card.anchor.trim() ? `(${card.anchor.trim()}:${card.strength.toFixed(1)})` : "", card.appearance, card.body];
}

/** `castId`: whose pack this is (cast.yaml); the key does not depend on it. */
export function promptFor(desc: SceneDesc, castId = "default"): ScenePrompt {
  const cast = content.casts.find((c) => c.id === castId) ?? content.casts[0]!;
  const key = sceneKey(desc);
  const t = desc.tags ?? {};
  const layout = content.scenes.find((l) => l.id === desc.type);
  // a free close-up has no layout: its words are one line, plus a line for each tag it carries
  const isDetail = desc.type.startsWith("detail_");
  const detailWords = isDetail ? [P.details[desc.type.slice(7)] ?? "", ...Object.entries(t).map(([k, v]) => P.details[`${k}.${v}`] ?? "")].filter(Boolean).join(", ") : "";
  // booru tags of the scene (prompt.yaml: tags) lead the prompt; a scene that has them does not use its English pose slots
  const booru = isDetail ? "" : (P.tags[desc.type] ?? "").trim();
  const slots = isDetail ? { scene: detailWords } : booru ? {} : (P.poses[desc.type] ?? {});
  const empty: string[] = [];
  const slot = (name: string) => {
    const v = slots[name] ?? "";
    if (!v.trim()) empty.push(`poses.${desc.type}.${name}`);
    return v;
  };
  const inDesc = new Set(desc.participants.map((p) => p.role));
  // a close-up has no layout: whoever is in it is drawn, so his skin and size (or her body) still come from the card
  const drawn = isDetail ? [...inDesc] : [...new Set((layout?.figures ?? []).map((f) => f.role))].filter((r) => inDesc.size === 0 || inDesc.has(r));

  // counts: one girl, the men in the scene (several of one role still count each)
  const men = Math.max(desc.participants.filter((p) => MEN.has(p.role)).length, Number(t.men ?? 0));
  const counts = [desc.participants.some((p) => p.role === "wife") ? "1girl" : "", men > 0 ? `${men}boy${men > 1 ? "s" : ""}` : ""];
  const act = sceneAct(desc.type);
  if (!P.style.prefix.trim()) empty.push("style.prefix");
  // quality first, then who does what, then the style trigger (the order the Wayward packs were drawn with)
  const prefix = P.style.prefix.split(",").map((w) => w.trim());
  const trigger = prefix.filter((w) => /sora|\\\(/.test(w));
  const quality = prefix.filter((w) => !trigger.includes(w));
  // the room's first word carries the weight (a room line has several words now)
  const roomWords = (W.room[desc.location] ?? desc.location).split(",").map((w) => w.trim());
  const room = isDetail ? P.style.detail : [`(${roomWords[0]}:1.2)`, ...roomWords.slice(1)].join(", ");
  const shared = booru
    ? join([quality, counts, men > 0 ? booru.replace(/(^|,\s*)solo(?=,|$)/, "") : booru, t.fin ? W.fin[t.fin] : undefined, trigger, t.crowd ? "crowd, onlookers" : undefined])
    : join([
        P.style.prefix,
        counts,
        act ? W.act[act.id] : undefined,
        t.fin ? W.fin[t.fin] : undefined,
        slot("scene"),
        // a close-up has no room in it: a blank, out-of-focus background instead, so one picture fits anywhere
        isDetail ? P.style.detail : (W.room[desc.location] ?? desc.location),
        t.crowd ? "crowd, onlookers" : undefined,
      ]);

  const regions: Record<string, string> = {};
  for (const role of drawn) {
    const size = SIZE_TAG[role] && t[SIZE_TAG[role]!] !== undefined ? W.size[Number(t[SIZE_TAG[role]!])] : undefined;
    regions[role] = join([...who(cast, role, isDetail), role === "wife" ? wifeWords(t) : [], size, isDetail || booru ? "" : slot(role)]);
  }
  // one man in the scene: no second one, no crowd of copies
  const negative = join([P.style.negative, P.negatives[desc.type], men === 1 ? "(2boys:1.2), multiple boys" : undefined, ...drawn.map((r) => cast[r as Role]?.negative ?? "")]);
  // her first, then the room, then the men (with tags the room sits between them, as in the old packs)
  const others = Object.entries(regions).filter(([r]) => r !== "wife").map(([, v]) => v);
  const positive = booru && !isDetail ? join([shared, regions.wife, room, ...others]) : join([shared, ...Object.values(regions)]);
  // what one figure asks for (his pale skin) must not be forbidden by another figure's card
  const asked = new Set(positive.split(",").map((w) => w.trim().replace(/^\((.*):[\d.]+\)$/, "$1").toLowerCase()));
  const neg = negative.split(", ").filter((w) => !asked.has(w.trim().replace(/^\((.*):[\d.]+\)$/, "$1").toLowerCase())).join(", ");
  return { key, file: `${sceneFileName(key)}.png`, layout: desc.type, shared, regions, positive, negative: neg, empty };
}
