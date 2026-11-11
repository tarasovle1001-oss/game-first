// The state of her body beyond stretch: each zone gets sore from use and is easier when it is slick;
// what is left on her gets noticed, and while she hides things she goes and cleans up first;
// how she feels in the morning decides how she dresses; what she has on outside the shift.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Zone } from "../state";
import { annoy } from "./annoy";
import { fitOf } from "./body";
import { actById, CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { wash } from "./look";
import { attrOf, feel, think } from "./mind";
import { HALL, husbandSees } from "./places";
import { changeHim } from "./rhythm";

const I = content.intimacy;
const Z = I.zones;
const ZONES: Zone[] = ["vagina", "anus", "mouth"];

export const soreOf = (state: GameState, zone: Zone) => bs(state).heroine.sore?.[zone] ?? 0;
/** A zone is slick when there is something in it already, or (for her pussy) when she is wet enough herself. */
export const slick = (state: GameState, zone: Zone) => {
  const h = bs(state).heroine;
  if (zone === "vagina") return (h.cum?.inside ?? 0) > 0 || h.arousal >= Z.slickArousal;
  if (zone === "anus") return (h.cum?.anus ?? 0) > 0;
  return false;
};
const zonesOf = (actId: string): Zone[] => actById(actId).zones.filter((z): z is Zone => (ZONES as string[]).includes(z));
/** Friction: minutes of it, more when he is bigger than she takes easily, less when she is slick. */
function wear(ctx: Ctx, actId: string, size: number, minutes: number) {
  const h = bs(ctx.state).heroine;
  for (const zone of zonesOf(actId)) {
    const over = Math.max(0, size / fitOf(ctx.state, zone) - 1);
    const gain = minutes * (Z.perMinute + over * Z.perOversize) * (zone === "mouth" ? Z.mouth : 1) * (slick(ctx.state, zone) ? 1 - Z.slickCuts : 1);
    const before = soreOf(ctx.state, zone);
    h.sore = { ...(h.sore ?? {}), [zone]: clamp(before + gain) };
    if (before < Z.thoughtAt && h.sore[zone]! >= Z.thoughtAt) think(ctx, `thought.sore.${zone}`);
  }
}
/** The marks on her that anyone can see and that are not her husband's. */
export const foreignMarks = (state: GameState): string[] => {
  const h = bs(state).heroine;
  return Object.keys(h.cum ?? {}).filter((p) => I.marks.visible.includes(p) && !h.cumHis?.[p]);
};
export const visibleMarks = (state: GameState): string[] => Object.keys(bs(state).heroine.cum ?? {}).filter((p) => I.marks.visible.includes(p));
/** What she has on right now: the work outfit during the shift, something else the rest of the day. */
export const wearOf = (state: GameState): string => {
  const b = bs(state);
  const h = b.heroine;
  if (state.time.phase === "shift") return h.outfit;
  if (state.time.phase === "night") return b.night?.wants || h.traits.openness >= I.wear.boldOpenness ? I.wear.nightBold : I.wear.night;
  if (b.day?.her?.task === "wash") return I.wear.wash;
  // downstairs she is dressed for work even before opening; upstairs she is at home
  return state.where[WIFE]?.startsWith("home.") ? I.wear.home : h.outfit;
};
/** How her state shifts what she picks in the morning, in points of openness. */
export const dressShift = (state: GameState): number => {
  const b = bs(state);
  const h = b.heroine;
  const D = I.dress;
  let d = 0;
  if (h.mood < D.lowMood) d += D.lowMoodStep;
  d += (((h.feel?.fear ?? 0) + (h.feel?.shame ?? 0)) / 40) * D.fearStep;
  if (h.arousal >= 60 || h.frustration >= 50) d += D.wantStep;
  const run = b.wishRun?.dress_bold ?? b.wishRun?.sexier;
  if (run && state.time.day - run.day <= 1) d += D.wishStep;
  return Math.round(d);
};

export function registerBodyState(api: ModApi) {
  // === zones =======================================================================================
  api.events.on("encounter:ended", (ctx, e) => {
    const { patron, act, minutes } = e.payload as { patron: string; act: string; minutes: number };
    const p = bs(ctx.state).patrons[patron];
    if (p && actById(act).place === "private") wear(ctx, act, p.size, Math.max(3, minutes));
  });
  api.events.on("bed:ended", (ctx, e) => {
    const { act, turns } = e.payload as { act: string; turns: number };
    if (act !== "self") wear(ctx, act, bs(ctx.state).husband.size, turns * content.body.bed.minutesPerTurn);
  });
  const fade = (ctx: Ctx, tens: number) => {
    const h = bs(ctx.state).heroine;
    for (const z of ZONES) if (h.sore?.[z]) h.sore[z] = Math.max(0, h.sore[z]! - Z.fade * tens);
  };
  api.events.on("shift:tick", (ctx) => fade(ctx, 1));
  api.events.on("prep:tick", (ctx) => fade(ctx, 1));
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep") return;
    const h = bs(ctx.state).heroine;
    for (const z of ZONES) if (h.sore?.[z]) h.sore[z] = Math.round(h.sore[z]! * Z.night * 10) / 10;
    h.cumHis = {};
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.sore",
    labelKey: "factor.consent.sore",
    order: 19,
    eval: (state, { act }) => {
      let total = 0;
      for (const z of zonesOf(act)) {
        const s = soreOf(state, z);
        if (s >= Z.enoughAt) total -= Z.enough;
        else if (s > Z.consentFrom) total -= (s - Z.consentFrom) * Z.consent;
      }
      return total ? Math.round(total * 10) / 10 : null;
    },
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.slick",
    labelKey: "factor.consent.slick",
    order: 20,
    eval: (state, { act }) => {
      // only what was left there counts here: her own wetness is already in her arousal
      const h = bs(state).heroine;
      const zs = zonesOf(act);
      const left = (zs.includes("vagina") && (h.cum?.inside ?? 0) > 0) || (zs.includes("anus") && (h.cum?.anus ?? 0) > 0);
      return left ? Z.slickConsent : null;
    },
  });

  // === what is on her, and who notices ==============================================================
  // After something with a guest she goes and cleans up first, if she is hiding it. It takes minutes she may not have.
  api.events.on("encounter:ended", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh || b.mode !== "hidden" || sh.group?.herOut !== undefined) return;
    const marks = foreignMarks(ctx.state);
    const mussed = Object.keys(b.heroine.after ?? {}).length > 0;
    if (marks.length === 0 && !mussed) return;
    // a full room pulls her straight back; a quick-witted woman finds the minute anyway
    const busy = sh.visits.filter((v) => v.waited > 5).length >= 2;
    if (busy && ctx.rng.chance(clamp(I.marks.skipChance - (attrOf(ctx.state, "wit") - 50) * 0.004, 0, 1))) {
      ctx.log("log.marks.no_time", undefined, ["unseen"]);
      return;
    }
    const minutes = marks.length * I.marks.cleanPerMark + (mussed ? I.marks.cleanAfter : 0);
    sh.cleanUntil = sh.tick + minutes;
    sh.awayUntil = Math.max(sh.awayUntil ?? 0, sh.cleanUntil);
    sh.wifeFreeAt = Math.max(sh.wifeFreeAt ?? 0, sh.cleanUntil);
    ctx.state.where[WIFE] = "cafe.toilet";
    ctx.log("log.marks.cleaning", { minutes }, ["unseen"]);
  }, -50);
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh) return;
    if (sh.cleanUntil !== undefined && sh.tick >= sh.cleanUntil) {
      sh.cleanUntil = undefined;
      wash(ctx, I.marks.visible);
      b.heroine.after = {};
      if (!b.encounter) ctx.state.where[WIFE] = HALL;
    }
    // he looks at her and sees what another man left
    if (sh.marksSeen || b.encounter || !husbandSees(ctx.state, ctx.state.where[WIFE] ?? "")) return;
    const marks = foreignMarks(ctx.state);
    if (marks.length === 0) return;
    sh.marksSeen = true;
    if (b.mode === "hidden") {
      b.suspicion = clamp(b.suspicion + I.marks.husbandSuspicion * content.secrecy.styleFactor[b.husband.style]);
      feel(ctx, "fear", 10);
      ctx.log(`log.marks.husband.hidden.${marks.includes("face") ? "face" : "other"}`);
    } else {
      const fx = I.marks.husbandOpen[b.husband.style] ?? {};
      if (fx.mood) changeHim(ctx, "mood", fx.mood, "marks");
      if (fx.arousal) changeHim(ctx, "arousal", fx.arousal, "marks");
      ctx.log(`log.marks.husband.open.${b.husband.style}`);
    }
    ctx.emit("marks:seen", { by: HUSBAND, marks: marks.length });
  });
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh || ctx.state.where[WIFE] !== HALL || b.encounter || visibleMarks(ctx.state).length === 0) return;
    const G = I.marks.guests;
    for (const v of sh.visits) {
      const p = b.patrons[v.patron];
      if (!p) continue;
      p.memory.interest = clamp(p.memory.interest + (G.interest ?? 0));
      v.heat = clamp((v.heat ?? 0) + (G.heat ?? 0));
    }
    b.gossip = clamp(b.gossip + (G.gossip ?? 0));
    if (!sh.marksGuests) {
      sh.marksGuests = true;
      ctx.log("log.marks.guests");
      if (b.heroine.traits.openness < 55 && !b.heroine.latents.exhibitionist) feel(ctx, "shame", 8);
    }
  });

  // === what the bed leaves in her head ============================================================
  api.events.on("bed:her_ending", (ctx, e) => {
    const how = e.payload!.how as string;
    if (how === "slipped") feel(ctx, "contempt", I.lead.slipped.contempt ?? 0);
    else if (how !== "plain" && how !== "inside") feel(ctx, "pride", 5);
  });
  api.events.on("bed:lead", (ctx, e) => {
    if (e.payload!.taken) feel(ctx, "anger", I.lead.takeBack.anger ?? 0);
  });
  api.events.on("bed:said", (ctx) => feel(ctx, "tenderness", I.talk.sayMine.tenderness ?? 0));
  api.events.on("bed:after", (ctx, e) => {
    const out = e.payload!.outcome as string;
    if (out === "refused") annoy(ctx, I.after.refused.annoy ?? 0, "him");
    else if (out === "done") feel(ctx, "shame", (I.after.done.shame ?? 0) * (bs(ctx.state).heroine.traits.openness >= 60 ? 0 : 1));
    else feel(ctx, "pride", I.after.reversed.pride ?? 0);
    if (out !== "refused") changeHim(ctx, "arousal", 6, "after");
    void changeHeroine;
  });

  api.invariants.add("bodystate", (s) => {
    for (const [z, v] of Object.entries(bs(s).heroine.sore ?? {})) if (!(v >= 0 && v <= 100)) return `soreness out of range: ${z}=${v}`;
    return null;
  });
}
