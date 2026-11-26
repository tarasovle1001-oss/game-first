// What shows on her afterwards, and the scene put into words. One description is built from the state of
// the game: who is there, what she has on and what is off, her face, what her body has become, what is on
// her and in her. A picture pack takes the coarse part of it as a key; an image model takes all of it as tags.
import type { Ctx, EngineView, GameState, ModApi, SceneDesc } from "@tc/core";
import { actOf, content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { fitOf, sizeClass } from "./body";
import { toyForHim } from "./marriage";
import { bareOf, dressOf } from "./dress";
import { sheerOf, wearOf } from "./bodystate";
import { annoyedLevel } from "./annoy";
import { HALL, husbandSees } from "./places";

const L = content.look;
const W = L.words;
const INSIDE = new Set(["inside", "anus"]);

import { cumPlaces } from "./terms";
import { freshDetails } from "./glance";
import { wearWords } from "./wearwords";
import { cardToCast } from "./card";
export interface SceneWords {
  /** The same blocks an image pipeline works with: who she is right now, who is with her, where, what is going on. */
  heroine: string[];
  second: string[];
  environment: string[];
  action: string[];
  /** Everything in one line, heroine first. */
  prompt: string;
}

/**
 * A see-through one-piece has no halves to pull down or lift: her top "off" changes nothing in the picture, her bottom
 * "off" is the same thing with no panties. `key`: for a picture key, where panties pushed aside are not a picture of their own.
 */
const fitSheer = (t: Record<string, string>, key: boolean) => {
  if (!t.outfit || !sheerOf(t.outfit)) return;
  delete t.skirt;
  if (t.bare === "top") delete t.bare;
  if (t.bare === "bottom") {
    delete t.bare;
    t.under = "off";
  }
  if (key && t.under === "aside") delete t.under;
};
const step = (table: [number, string][], value: number) => table.filter(([from]) => value >= from).at(-1)?.[1];

/** Her face right now, as one of the names look.yaml knows. */
export function faceOf(state: GameState): string {
  const b = bs(state);
  const h = b.heroine;
  const enc = b.encounter;
  const sex = b.night?.sex;
  if (enc?.verdict === "hesitant" && enc.refusals > 0 && h.traits.confidence < 40) return "scared";
  const f = h.feel ?? {};
  if ((f.fear ?? 0) >= 40) return "scared";
  if ((f.anger ?? 0) >= 45) return "angry";
  if (annoyedLevel(state) !== "calm") return "annoyed";
  const meter = sex ? sex.hers : enc ? enc.hers : 0;
  if (meter >= 80) return "ecstatic";
  if (h.arousal >= 65 || meter >= 40) return "aroused";
  if ((enc || sex) && h.traits.openness < 45) return "shy";
  if ((f.shame ?? 0) >= 35) return "ashamed";
  if ((f.guilt ?? 0) >= 45) return "guilty";
  if (h.mood < 35) return "worried";
  if ((f.tenderness ?? 0) >= 40 && !enc) return "tender";
  if (h.mood >= 60) return "happy";
  return "plain";
}

/** The scene in words. `open` = include what the husband cannot see (transparent mode, pack building). */
export function describeScene(state: GameState, open = false): SceneWords {
  const b = bs(state);
  const h = b.heroine;
  const enc = b.encounter;
  const sex = b.night?.sex;
  const seen = !!sex || (enc ? husbandSees(state, enc.loc) || open : false);
  const actId = sex?.act ?? (enc && seen ? enc.act : (b.shift?.moment?.act ?? null));
  const partner = sex ? HUSBAND : enc && seen ? enc.patron : (b.shift?.moment?.patron ?? null);
  const heroine: string[] = ["1girl"];
  const bare = bareOf(state);
  const wear: Record<string, string> = { outfit: shownOutfit(state), ...(bare !== "none" ? { bare } : {}) };
  if (bare !== "all" && bare !== "bottom") {
    if (h.panties && h.panties !== "on") wear.under = h.panties;
    if (h.skirtUp) wear.skirt = "up";
  }
  fitSheer(wear, false);
  const actWords = actId ? (content.prompt.tags[content.acts.find((a) => a.id === actId)?.scene ?? ""] ?? "") : "";
  heroine.push(...wearWords(wear, actWords, bs(state).heroine.card ? cardToCast(bs(state).heroine.card!) : undefined).words);
  heroine.push(...(W.mood.find((m) => m.when === faceOf(state))?.tags ?? []));
  const drunk = step(W.drunk, h.drunk);
  if (drunk) heroine.push(drunk);
  // what her body has become shows when it is in view
  const lower = bare === "all" || bare === "bottom" || h.panties === "off" || h.panties === "aside" || !!actId;
  if (lower)
    for (const zone of ["vagina", "anus"] as const) {
      const t = step(W.stretch[zone] ?? [], h.body[zone].stretch);
      if (t) heroine.push(t);
      const s = step(W.sore[zone] ?? [], h.sore?.[zone] ?? 0);
      if (s) heroine.push(s);
    }
  const lips = step(W.sore.mouth ?? [], h.sore?.mouth ?? 0);
  if (lips) heroine.push(lips);
  for (const [place, left] of Object.entries(h.cum ?? {})) if (left > 0 && W.cum[place]) heroine.push(W.cum[place]!);
  for (const [k, left] of Object.entries(h.after ?? {})) if (left > 0 && W.after[k]) heroine.push(W.after[k]!);

  const second: string[] = [];
  if (partner === HUSBAND) {
    second.push(...(W.man.husband ?? []), W.size[sizeClass(b.husband.size)]!);
    if ((b.husband.cumOn ?? 0) > 0) second.push(W.hisCum);
    const gape = step(W.hisStretch, b.husband.stretch);
    if (gape && actId && ["prostate", "dildo_him", "pegging", "fisting_him", "rimming_him"].includes(actId)) second.push(gape);
  } else if (partner) {
    const p = b.patrons[partner];
    second.push(...(W.man.patron ?? []));
    if (p && actId && actOf(actId)?.place === "private") second.push(W.size[sizeClass(p.size)]!, "erection");
    const v = b.shift?.visits.find((x) => x.patron === partner);
    if ((v?.cumOn ?? 0) > 0) second.push(W.hisCum);
    if ((v?.drunk ?? 0) >= 60) second.push("drunk");
  }
  const where = (seen || open ? state.where[WIFE] : state.where[HUSBAND]) ?? "";
  const environment = [W.room[where] ?? where];
  const action = actId ? [W.act[actId] ?? actId] : [];
  // more than one man on her, and men standing round
  const men = enc && seen ? (enc.men ?? []) : [];
  if (men.length > 0) {
    second.push(men.length === 1 ? "2boys, threesome, mmf threesome" : `${1 + men.length}boys, gangbang`);
    const slots = new Set(men.map((m) => m.slot));
    const main = actId ? actOf(actId)?.zones ?? [] : [];
    const inPussy = slots.has("pussy") || main.includes("vagina");
    const inAss = slots.has("anus") || main.includes("anus");
    if (inPussy && inAss) action.push("double penetration");
    if ((slots.has("mouth") || main.includes("mouth")) && (inPussy || inAss)) action.push("spitroast");
    if (slots.has("hand")) action.push("handjob");
    if (slots.has("mouth") && !main.includes("mouth")) action.push("fellatio");
  }
  if (enc && seen && (enc.crowd?.length ?? 0) > 0) environment.push("crowd, onlookers");
  const fin = sex ? null : enc ? null : b.shift?.fin && (b.shift.tick ?? 0) < b.shift.fin.until ? b.shift.fin.place : (b.night?.fin ?? null);
  if (fin) action.push(...(W.fin?.[fin] ?? []));
  const prompt = [...heroine, ...second, ...action, ...environment].join(", ");
  return { heroine, second, environment, action, prompt };
}

/**
 * What of her state goes into a picture key, so the pack bakes it in: face, marks, gape, soreness, what is off.
 * Coarse on purpose - levels, not numbers - so one picture covers a stretch of play. Order = most important
 * first; a pack that lacks the exact picture drops tags from the end of this list (see sceneKeyFallbacks).
 */
/** What she is drawn in: in town it is street clothes, in the gym sportswear - not the work dress with the apron (pictures only). */
const shownOutfit = (state: GameState): string => {
  const own = dressOf(state), worn = content.intimacy.wear.picture?.[own] ?? own; // things that look the same share one picture key
  const loc = state.where[WIFE] ?? "";
  if (worn === "naked" || !loc.startsWith("town.")) return worn;
  return loc === "town.gym" ? "sport" : "street";
};
export const PICTURE_TAGS = ["outfit", "bare", "fin", "men", "phase", "crowd", "face", "tsize", "under", "skirt", "toy", "cage", "xray", "lock"];
/** Acts a guest is inside her in, front: the ones a picture in section makes sense for. */
const XRAY_ACTS = new Set(["sex", "riding", "standing_sex"]);
/**
 * What a whole picture and her portrait do not show (the picture pass of 22.11 looked: a guest's size class, the marks on
 * her, how stretched or sore she is read the same at that distance). They stay out of those keys - one picture for all of
 * them - and live in the close-ups, which do show them.
 */
const UNSEEN_WHOLE = ["size", "size2", "size3", "hsize", "marks", "gape", "sore"];
/**
 * The picture chat looked again (22.11, `claude/pics-answers.md`): the flush after an orgasm and how drunk she is show
 * nowhere - they are not in any key. No underwear and a lifted skirt show on her portrait only: a whole scene drops them.
 */
const PORTRAIT_ONLY = ["under", "skirt"];
/**
 * More than one man on her, or her husband joining a guest: the picture is asked for by the scene's own name
 * (`group_dp/patron+wife/<room>/...`, `join_mouth/husband+patron+wife/<room>/...`) with her look. Scenes that read the
 * same in a picture share one (look.yaml: group.same); where the second man only gets her hand the main picture is the
 * first guest's act alone and the hand is a close-up (group.plain). Who has which part of her stays in the game and
 * in the mannequin. `men` (2|3|4+) stays only in "they have finished".
 */
const GROUP = /^(came_)?(group_|join_)/;
const MEN_ROLES = new Set(["husband", "patron", "patron2", "patron3"]);
const groupOf = (state: GameState, desc: SceneDesc, tags: Record<string, string>): SceneDesc => {
  const wife = desc.participants.find((p) => p.role === "wife");
  const men = desc.participants.filter((p) => MEN_ROLES.has(p.role));
  if (!GROUP.test(desc.type) || !wife || men.length === 0) return { ...desc, tags };
  const G = content.look.group;
  const first = men.find((m) => m.role === "patron") ?? men[0]!;
  const husband = men.find((m) => m.role === "husband");
  const { fin: _f, cage: _c, tsize: _t, toy: _toy, men: count, ...look } = tags;
  const enc = bs(state).encounter;
  // the second man has only her hand: the picture is what the first one is doing with her
  if (G.plain.includes(desc.type) && enc) {
    // (if it is the first guest who has her hand, the picture is the man who is in her)
    const inHer = (id: string) => (content.acts.find((a) => a.id === id)?.zones as string[] | undefined)?.some((z) => z === "vagina" || z === "anus");
    const main = inHer(enc.act) ? { act: enc.act, patron: enc.patron } : (enc.men?.find((m) => inHer(m.act)) ?? { act: enc.act, patron: enc.patron });
    return { type: content.acts.find((a) => a.id === main.act)?.scene ?? desc.type, location: desc.location, participants: [wife, { id: main.patron, role: "patron" }], tags: look };
  }
  const type = G.same[desc.type] ?? desc.type;
  const who = husband && first !== husband ? [wife, { id: first.id, role: "patron" }, husband] : [wife, { id: first.id, role: first.role === "husband" ? "husband" : "patron" }];
  return { type, location: desc.location, participants: who, tags: type === "group_after" && count ? { ...look, men: String(Math.min(4, Number(count))) } : look };
};
/** Scenes where a toy is the subject: its size class goes into the key. */
const TOY_HERS = new Set(["toy_on_her", "came_toy_on_her"]);
const TOY_HIS = new Set(["dildo_him", "came_dildo_him"]);
const HIDDEN = new Set(["inside", "anus", "thighs"]);
const level = (table: [number, string][], value: number) => table.filter(([from]) => value >= from).length;

export function lookTags(state: GameState, desc: SceneDesc): Record<string, string> {
  const b = bs(state);
  const h = b.heroine;
  const out: Record<string, string> = {};
  const roles = new Map(desc.participants.map((p) => [p.role, p.id]));
  const act = content.acts.find((a) => a.scene === desc.type);
  // the size shows when the layout draws it, or the act is one of the back-room ones
  const intimate = act?.place === "private" || !!content.scenes.find((l) => l.id === desc.type)?.figures.some((f) => f.penis);
  if (intimate)
    for (const [role, tag] of [["patron", "size"], ["patron2", "size2"], ["patron3", "size3"], ["husband", "hsize"]] as const) {
      const id = roles.get(role);
      const cm = id === HUSBAND ? b.husband.size : id ? b.patrons[id]?.size : undefined;
      if (cm !== undefined) out[tag] = String(sizeClass(cm));
    }
  if (roles.get("husband") === HUSBAND && b.husband.caged && intimate) out.cage = "1";
  if (!roles.has("wife")) return out;
  const bare = bareOf(state);
  out.outfit = shownOutfit(state);
  if (bare !== "none") out.bare = bare;
  if (bare !== "all" && bare !== "bottom") {
    if (h.panties && h.panties !== "on") out.under = h.panties;
    if (h.skirtUp) out.skirt = "up";
  }
  fitSheer(out, true);
  out.face = faceOf(state);
  // what is under her clothes is not in the picture: it would only multiply pictures that look the same
  const lower = bare === "all" || bare === "bottom" || ((h.panties === "off" || h.panties === "aside") && !!h.skirtUp) || intimate;
  const marks = Object.entries(h.cum ?? {})
    .filter(([k, v]) => v > 0 && W.cum[k] && (lower || !HIDDEN.has(k)))
    .map(([k]) => k)
    .sort();
  if (marks.length) out.marks = marks.join("+");
  const gape = lower ? (["vagina", "anus"] as const).map((z) => [z[0], level(W.stretch[z] ?? [], h.body[z].stretch)] as const).filter(([, n]) => n > 0) : [];
  if (gape.length) out.gape = gape.map(([z, n]) => `${z}${n}`).join("");
  const sore = (["vagina", "anus", "mouth"] as const)
    .filter((z) => z === "mouth" || lower)
    .map((z) => [z[0], level(W.sore[z] ?? [], h.sore?.[z] ?? 0)] as const)
    .filter(([, n]) => n > 0);
  if (sore.length) out.sore = sore.map(([z, n]) => `${z}${n}`).join("");
  for (const k of UNSEEN_WHOLE) delete out[k];
  // now and then the same picture is drawn in section: a guest in her. The roll holds for the whole act.
  const enc = b.encounter;
  const xray = roles.has("patron") && enc && XRAY_ACTS.has(enc.act) && intimate ? enc.startTick + enc.actTick : undefined; // (a toy in section the model cannot draw: not asked for)
  if (xray !== undefined && ((state.time.day * 37 + xray * 11) % 100) / 100 < D.xrayChance) out.xray = "1";
  // a toy in the middle of the scene: how big it is shows, and is drawn
  if (TOY_HIS.has(desc.type)) {
    const toy = toyForHim(state).toy;
    if (toy) out.tsize = String(sizeClass(toy.size));
  } else if (TOY_HERS.has(desc.type)) {
    const fit = fitOf(state, "vagina") + content.day.shop.toyStretchAbove;
    const size = Math.max(0, ...content.day.shop.toys.filter((t) => b.toys.includes(t.id) && t.size <= fit).map((t) => t.size));
    if (size > 0) out.tsize = String(sizeClass(size));
  }
  return out;
}

const HIM_ALONE = new Set(["dildo_him", "came_dildo_him", "prostate", "came_prostate", "fisting_him", "came_fisting_him"]);
/** The scene on screen with her look baked into its tags: the key a pack picture is named after. */
export function pictureScene(engine: EngineView, state: GameState): SceneDesc | null {
  const desc = engine.currentScene(state);
  return desc ? withLook(state, desc) : null;
}
/** Adds her look to any scene description; tags the scene already set win. */
export const withLook = (state: GameState, desc: SceneDesc): SceneDesc => {
  const tags = { ...lookTags(state, desc), ...(desc.tags ?? {}) };
  // through a see-through chemise no panties is a different picture - unless the act has her lower half bared anyway
  const zones = content.acts.find((a) => a.scene === desc.type)?.zones ?? [];
  const shows = !!tags.outfit && !!sheerOf(tags.outfit) && tags.under === "off" && !zones.includes("vagina") && !zones.includes("anus");
  for (const k of PORTRAIT_ONLY) if (!(k === "under" && shows)) delete tags[k];
  // she is not in these pictures (him alone, at most her hand): her dress and face would only multiply the same picture
  if (HIM_ALONE.has(desc.type)) for (const k of Object.keys(tags)) if (k !== "tsize") delete tags[k];
  return groupOf(state, desc, tags);
};

const mark = (ctx: Ctx, place: string, his = false) => {
  const h = bs(ctx.state).heroine;
  h.cum = { ...(h.cum ?? {}), [place]: Math.max(h.cum?.[place] ?? 0, L.marks.lasts[place] ?? 30) };
  // whose it is matters to who may see it
  h.cumHis = { ...(h.cumHis ?? {}), [place]: his && (h.cumHis?.[place] ?? true) };
};
export const wash = (ctx: Ctx, only?: string[]) => {
  const h = bs(ctx.state).heroine;
  if (!h.cum && !h.after) return;
  for (const place of Object.keys(h.cum ?? {})) if (!only || only.includes(place)) delete h.cum![place];
  if (!only) h.after = {};
};
/** A minute goes by: marks dry, the flush fades, what is inside starts to run. */
const pass = (ctx: Ctx, minutes: number) => {
  const b = bs(ctx.state);
  const h = b.heroine;
  for (const bag of [h.cum, h.after]) {
    if (!bag) continue;
    for (const k of Object.keys(bag)) {
      bag[k] = bag[k]! - minutes;
      if (bag[k]! <= 0) delete bag[k];
    }
  }
  if (h.cum && INSIDE.has("inside")) {
    const deep = Math.max(h.cum.inside ?? 0, h.cum.anus ?? 0);
    const base = Math.max(L.marks.lasts.inside ?? 0, L.marks.lasts.anus ?? 0);
    if (deep > 0 && base - deep >= L.marks.dripAfter && !h.cum.thighs) mark(ctx, "thighs");
  }
  if ((b.husband.cumOn ?? 0) > 0) b.husband.cumOn = Math.max(0, b.husband.cumOn! - minutes);
  for (const v of b.shift?.visits ?? []) if ((v.cumOn ?? 0) > 0) v.cumOn = Math.max(0, v.cumOn! - minutes);
};

export function registerLook(api: ModApi) {
  api.events.on("cum:landed", (ctx, e) => {
    const b = bs(ctx.state);
    const { by, act, where } = e.payload as { by: string; act: string; where?: string };
    const options = L.marks.byAct[act];
    const place = by === HUSBAND && where ? L.marks.husbandWhere[where] : where ? where : options ? ctx.rng.pick(cumPlaces(ctx, options)) : "body";
    if (place) mark(ctx, place, by === HUSBAND);
    if (by === HUSBAND) b.husband.cumOn = L.marks.onHim;
    else {
      const v = b.shift?.visits.find((x) => x.patron === by);
      if (v) v.cumOn = L.marks.onHim;
    }
    ctx.emit("look:marked", { place: place ?? "", by });
  });
  // while they are at it her clothes are where the act needs them; afterwards she looks like it
  api.events.on("encounter:started", (ctx, e) => {
    const h = bs(ctx.state).heroine;
    const act = actOf((e.payload!.act as string));
    if (!act) return;
    const lower = act.zones.includes("vagina") || act.zones.includes("anus");
    if (lower && bareOf(ctx.state) !== "all" && bareOf(ctx.state) !== "bottom") {
      h.panties = h.traits.openness >= 60 ? "off" : "aside";
      h.skirtUp = true;
    }
  });
  const ended = (ctx: Ctx, intimate: boolean) => {
    const h = bs(ctx.state).heroine;
    h.skirtUp = false;
    if (h.panties === "aside") h.panties = "on";
    if (intimate) h.after = { ...L.after };
  };
  api.events.on("encounter:ended", (ctx, e) => ended(ctx, actOf((e.payload!.act as string))?.place === "private"));
  api.events.on("bed:ended", (ctx) => ended(ctx, true));
  api.events.on("shift:minute", (ctx) => pass(ctx, 1));
  api.events.on("prep:tick", (ctx) => pass(ctx, 10));
  api.events.on("phase:enter", (ctx, e) => {
    const h = bs(ctx.state).heroine;
    const phase = e.payload!.phase as string;
    // back on the floor she has wiped her face and hands; the rest stays where it is
    if (phase === "prep") {
      wash(ctx); // a new day: she has washed
      h.panties = "on";
      h.skirtUp = false;
    }
    // bold enough, she has nothing under the see-through thing she put on for the night
    if (phase === "night" || phase === "shift") {
      const sheer = sheerOf(wearOf(ctx.state));
      if (sheer && h.traits.openness >= (phase === "night" ? sheer.nightBare : sheer.bare)) h.panties = "off";
    }
  });
  api.events.on("prep:tick", (ctx) => {
    if (bs(ctx.state).day?.her?.task === "wash") wash(ctx);
  });
  api.invariants.add("look", (s) => {
    const h = bs(s).heroine;
    for (const [k, v] of Object.entries(h.cum ?? {})) if (!(v > 0) || !W.cum[k]) return `bad mark on her: ${k}=${v}`;
    return null;
  });
}


export interface PictureFrames {
  /** The whole scene in one picture: what a pack shows when it has it. */
  full: SceneDesc;
  /** This scene is never shown whole (scenes.yaml: split): the portrait and the close-ups even when the pack has a whole picture. */
  splitOnly?: boolean;
  /** Her alone, face by her state: the main picture when the pack has no whole one. Null when she is not in the scene. */
  portrait: SceneDesc | null;
  /** Close-ups of contact without faces, one per man, at most three. A group is put together from the close-ups of pairs. */
  inserts: SceneDesc[];
  /** Close-ups that do not belong to an act: what has just happened and what shows on them right now (see detailsFor). */
  details: SceneDesc[];
}

const D = content.floor.details;
/**
 * Free close-ups, keys `detail_<id>/<wife|patron|husband>/<room>/<tags>`: first what has just happened (a guest showed her,
 * her hand on him, the phone), then what simply shows - a guest's trousers, how wet she is, the cage. Two tags each at most.
 */
/** His hands on her, by the picture it happens in: which parts get a close-up. */
const GROPE: Record<string, string[]> = {
  patron_touching: ["grope_thigh"], patron_moment_sit_on_lap: ["grope_butt"], patron_groping: ["grope_breast", "grope_under"], patron_lap_dance: ["grope_butt"],
  him_grope: ["grope_breast"],
  him_grab_ass: ["grope_butt"],
  him_under_skirt: ["grope_under"],
};
/** She is showing herself: the parts in close-up. */
const SHOWS = new Set(["flash", "walk_naked", "striptease", "masturbate_show"]);
/** How a scene with him ended, when the ending is his body's doing. */
const HIS_END: Record<string, string> = { went_soft: "him_soft", premature_finish: "him_cum_early", came_too_soon_foreplay: "him_cum_early", lead_ruined: "him_ruined" };
const FRONT = new Set(["sex", "riding", "standing_sex", "join_dp", "toy_on_her"]);
const THROAT = new Set(["deepthroat"]);
const BY_HAND = new Set(["handjob", "ignore_handjob", "edging", "tease_denial"]);
const TOY_HIM = new Set(["pegging", "dildo_him", "fisting_him"]);

/** Close-ups with her dressed body in the frame: they carry her outfit, the same value as the main picture of the step. */
const DRESSED = new Set(["nipples", "show_breasts", "show_butt", "show_pussy", "upskirt", "phone_ear", "grope_breast", "grope_butt", "grope_thigh", "grope_under", "wet", "belly_bulge", "gape_v", "gape_a", "panties_off", "tip_tuck", "shot_navel"]);

export function detailsFor(state: GameState, desc: SceneDesc): SceneDesc[] {
  const b = bs(state);
  const h = b.heroine;
  const out: SceneDesc[] = [];
  const openly = b.mode === "open" || b.viewAll === true;
  const sizeOf = (id: string | undefined) => (id === HUSBAND ? b.husband.size : id ? b.patrons[id]?.size : undefined);
  const classOf = (id: string | undefined) => sizeClass(sizeOf(id) ?? 0);
  const roleOf = (id: string | undefined) => (id === WIFE ? "wife" : id === HUSBAND ? "husband" : "patron");
  const worn = shownOutfit(state);
  const add = (id: string, who: string, tags: Record<string, string> = {}) =>
    void (D.drop.includes(id) || out.some((x) => x.type === `detail_${id}`) || out.push({ type: `detail_${id}`, location: "any", participants: [{ id: who, role: roleOf(who) }], tags: DRESSED.has(id) ? { ...tags, outfit: worn } : tags })); // no room in a close-up: one file serves every room
  const aroused = (b.husband.arousal ?? 0) >= D.himArousal;
  // him in his trousers: plain, locked up, locked up and leaking - one close-up, three looks
  const cage: Record<string, string> = b.husband.caged ? { cage: aroused ? "leak" : "1" } : {};
  const has = (role: string) => desc.participants.find((p) => p.role === role)?.id;
  const guest = has("patron");
  const man = guest ?? has("husband");
  // what she has on where it matters, and what is on her: the two things most close-ups of her turn on
  const bare = bareOf(state);
  const top = bare === "all" || bare === "top" ? "bare" : "on";
  const under = bare === "all" || bare === "bottom" || h.panties === "off" ? "bare" : h.panties === "aside" ? "aside" : "on";
  const left = ["inside", "anus", "thighs"].filter((k) => (h.cum?.[k] ?? 0) > 0).join("+");
  const gape = (z: "vagina" | "anus") => String(level(W.stretch[z] ?? [], h.body[z].stretch));
  const wet = level(D.wet.map((from) => [from, ""] as [number, string]), h.arousal);
  // her body, always (floor.yaml details.body): what is left of the three places after the other close-ups, pussy / anus / nipples
  const bodyOf = () => {
    if (!has("wife")) return;
    const base = desc.type.replace(/^came_/, "").replace(/^patron_/, "");
    const shown = new Set(out.map((x) => x.type));
    const skip: Record<string, boolean> = {
      gape_v: shown.has("detail_show_pussy") || shown.has("detail_toy_v") || shown.has("detail_grope_under"),
      gape_a: shown.has("detail_show_butt") || shown.has("detail_toy_a"),
      nipples: shown.has("detail_show_breasts") || shown.has("detail_grope_breast"),
    };
    const inside = ["inside", "thighs"].filter((k) => (h.cum?.[k] ?? 0) > 0).join("+");
    const tagsOf: Record<string, () => Record<string, string>> = {
      gape_v: () => (under === "on" ? { wear: "on", wet: String(wet) } : { wear: under, wet: String(wet), gape: gape("vagina"), ...(inside ? { marks: inside } : {}) }),
      gape_a: () => ({ gape: gape("anus"), ...((h.cum?.anus ?? 0) > 0 ? { marks: "anus" } : {}) }),
      nipples: () => ({ wear: top, level: String(Math.min(2, wet)) }),
    };
    for (const id of D.body.order) {
      if (out.length >= 3) return;
      if (skip[id] || (D.body.hide[id] ?? []).includes(base)) continue;
      add(id, WIFE, tagsOf[id]?.() ?? {});
    }
  };

  // her hand on the man beside the one who has her: the husband who joined, or a second guest
  // (only for the scenes switched to "plain": look.yaml group)
  const withHer = content.look.group.plain.includes(desc.type) ? b.encounter : null;
  if (withHer?.joined === "hand") add("join_hand_lazy", HUSBAND);
  const byHand = (id: string) => (content.acts.find((a) => a.id === id)?.zones as string[] | undefined)?.every((z) => z === "hands");
  const handed = withHer?.men?.length ? (withHer.men.find((m) => m.slot === "hand")?.patron ?? (byHand(withHer.act) ? withHer.patron : undefined)) : undefined;
  if (handed) add("group_hand", handed, { size: String(classOf(handed)) });
  // a guest is talking money with the husband: the money changing hands, beside whatever the room shows
  if (b.deal && b.shift && !b.encounter && state.where[HUSBAND] === HALL) add("deal_money", b.deal.patron);
  // he sits at a guest's table: the two of them over a drink, beside whatever she is busy with (it had a picture of its own until 26.11)
  const show = b.shift?.show;
  if (show?.type === "table_sit" && show.patron && b.shift!.tick < show.until && state.where[HUSBAND] === HALL) add("table_sit", show.patron);
  for (const d of freshDetails(state)) {
    if (d.secret && !openly) continue;
    const who = d.who ?? WIFE;
    add(d.id, who, { ...(who !== WIFE && who !== HUSBAND && sizeOf(who) !== undefined ? { size: String(classOf(who)) } : {}), ...(who === HUSBAND ? cage : {}), ...(d.tags ?? {}) });
  }
  const act = content.acts.find((a) => a.scene === desc.type);
  const intimate = !!content.scenes.find((x) => x.id === desc.type)?.figures.some((f) => f.penis) || act?.place === "private";
  if (HIS_END[desc.type]) add(HIS_END[desc.type]!, HUSBAND, cage);
  if (intimate) {
    // accents: a big man shows from the outside, and the inside is drawn in section
    const big = classOf(man) >= D.accentClass;
    const id = act?.id ?? desc.type.replace(/^patron_/, "");
    const fin = desc.tags?.fin;
    if (man && THROAT.has(id) && big) add("throat_bulge", WIFE, { size: String(classOf(man)) });
    // the section through her is for a guest: with her husband there is nothing in it worth an accent
    // (the section through her is a variant of the main picture now: lookTags, xray=1)
    if (guest && FRONT.has(id) && big) add("belly_bulge", WIFE, { size: String(classOf(man)) });
    // a guest finished inside her: what is in her now
    if (guest && fin === "inside") add("womb_cum", WIFE);
    // her hand on him, bare: on a guest her ring is in the picture
    if (man && BY_HAND.has(id)) add("touch_bare", man, man !== HUSBAND ? { size: String(classOf(man)), ring: "1" } : {});
    if (TOY_HIM.has(id)) add("toy_him", HUSBAND, { who: "her" });
    if (has("husband") && b.husband.caged) add("him_cage", HUSBAND, aroused ? { leak: "1" } : {});
    bodyOf();
    return out;
  }
  // his hands on her, part by part
  if (man) for (const part of GROPE[desc.type] ?? []) add(part, man, part === "grope_breast" ? { wear: top } : part === "grope_under" ? { wear: under, wet: String(Math.max(1, wet)) } : { wear: part === "grope_thigh" ? "on" : under });
  if (has("wife")) {
    // a guest drinks from her body: the shot in her navel, close up (26.11 Alexey: the whole scene drew her undressed wrong)
    if (desc.type === "body_shot") add("shot_navel", WIFE);
    if (SHOWS.has(desc.type)) {
      // shown on purpose she is always wet, and what was left in her runs down
      add("show_breasts", WIFE, { wear: top, ...((h.cum?.chest ?? 0) > 0 ? { marks: "chest" } : {}) });
      if (bare === "all" || bare === "bottom" || desc.type !== "flash") {
        add("show_pussy", WIFE, { wear: under, gape: gape("vagina"), ...(left ? { marks: left } : {}) });
        add("show_butt", WIFE, { wear: under, gape: gape("anus"), ...((h.cum?.anus ?? 0) > 0 ? { marks: "anus" } : {}) });
      }
    }
    if (desc.type === "kissing" || desc.type === "him_kiss") add("kiss_close", WIFE);
    // what an evening has left on her, close up: only where it is not covered
    if ((h.cum?.face ?? 0) > 0 || (h.cum?.mouth ?? 0) > 0) add("marks_face", WIFE, { marks: ["face", "mouth"].filter((k) => (h.cum?.[k] ?? 0) > 0).join("+") });
    if (h.panties === "off" && bare === "none") add("panties_off", WIFE);
    if (Object.values(h.after ?? {}).some((v) => v > 0)) add("hickey", WIFE);
  }
  // a guest who is worked up: it shows through his trousers (or, in the sauna, with nothing on), and how much of it there is shows too
  const heat = guest ? (b.shift?.visits.find((v) => v.patron === guest)?.heat ?? 0) : 0;
  if (guest && heat >= D.bulgeHeat) add("bulge", guest, { size: String(classOf(guest)), ...(desc.location === "cafe.sauna" ? { bare: "1" } : {}) });
  // him: watching her with another man, or close to her and worked up
  const watching = !!b.encounter && !has("husband") && desc.participants.some((p) => p.id === b.encounter!.patron);
  if (aroused && (watching || has("husband"))) add("him_bulge", HUSBAND, cage);
  bodyOf();
  return out;
}

/**
 * How a scene may be laid out on screen: one picture, or her portrait + up to three close-ups.
 * Keys: `portrait/wife/<room>/<her look>` and `insert_<pair scene>/<patron|husband>/<room>/<size, marks...>`.
 * The second and third man use the same files as a lone guest doing the same thing.
 */
export function pictureFrames(state: GameState, desc: SceneDesc): PictureFrames {
  const full = withLook(state, desc);
  const tags = { ...lookTags(state, desc), ...(desc.tags ?? {}) }; // her portrait keeps what only it shows
  const wife = desc.participants.find((p) => p.role === "wife");
  // since 22.11 a scene is one picture: the close-ups of the act ("his part of her", one per man) are no longer asked for.
  // The list stays in the shape of the frames, always empty; the free close-ups (details) go beside the picture as before.
  const inserts: SceneDesc[] = [];
  const { men: _m, phase: _p, crowd: _c, fin: _f, size: _s, size2: _s2, size3: _s3, hsize: _h, tsize: _t, toy: _toy, cage: _cg, ...look } = tags;
  return { full, portrait: wife ? { type: "portrait", location: desc.location, participants: [wife], tags: look } : null, inserts, details: detailsFor(state, desc) };
}

/**
 * The pack decides the layout by what it holds: a picture of the whole scene is shown alone;
 * without one, her portrait becomes the main picture and the close-ups it has go beside it.
 * `find` looks a picture up (the number tells the close-ups apart so they do not pick the same variant).
 */
export function resolveFrames<T>(frames: PictureFrames, find: (desc: SceneDesc, n: number) => T | null): { main: T; inserts: T[]; split: boolean } | null {
  const found = (list: SceneDesc[], from: number) => list.map((d, i) => find(d, from + i)).filter((x): x is T => x !== null);
  const details = found(frames.details ?? [], 4);
  const full = frames.splitOnly && frames.portrait ? null : find(frames.full, 0);
  // free close-ups go beside a whole picture too: they say what the picture cannot
  if (full) return { main: full, inserts: details.slice(0, 3), split: false };
  const main = frames.portrait ? find(frames.portrait, 0) : null;
  if (!main) return null;
  // what has just happened comes before the close-ups of the act when there is no room for all
  return { main, inserts: [...details.slice(0, 1), ...found(frames.inserts, 1), ...details.slice(1)].slice(0, 3), split: true };
}
