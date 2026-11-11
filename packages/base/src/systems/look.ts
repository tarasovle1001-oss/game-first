// What shows on her afterwards, and the scene put into words. One description is built from the state of
// the game: who is there, what she has on and what is off, her face, what her body has become, what is on
// her and in her. A picture pack takes the coarse part of it as a key; an image model takes all of it as tags.
import type { Ctx, EngineView, GameState, ModApi, SceneDesc } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { sizeClass } from "./body";
import { bareOf, dressOf } from "./dress";
import { annoyedLevel } from "./annoy";
import { husbandSees } from "./places";

const L = content.look;
const W = L.words;
const INSIDE = new Set(["inside", "anus"]);

import { cumPlaces } from "./terms";
import { wearOf } from "./bodystate";
export interface SceneWords {
  /** The same blocks an image pipeline works with: who she is right now, who is with her, where, what is going on. */
  heroine: string[];
  second: string[];
  environment: string[];
  action: string[];
  /** Everything in one line, heroine first. */
  prompt: string;
}

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
  const worn = wearOf(state);
  const dress = bareOf(state) === "none" ? worn : dressOf(state);
  heroine.push(W.outfit[dress] ?? dress);
  const bare = bareOf(state);
  if (bare !== "none") heroine.push(...(W.bare[bare] ?? []));
  if (bare !== "all" && bare !== "bottom") {
    if (h.panties && h.panties !== "on") heroine.push(W.panties[h.panties]!);
    if (h.skirtUp) heroine.push(W.skirtUp);
  }
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
    if (p && actId && content.acts.find((a) => a.id === actId)?.place === "private") second.push(W.size[sizeClass(p.size)]!, "erection");
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
    const main = actId ? content.acts.find((a) => a.id === actId)?.zones ?? [] : [];
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
export const PICTURE_TAGS = ["outfit", "bare", "fin", "men", "crowd", "face", "marks", "size", "hsize", "size2", "size3", "under", "skirt", "gape", "sore", "after", "drunk"];
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
  if (!roles.has("wife")) return out;
  const bare = bareOf(state);
  out.outfit = bare === "none" ? wearOf(state) : dressOf(state);
  if (bare !== "none") out.bare = bare;
  if (bare !== "all" && bare !== "bottom") {
    if (h.panties && h.panties !== "on") out.under = h.panties;
    if (h.skirtUp) out.skirt = "up";
  }
  out.face = faceOf(state);
  if (Object.values(h.after ?? {}).some((v) => v > 0)) out.after = "1";
  const drunk = step(W.drunk, h.drunk);
  if (drunk) out.drunk = drunk;
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
  return out;
}

/** The scene on screen with her look baked into its tags: the key a pack picture is named after. */
export function pictureScene(engine: EngineView, state: GameState): SceneDesc | null {
  const desc = engine.currentScene(state);
  return desc ? withLook(state, desc) : null;
}
/** Adds her look to any scene description; tags the scene already set win. */
export const withLook = (state: GameState, desc: SceneDesc): SceneDesc => ({ ...desc, tags: { ...lookTags(state, desc), ...(desc.tags ?? {}) } });

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
    const act = content.acts.find((a) => a.id === (e.payload!.act as string));
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
  api.events.on("encounter:ended", (ctx, e) => ended(ctx, content.acts.find((a) => a.id === (e.payload!.act as string))?.place === "private"));
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
