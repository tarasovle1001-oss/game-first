// Her body: what each zone takes comfortably, how it changes with practice, and whether she comes.
// Size is tied in here: a partner bigger than what she is used to stretches her, and what she is used to
// decides how much a given size gives her.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Act } from "../content/schema";
import { bs, clamp } from "../state";
import type { Zone } from "../state";
import { changeHeroine } from "./heroine";

const B = content.body;
const ZONES: Zone[] = ["vagina", "anus", "mouth"];
const stretchZone = (act: Act): Zone | null => (act.zones.find((z) => z !== "hands") as Zone | undefined) ?? null;

/** Size in cm the zone takes comfortably right now. */
export const fitOf = (state: GameState, zone: Zone) => B.fit[zone].base + bs(state).heroine.body[zone].stretch * B.fit[zone].perStretch;

/**
 * 0..100: how much a given size gives her. Too small does little, a bit more than she is used to is best,
 * much more hurts. `ratio` = his size / what she takes comfortably.
 */
export function pleasureFromSize(ratio: number): number {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (ratio < 0.7) return lerp(3, 15, (ratio - 0.35) / 0.35); // far past his size there is nothing left to feel
  if (ratio < 1) return lerp(15, 85, (ratio - 0.7) / 0.3);
  if (ratio <= 1.2) return lerp(85, 100, (ratio - 1) / 0.2);
  if (ratio <= 1.5) return lerp(100, 40, (ratio - 1.2) / 0.3);
  return 25;
}

/** What an act with a partner of this size would give her right now, 0..100. Pure: nothing changes. */
export function pleasureFor(state: GameState, act: Act, size: number): number {
  const zone = stretchZone(act);
  if (act.id === "cunnilingus") return 75;
  if (act.id === "grinding") return 45;
  if (act.id === "mutual_touching") return 60;
  if (act.id === "breast_play") return 40;
  if (act.id === "fingering" || act.id === "sixty_nine") return 70;
  if (act.id === "rimming_her") return 65;
  if (zone === "vagina" || zone === "anus") return pleasureFromSize(size / fitOf(state, zone)) * (zone === "anus" ? 0.75 : 1);
  return 20; // she is the one giving
}

/** Centimetres as the screen says them. Since 22.11 the plain ones (look at body.yaml: shownCm). */
export const shownCm = (cm: number) => Math.round(cm <= B.shownCm.from ? cm : B.shownCm.from + (cm - B.shownCm.from) * B.shownCm.factor);
/** 0..4: tiny, small, average, big, huge. For pictures: five looks. */
export const sizeClass = (cm: number) => B.sizeClasses.filter((edge) => cm >= edge).length;
/** 1..12: the step of the size ladder a length stands on. For the mechanics. */
export const sizeStage = (cm: number) => B.stages.filter((edge) => cm >= edge).length + 1;
/** What is hers for good in a zone, 0..100 (old saves kept a share of the peak). */
export const permOf = (z: { stretch: number; peak: number; perm?: number }) => z.perm ?? Math.min(z.stretch, z.peak * B.permanentShare);
/** How many steps a size is above what the zone takes today; 0 = it fits. */
export const stepsAbove = (state: GameState, zone: Zone, size: number) => Math.max(0, sizeStage(size) - sizeStage(fitOf(state, zone)));
/** The zone an act has to get into, if any: only there can a size be too much. */
export const entersZone = (act: Act): "vagina" | "anus" | null => (act.zones.includes("vagina") && act.id !== "cunnilingus" ? "vagina" : act.zones.includes("anus") ? "anus" : null);

/** The chance that a size above her step goes in. `warm`: what was done to that place earlier in the scene, 0..warmMax. 0 = not even worth a try. */
export function takeChance(state: GameState, zone: "vagina" | "anus", size: number, warm = 0): number {
  const T = B.take;
  const steps = stepsAbove(state, zone, size);
  if (steps === 0) return 1;
  const base = T.chance[steps - 1];
  if (base === undefined) return 0;
  const h = bs(state).heroine;
  return Math.min(0.95, Math.max(0.02, base + ((h.arousal - 50) / 50) * T.arousal + Math.min(T.warmMax, warm) + (h.drunk >= 30 ? T.drunk : 0) + (zone === "anus" ? T.anus : 0)));
}

