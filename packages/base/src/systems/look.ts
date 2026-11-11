// What shows on her afterwards, and the scene put into words. One description is built from the state of
// the game: who is there, what she has on and what is off, her face, what her body has become, what is on
// her and in her. A picture pack takes the coarse part of it as a key; an image model takes all of it as tags.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { sizeClass } from "./body";
import { bareOf, dressOf } from "./dress";
import { annoyedLevel } from "./annoy";
import { husbandSees } from "./places";

const L = content.look;
const W = L.words;
const INSIDE = new Set(["inside", "anus"]);

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
  const dress = dressOf(state);
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
    }
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
  const prompt = [...heroine, ...second, ...action, ...environment].join(", ");
  return { heroine, second, environment, action, prompt };
}

const mark = (ctx: Ctx, place: string) => {
  const h = bs(ctx.state).heroine;
  h.cum = { ...(h.cum ?? {}), [place]: Math.max(h.cum?.[place] ?? 0, L.marks.lasts[place] ?? 30) };
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
    const place = by === HUSBAND && where ? L.marks.husbandWhere[where] : options ? ctx.rng.pick(options) : "body";
    if (place) mark(ctx, place);
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
