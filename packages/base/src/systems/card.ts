// The heroine card: who she is (name, age, story) and how she looks in every picture.
// Made in the builder, kept in the player's library and in the save; the pictures take her look from it.
// Her look becomes the wife entry of the cast (cast.yaml format), so prompts and packs read it like any card.
import type { SceneDesc } from "@tc/core";
import { content } from "../content";
import type { CastCard } from "../content/schema";
import type { BaseSetup } from "./setup";

export interface HeroineCard {
  /** "h_" + random: also the name of her picture folder */
  id: string;
  name: string;
  age: number;
  tagline?: string;
  story?: string;
  /** slot id (heroine.yaml) -> option id; missing = unspecified */
  look: Record<string, string>;
  marks: string[];
  /** own tags, after her look, weights allowed: (freckles:1.3) */
  extra: string;
  /** words only where her body is shown */
  nude: string;
  negative: string;
  /** a set personality: the new-game screen starts from it */
  setup?: BaseSetup;
  createdAt: number;
  updatedAt: number;
}

const H = () => content.heroine;
const clean = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean).join(", ");

/** `rnd` in [0,1): the screen passes its own randomness (the game core has none outside the state). */
export function newCard(name: string, now: number, rnd: () => number): HeroineCard {
  const id = `h_${Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rnd() * 36)]).join("")}`;
  return { id, name, age: 24, look: {}, marks: [], extra: "", nude: H().defaults.nude, negative: H().defaults.negative, createdAt: now, updatedAt: now };
}

/** Every field random, keeping her id and name. `rnd` in [0,1). */
export function randomLook(rnd: () => number): Pick<HeroineCard, "look" | "marks"> {
  const look: Record<string, string> = {};
  for (const s of H().slots) {
    const ids = Object.keys(s.options);
    // some slots are often better left to the model
    if (["eyes", "makeup", "height", "figure"].includes(s.id) && rnd() < 0.5) continue;
    look[s.id] = ids[Math.floor(rnd() * ids.length)]!;
  }
  const marks = Object.keys(H().marks).filter(() => rnd() < 0.12).slice(0, H().maxMarks);
  return { look, marks };
}

/** Tags of one part of her look. */
function partTags(card: Pick<HeroineCard, "look" | "marks" | "extra">, part: "appearance" | "body"): string {
  const words: string[] = [];
  for (const s of H().slots) if (s.part === part && card.look[s.id]) words.push(s.options[card.look[s.id]!] ?? "");
  if (part === "appearance") {
    for (const m of card.marks.slice(0, H().maxMarks)) words.push(H().marks[m] ?? "");
    words.push(card.extra);
  }
  return clean(words.join(", "));
}

/** Her look as a cast card (cast.yaml: wife). */
export function cardToCast(card: HeroineCard): CastCard {
  return { anchor: "", strength: 1.2, appearance: partTags(card, "appearance"), body: partTags(card, "body"), nude: clean(card.nude), clothes: "", closeup: "", negative: clean(card.negative) };
}

/** A short line of her look for the picker: "long black hair, purple eyes, slim". */
export function lookSummary(card: Pick<HeroineCard, "look" | "marks" | "extra">): string {
  const pick = (id: string) => (card.look[id] ? (H().slots.find((s) => s.id === id)?.options[card.look[id]!] ?? "") : "");
  return clean([pick("hair_length"), pick("hair_color"), pick("eye_color"), pick("build"), pick("bust")].join(", ").replace(/[()]|:\d\.\d/g, ""));
}

/** A version of her look: pictures drawn with another look are not hers any more. Short, stable, no crypto. */
export function lookHash(c: CastCard): string {
  let h = 2166136261;
  for (const ch of `${c.appearance}|${c.body}|${c.nude}|${c.negative}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** The folder her pictures live in (on the generator and as a pack): her id and the version of her look. */
export const cardFolder = (card: HeroineCard) => `${card.id}_${lookHash(cardToCast(card))}`;

/** The scenes of the four builder previews. */
export function previewScenes(): { id: string; desc: SceneDesc }[] {
  return H().previews.map((p) => ({ id: p.id, desc: { type: p.type, location: p.location, participants: p.roles.map((role) => ({ id: role, role })), tags: p.tags } }));
}

/** A card read from a file or from storage: anything missing gets a safe default; null if it is not a card at all. */
export function readCard(raw: unknown): HeroineCard | null {
  const r = raw as Partial<HeroineCard> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || !/^h_[a-z0-9]{4,16}$/.test(r.id) || typeof r.name !== "string") return null;
  const slots = new Map(H().slots.map((s) => [s.id, s]));
  const look: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.look ?? {})) if (typeof v === "string" && slots.get(k)?.options[v] !== undefined) look[k] = v;
  const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    id: r.id,
    name: r.name.slice(0, 24),
    // every character is an adult
    age: Math.min(60, Math.max(18, Math.round(Number(r.age) || 24))),
    tagline: str(r.tagline, 120) || undefined,
    story: str(r.story) || undefined,
    look,
    marks: (Array.isArray(r.marks) ? r.marks : []).filter((m): m is string => typeof m === "string" && m in H().marks).slice(0, H().maxMarks),
    extra: str(r.extra),
    nude: typeof r.nude === "string" ? r.nude.slice(0, 2000) : H().defaults.nude,
    negative: typeof r.negative === "string" ? r.negative.slice(0, 2000) : H().defaults.negative,
    setup: r.setup && typeof r.setup === "object" ? r.setup : undefined,
    createdAt: Number(r.createdAt) || 0,
    updatedAt: Number(r.updatedAt) || 0,
  };
}