export type Take = "fits" | "took" | "partial" | "failed" | "never";
/** She tries to take a size. Within her step it fits; above it the dice decide; a partial try still leaves a mark on today's stretch. */
export function tryTake(ctx: Ctx, zone: "vagina" | "anus", size: number, warm = 0): Take {
  const chance = takeChance(ctx.state, zone, size, warm);
  if (chance >= 1) return "fits";
  if (chance <= 0) return "never";
  if (ctx.rng.chance(chance)) return "took";
  if (!ctx.rng.chance(B.take.partial)) return "failed";
  stretchBy(ctx, zone, size, B.take.partialShare);
  return "partial";
}

/** Today's stretch from one act: a share of the centimetres above her size, or a little from sheer number when it fits. */
function stretchBy(ctx: Ctx, zone: Zone, size: number, share = B.take.share) {
  const z = bs(ctx.state).heroine.body[zone];
  if (zone !== "mouth" && size > bs(ctx.state).husband.size) bs(ctx.state).heroine.lastBig = { day: ctx.state.time.day, size };
  const over = size - fitOf(ctx.state, zone);
  const perm = permOf(z);
  if (over > 0) z.stretch = clamp(z.stretch + ((over * share) / B.fit[zone].perStretch) * (B.stretchZone[zone] ?? 1));
  else if (size > 0 && zone !== "mouth") z.stretch = clamp(Math.max(z.stretch, Math.min(perm + B.take.volumeCap, z.stretch + B.take.perAct)));
  z.perm = perm;
  z.peak = Math.max(z.peak, z.stretch);
}

/** Her bar: the biggest she has seen or had. Seeing more than ever before feeds her taste for size. */
export function sawSize(ctx: Ctx, size: number) {
  const h = bs(ctx.state).heroine;
  const before = h.seenSize ?? bs(ctx.state).husband.size;
  if (size > before) {
    if (sizeStage(size) > sizeStage(before)) h.sizeTaste = clamp(h.sizeTaste + B.take.tasteSeen);
    h.seenSize = size;
  }
}

/** Stretch and practice from one act with a partner of the given size. Returns how much it gives her, 0..100. */
export function useBody(ctx: Ctx, act: Act, size: number): number {
  const h = bs(ctx.state).heroine;
  const zone = stretchZone(act);
  let pleasure = 20; // she is the one giving
  if (act.id === "cunnilingus") pleasure = 75;
  else if (act.id === "grinding") pleasure = 45;
  else if (act.id === "mutual_touching") pleasure = 60;
  else if (act.id === "breast_play") pleasure = 40;
  else if (act.id === "fingering") pleasure = 70;
  else if (act.id === "sixty_nine") pleasure = 70;
  else if (zone === "vagina" || zone === "anus") {
    const fit = fitOf(ctx.state, zone);
    pleasure = pleasureFromSize(size / fit) * (zone === "anus" ? 0.75 : 1);
    stretchBy(ctx, zone, size);
  } else if (zone === "mouth") {
    if (act.id === "deepthroat") stretchBy(ctx, "mouth", size, B.take.partialShare);
  }
  // one she cannot take, in her hand or mouth: it stays on her mind
  if (size > 0 && !entersZone(act) && stepsAbove(ctx.state, "vagina", size) >= 2) h.sizeTaste = clamp(h.sizeTaste + B.take.tasteHandled);
  if (size > 0) sawSize(ctx, size);
  const skill = h.skills[act.id] ?? 0;
  h.skills[act.id] = clamp(skill + B.skillGain * (1 - skill / 100));
  return pleasure;
}

