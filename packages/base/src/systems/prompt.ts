// A picture key -> the prompt that draws it. Built from the scene description only (type, roles, room, tags),
// never from live state, so the same key always gives the same prompt and a pack can be planned offline.
// Every figure gets its own prompt for regional / masked conditioning: the guest's build never leaks into her.
// Words: look.yaml (clothes, face, marks, act, room, size), prompt.yaml (style, poses), cast.yaml (who each figure is).
import type { SceneDesc } from "@tc/core";
import { sceneFileName, sceneKey } from "@tc/core";
import { actOf, content } from "../content";
import type { Act, Cast, CastCard } from "../content/schema";
import { wearWords } from "./wearwords";

const W = content.look.words;
const P = content.prompt;

export interface ScenePrompt {
  key: string;
  /** notes of the prompt.yaml rules that fired for this scene */
  rules?: string[];
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
  /** a LoRA of this scene's own (prompt.yaml: loras): the generator loads it on top of its usual ones; its file name is the trigger word, already first in `positive` */
  lora?: { file: string; weight: number };
}

/** The LoRA a scene or a close-up is drawn with, if it has one: by its id, or by a prefix written with a star (group_*). */
export function loraOf(type: string): { file: string; weight: number } | undefined {
  const exact = P.loras[type];
  if (exact) return exact;
  const star = Object.keys(P.loras).filter((k) => k.endsWith("*") && type.startsWith(k.slice(0, -1))).sort((a, b) => b.length - a.length)[0];
  return star ? P.loras[star] : undefined;
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
function wifeWords(t: Record<string, string>, scene: string, wife?: CastCard): string[] {
  const words: string[] = wearWords(t, scene, wife).words;
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
function who(cast: Cast, role: string, closeUp = false, exposed = false, head = false): string[] {
  const card = cast[role as Role];
  const adult = role === "wife" ? "adult woman, mature female" : "adult man, mature male";
  if (!card) return [adult];
  // nude words (his penis, her "ass visible through thighs") only where the scene shows the body: alone they undress a dressed figure
  const penis = exposed ? card.nude : role === "wife" ? "" : card.clothes; // a man not shown bare is drawn dressed
  // a faceless close-up keeps the body and the skin of the card, not the face, hair or jewellery that would pull a face in
  // a man's close-up has its own masculine words (body hair, his skin): his slim, soft, pale card alone reads as a woman's
  // a close-up with her head in it (the phone at her ear, a banknote tucked in, her face): her hair too, or it comes out anyone's
  const hair = head ? card.appearance.split(",").map((w) => w.trim()).filter((w) => /hair|bangs|hime cut/.test(w)).join(", ") : "";
  if (closeUp && card.closeup) return [adult, card.closeup, hair, penis];
  if (closeUp) return [adult, card.appearance.split(",").map((w) => w.trim()).filter((w) => /skin|tan/.test(w)).join(", "), hair, card.body, penis];
  return [adult, card.anchor.trim() ? `(${card.anchor.trim()}:${card.strength.toFixed(1)})` : "", card.appearance, card.body, penis];
}

/** `castId`: whose pack this is (cast.yaml); the key does not depend on it. `wife`: her own card (the heroine builder) instead of the cast's. */
export function promptFor(desc: SceneDesc, castId = "default", wife?: CastCard): ScenePrompt {
  const base = content.casts.find((c) => c.id === castId) ?? content.casts[0]!;
  const cast: Cast = wife ? { ...base, wife } : base;
  const key = sceneKey(desc);
  const t = desc.tags ?? {};
  const layout = content.scenes.find((l) => l.id === desc.type);
  // a free close-up has no layout: its words are one line, plus a line for each tag it carries
  const isDetail = desc.type.startsWith("detail_");
  const detailId = isDetail ? desc.type.slice(7) : "";
  // a close-up can have another composition for one value of a tag ("toy_a@tsize.4"), and extra words for one ("toy_v+tsize.3")
  const tagKeys = Object.entries(t).map(([k, v]) => `${k}.${v}`);
  const swapped = tagKeys.map((k) => P.details[`${detailId}@${k}`]).find(Boolean);
  const detailMain = isDetail ? [swapped ?? P.details[detailId] ?? "", ...tagKeys.map((k) => P.details[`${detailId}+${k}`] ?? "")].filter(Boolean).join(", ") : "";
  // a dressed close-up (a bulge, a stain) does not take the size words: they name a penis and undress him; his size shows as the bulge
  const dressedDetail = isDetail && !!P.penis_unless && new RegExp(P.penis_unless, "i").test(detailMain);
  const detailWords = isDetail ? [detailMain, ...Object.entries(t).filter(([k]) => !(dressedDetail && k === "size")).map(([k, v]) => P.details[`${k}.${v}`] ?? "")].filter(Boolean).join(", ") : "";
  // booru tags of the scene (prompt.yaml: tags) lead the prompt; a scene that has them does not use its English pose slots
  // ...and may have extra words for one value of a tag ("group+men.3")
  // ...or other words in one room ("idle@town.square": walking together in the street, not a waitress at the counter)
  const sceneTags = P.tags[`${desc.type}@${desc.location}`] ?? P.tags[desc.type] ?? "";
  // an annoyed face loses to a smile or "flustered" in the scene's own words: those go, and a smile is forbidden
  const cross = t.face === "annoyed" ? new Set(["flustered", "smile", "light smile", "smirk", "grin", "happy", "laughing"]) : null;
  const booru = isDetail
    ? ""
    : [sceneTags, ...tagKeys.map((k) => P.tags[`${desc.type}+${k}`] ?? "")]
        .map((x) => x.trim())
        .filter(Boolean)
        .join(", ")
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w && !cross?.has(w.replace(/^\((.*):[\d.]+\)$/, "$1")))
        .join(", ");
  // rules on top of the scene tags (prompt.yaml: rules): by what the tags say and who is in the scene
  // she is not drawn in this one (him alone with a toy): the rules about her body do not fire
  const herOut = !!P.only[desc.type] && !P.only[desc.type]!.includes("wife");
  const has = (role: string) => desc.participants.some((p) => (role === "patron" ? p.role.startsWith("patron") : p.role === role));
  // close-ups get the rules too (fluids, no censoring), matched on their own words
  const ruleWords = booru || detailWords;
  const fired = ruleWords
    ? P.rules.filter((r) => !(herOut && /pussy|stomach bulge/.test(r.add ?? "")) && new RegExp(r.when, "i").test(ruleWords) && !(r.unless && new RegExp(r.unless, "i").test(ruleWords)) && (!r.with || has(r.with)) && (!r.without || !has(r.without)))
    : [];
  const slots = isDetail ? { scene: detailWords } : booru ? {} : (P.poses[desc.type] ?? {});
  const empty: string[] = [];
  const slot = (name: string) => {
    const v = slots[name] ?? "";
    if (!v.trim()) empty.push(`poses.${desc.type}.${name}`);
    return v;
  };
  // prompt.yaml: only - the figures a scene's picture draws (her alone at the stove: the husband stays out of it)
  const onlyRoles = P.only[desc.type];
  const nobody = isDetail && P.detail_nobody.includes(detailId);
  // a close-up draws its keyed figure and whoever else it shows (his hand on her: her body is the subject)
  const inDesc = new Set(nobody ? [] : [...desc.participants.map((p) => p.role), ...(isDetail ? (P.detail_with[detailId] ?? []) : [])].filter((r) => !onlyRoles || onlyRoles.includes(r)));
  // a close-up has no layout: whoever is in it is drawn, so his skin and size (or her body) still come from the card
  const drawn = isDetail || !layout ? [...inDesc] : [...new Set((layout?.figures ?? []).map((f) => f.role))].filter((r) => inDesc.size === 0 || inDesc.has(r));

  // counts: one girl, the men in the scene (several of one role still count each)
  const men = isDetail ? [...inDesc].filter((r) => MEN.has(r)).length : Math.max(desc.participants.filter((p) => MEN.has(p.role) && inDesc.has(p.role)).length, onlyRoles ? 0 : Number(t.men ?? 0));
  const counts = [inDesc.has("wife") ? "1girl" : "", men > 0 ? `${men}boy${men > 1 ? "s" : ""}` : "", nobody ? "no humans" : ""];
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
    ? join([quality, counts, men > 0 ? booru.replace(/(^|,\s*)solo(?=,|$)/, "") : booru, ...fired.flatMap((r) => (r.add ? [r.add] : [])), t.fin ? W.fin[t.fin] : undefined, t.tsize !== undefined ? P.details[`tsize.${t.tsize}`] : undefined, trigger, t.crowd ? "crowd, onlookers" : undefined])
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
  const sceneWords = isDetail ? detailWords : booru || slot("scene");
  const her = wifeWords(t, sceneWords, cast.wife);
  const herNude = !!P.her_nude_when && new RegExp(P.her_nude_when, "i").test(`${sceneWords}, ${her.join(", ")}`);
  const exposed = !!P.penis_when && new RegExp(P.penis_when, "i").test(sceneWords) && !(P.penis_unless && new RegExp(P.penis_unless, "i").test(sceneWords));
  for (const role of drawn) {
    const cls = SIZE_TAG[role] && t[SIZE_TAG[role]!] !== undefined ? Number(t[SIZE_TAG[role]!]) : undefined;
    // dressed, his size shows as how much the bulge stands out, not as a penis
    const size = cls === undefined ? undefined : exposed ? W.size[cls] : `(bulge:${(0.9 + cls * 0.1).toFixed(1)})`;
    // a figure that is only a hand in this close-up: its skin and the hand, nothing else
    if (isDetail && (P.detail_hands[detailId] ?? []).includes(role)) {
      const card = cast[role as Role];
      regions[role] = join([role === "wife" ? "female hand" : "male hand", (card?.appearance ?? "").split(",").map((w) => w.trim()).filter((w) => /skin|tan/.test(w)).join(", "), role === "wife" ? "wedding ring" : ""]);
      continue;
    }
    regions[role] = join([...who(cast, role, isDetail, role === "wife" ? herNude : exposed, isDetail && role === "wife" && P.detail_head.includes(detailId)), role === "wife" ? her : [], role === "wife" ? fired.flatMap((r) => (r.her ? [r.her] : [])) : [], size, isDetail || booru ? "" : slot(role)]);
  }
  // one man in the scene: no second one, no crowd of copies
  const negative = join([P.style.negative, P.negatives[desc.type], cross ? "(smile:1.2), smirk, grin, happy, flustered" : undefined, ...fired.flatMap((r) => (r.negative ? [r.negative] : [])), men === 1 ? "(2boys:1.3), (multiple boys:1.3)" : men === 0 ? "1boy, male focus" : undefined, ...drawn.map((r) => cast[r as Role]?.negative ?? ""), drawn.includes("wife") ? wearWords(t, sceneWords, cast.wife).negative : undefined]);
  // her first, then the room, then the men (with tags the room sits between them, as in the old packs)
  const others = Object.entries(regions).filter(([r]) => r !== "wife").map(([, v]) => v);
  const positive = booru && !isDetail ? join([shared, regions.wife, room, ...others]) : join([shared, ...Object.values(regions)]);
  // what one figure asks for (his pale skin) must not be forbidden by another figure's card
  const asked = new Set(positive.split(",").map((w) => w.trim().replace(/^\((.*):[\d.]+\)$/, "$1").toLowerCase()));
  const neg = negative.split(", ").filter((w) => !asked.has(w.trim().replace(/^\((.*):[\d.]+\)$/, "$1").toLowerCase())).join(", ");
  const lora = loraOf(desc.type);
  return { key, rules: fired.map((r) => r.note), file: `${sceneFileName(key)}.png`, layout: desc.type, shared, regions, positive: lora ? `${lora.file.replace(/-\d+$/, "")}, ${positive}` : positive, negative: neg, empty, ...(lora ? { lora } : {}) };
}
