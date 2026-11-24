// Her clothes in words for a picture: the same outfit, the same bra and panties, whether it is all on,
// her top pulled down, her skirt up, or pushed aside for an act. look.yaml: words.outfit, words.under.
import { content } from "../content";
import type { CastCard } from "../content/schema";

const W = () => content.look.words;
/** Which part of her an act needs uncovered (from the scene's own words): breasts, her lower half. */
const TOP_ACT = /\b(paizuri|breasts out|nipples|breast sucking|grabbing (another's )?breast|nipple)\b/i;
const LOW_ACT = /\b(sex|vaginal|anal|cunnilingus|fingering|pussy|facesitting|sitting on face|anilingus|thigh sex|creampie|spread pussy|masturbation|after sex|(?<!holding )dildo)\b/i; // a dildo in her hand at the shop shelf does not undress her

export type Outfit = { tags: string; core: string; top: string; lift: string; bra: string; panties: string; negative: string };

/** The outfit by id, with her own words (a heroine card's `outfits`) over the shared ones. */
export function outfitOf(id: string, wife?: CastCard): Outfit | null {
  const o = W().outfit[id];
  const own = wife?.outfits?.[id]?.trim();
  if (!o && !own) return null;
  const u = o?.under ? W().under[o.under] : undefined;
  // her own outfit: the first three tags are what stays in view when it is partly off
  const core = own ? own.split(",").slice(0, 3).join(",").trim() : (o?.core ?? o?.tags ?? "");
  return { tags: own || o!.tags, core, top: o?.top ?? "breasts out", lift: o?.lift ?? "clothes lift", bra: u?.bra ?? "", panties: u?.panties ?? "", negative: own ? "" : (o?.negative ?? "") };
}

/** Her clothes for one picture. `t`: the picture tags (outfit, bare, under, skirt); `scene`: the scene's words (what the act needs). */
export function wearWords(t: Record<string, string>, scene: string, wife?: CastCard): { words: string[]; negative: string } {
  if (!t.outfit) return { words: [], negative: "" };
  const o = outfitOf(t.outfit, wife);
  if (!o) return { words: [t.outfit], negative: "" };
  const bare = t.bare ?? "none";
  if (bare === "all" || t.outfit === "naked") return { words: [W().outfit.naked?.tags ?? "completely nude", ...(W().bare.all ?? [])], negative: "" };
  const words: string[] = [];
  const topOff = bare === "top" || (bare === "none" && TOP_ACT.test(scene));
  const lowOff = bare === "bottom" || (bare === "none" && LOW_ACT.test(scene));
  // her top down keeps the rest as it is (stockings and shoes too); her lower half opened: what is left in view, no stockings in the way
  words.push(lowOff ? o.core : o.tags);
  if (topOff) words.push(o.top, ...(bare === "top" ? (W().bare.top ?? []) : ["nipples"]));
  if (bare === "bottom") words.push(o.lift, ...(W().bare.bottom ?? []));
  else if (lowOff) words.push(o.lift, t.under === "off" || !o.panties ? "no panties" : `panties aside, ${o.panties}`, "pussy");
  else {
    // dressed: her panties only show when the skirt is up or they are pushed aside / off - or the thing is see-through
    if (content.intimacy.wear.nightwear.some((n) => n.id === t.outfit)) words.push(t.under === "off" ? (W().panties.sheerOff ?? "no panties") : o.panties);
    else {
      if (t.skirt) words.push(o.lift, t.under === "off" ? "no panties" : o.panties);
      if (t.under === "aside") words.push(W().panties.aside ?? "panties aside", o.panties);
      else if (t.under === "off" && !t.skirt) words.push(W().panties.off ?? "no panties");
    }
  }
  return { words: words.filter(Boolean), negative: o.negative };
}