/** She comes: the same bookkeeping wherever it happens. */
export function orgasm(ctx: Ctx) {
  const h = bs(ctx.state).heroine;
  h.orgasms += 1;
  h.satisfied = 100;
  changeHeroine(ctx, "arousal", -h.arousal + 8, "orgasm");
  changeHeroine(ctx, "mood", 8, "orgasm");
}

export interface ActOutcome {
  pleasure: number; // 0..100, hers
  came: boolean;
  meter: number;
}

/**
 * The physical side of an act: stretch, skill, and whether she comes. Called for any partner.
 * Deterministic: the same state and partner always give the same result.
 */
export function resolveBody(ctx: Ctx, act: Act, partner: { size: number; minutes: number }): ActOutcome {
  const h = bs(ctx.state).heroine;
  const zone = stretchZone(act);
  let pleasure = 20; // she is the one giving
  if (act.id === "cunnilingus") pleasure = 75;
  else if (act.id === "fingering" || act.id === "sixty_nine") pleasure = 70;
  else if (zone === "vagina" || zone === "anus") {
    const fit = fitOf(ctx.state, zone);
    pleasure = pleasureFromSize(partner.size / fit) * (zone === "anus" ? 0.75 : 1);
  }

  // stretch: what goes beyond her size leaves a mark on today; what fits adds a little by sheer number
  if (zone && zone !== "mouth") stretchBy(ctx, zone, partner.size);
  else if (zone === "mouth" && act.id === "deepthroat") stretchBy(ctx, "mouth", partner.size, B.take.partialShare);
  sawSize(ctx, partner.size);

  // skill grows with practice, slower the better she already is
  const skill = h.skills[act.id] ?? 0;
  h.skills[act.id] = clamp(skill + B.skillGain * (1 - skill / 100));

  // climax meter: how turned on she was, how well it suits her, how long it lasts
  const meter = h.arousal * 0.45 + pleasure * 0.45 + Math.min(30, partner.minutes) - h.satisfied * 0.2;
  const came = meter >= B.orgasmAt && pleasure >= 50;
  if (came) {
    h.orgasms += 1;
    h.satisfied = 100;
    changeHeroine(ctx, "arousal", -h.arousal + 8, "orgasm");
    changeHeroine(ctx, "mood", 8, "orgasm");
  }
  return { pleasure, came, meter };
}

export function registerBody(api: ModApi) {
  api.events.on("shift:tick", (ctx) => {
    const h = bs(ctx.state).heroine;
    h.satisfied = Math.max(0, h.satisfied - B.satisfiedCoolPerTick);
  });

  // Overnight the body recovers, but never all the way back.
  api.events.on("day:end", (ctx) => {
    const h = bs(ctx.state).heroine;
    // of what today added, a share stays for good and a share goes back: one big night leaves little, a habit leaves a step
    for (const zone of ZONES) {
      const z = h.body[zone];
      const perm = permOf(z);
      const extra = Math.max(0, z.stretch - perm);
      z.perm = perm + extra * B.take.keep;
      z.stretch = Math.max(z.perm, z.stretch - extra * B.take.fade);
    }
    h.satisfied = 0;
  });

  api.invariants.add("body-bounds", (s) => {
    const h = bs(s).heroine;
    for (const zone of ZONES) {
      const z = h.body[zone];
      if (z.stretch < 0 || z.stretch > 100 || z.peak < z.stretch - 1e-9 || (z.perm ?? 0) > z.stretch + 1e-9) return `${zone} stretch out of range: ${z.stretch} (peak ${z.peak})`;
    }
    for (const [k, v] of Object.entries(h.skills)) if (v < 0 || v > 100) return `skill ${k} out of range: ${v}`;
    for (const [k, v] of Object.entries({ satisfied: h.satisfied, sizeTaste: h.sizeTaste, desire: h.marriage.desire, resent: h.marriage.resent }))
      if (v < 0 || v > 100) return `${k} out of range: ${v}`;
    return null;
  });
}
