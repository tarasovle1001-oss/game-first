// The bed with him, what is what (27.11: moved out of marriage.ts, unchanged): which act is which, what is possible for him right now.
// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { GameState } from "@tc/core";
import { content } from "../../content";
import { bs, clamp } from "../../state";

import { actOff } from "../kinks";
export const NIGHT_ACT = "base/night-act";
/** What the husband can ask for in the bedroom. */
export const IN_BED = content.intimacy.bedroom; // which act is what: all of it is content
export const NIGHT_ACTS = IN_BED.ask;
/** What is done to him: her finger, a toy in her hand, a toy on straps, her whole hand. */
export const HIS_ACTS = IN_BED.his;
export const NEEDS_TOY = new Set(IN_BED.needsToy);
export const BED = "base/bed";
export const BED_SAVE = "base/bed-save";
export const NIGHT_DECLINE = "base/night-decline";
export const NIGHT_SELF = "base/night-self";
export const AFTER = "base/after";
/** What he does once it is over: give her what she asks for, see to her, or just hold her. */
export const REST = "base/rest";
/** She is seeing to herself next to him in the small hours: the player watches (whether or not the husband is awake). */
export const WATCH = "base/watch";
export const UPSTAIRS = "base/upstairs";
/** What he can pull her away from work for. */
export const UPSTAIRS_ACTS = IN_BED.upstairs;
/** What a bedroom scene can turn into once it is going. */
/** Acts for the bed with a guest in it: only while he is there. */
export const JOIN_ACTS = IN_BED.join;
/** Acts that end in a picture and a line of their own. */
export const OWN_END = new Set(IN_BED.ownEnd);
/** What she gets out of an act that is not about a zone of hers being filled. */
export const HER_PLEASURE = IN_BED.herPleasure;
export const BED_ACTS = IN_BED.switchTo;
/** Where he can finish, by what they are doing. "inside" is the plain ending. */
export const FINISH = IN_BED.finish;
export const PULL_OUT = new Set(IN_BED.pullOut);
export const LEAD = content.intimacy.lead;
/** The toy she would use on him: the biggest one he can take, or the smallest one there is. */
export const toyForHim = (state: GameState) => {
  const b = bs(state);
  const K = content.body.his;
  const fit = K.fitBase + b.husband.stretch * K.fitPerStretch;
  const owned = content.day.shop.toys.filter((t) => b.toys.includes(t.id)).sort((x, y) => x.size - y.size);
  // he begged for a bigger one tonight: that one, whether it fits or not
  const asked = b.night?.sex?.himToy ? owned.find((t) => t.id === b.night!.sex!.himToy) : undefined;
  return { fit, toy: asked ?? [...owned].reverse().find((t) => t.size <= fit + K.tooBig) ?? null }; // nothing that fits = nothing she can use on him
};
/** Acts that are about what is done to him, from behind. */
export const FEMDOM = new Set(["pegging", "dildo_him", "fisting_him", "prostate"]);
/** Whether an act done to him is possible at all right now: a toy to do it with, a body that can take it. */
/** What a man can still do for her with nothing left in him. */
export const SOFT_ACTS = IN_BED.soft;
export const hisActOpen = (state: GameState, act: string) => {
  const b = bs(state);
  if (actOff(state, act)) return false; // the player switched it off (kinks.yaml)
  if (b.night?.sex?.soft && !SOFT_ACTS.includes(act)) return false;
  // locked up, he has only what needs nothing of him; and it cannot be put on twice
  if (b.husband.caged && (act === "chastity" || !(SOFT_ACTS.includes(act) || content.body.cage.through.includes(act)))) return false;
  if (JOIN_ACTS.includes(act)) return !!b.night?.third;
  if (NEEDS_TOY.has(act) && toyForHim(state).toy === null) return false;
  // "after" needs something to be after: his or anyone's, still in her or on her
  if (act === "cleanup") return Object.keys(b.heroine.cum ?? {}).length > 0;
  if (act === "fisting_him") return toyForHim(state).fit + content.body.his.tooBig >= content.body.his.fistSize;
  return true;
};
/** What doing it to him gives her: it is about who is holding whom. */
export const herFromHis = (state: GameState, act: string) => {
  const b = bs(state);
  const K = content.body.his;
  return clamp(K.peggingHerBase * (K.herShare[act] ?? 1) + b.power * K.peggingHerPerPower + (b.heroine.latents.cruel_streak ? 20 : 0));
};
export const BEDROOM = "home.bedroom";
export const R0 = content.day.rhythm;

export const FIN_LAYOUTS = new Set(["fin_face", "fin_mouth", "fin_chest", "fin_belly", "fin_back", "fin_inside"]);

