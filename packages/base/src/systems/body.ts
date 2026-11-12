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

/** 0..4: tiny, small, average, big, huge. */
export const sizeClass = (cm: number) => B.sizeClasses.filter((edge) => cm >= edge).length;

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
    const over = size - fit;
    if (over > 0) {
      const z = h.body[zone];
      z.stretch = clamp(z.stretch + over * B.stretchPerCm * (B.stretchZone[zone] ?? 1));
      z.peak = Math.max(z.peak, z.stretch);
    }
  } else if (zone === "mouth") {
    const over = size - fitOf(ctx.state, "mouth");
    if (over > 0 && act.id === "deepthroat") {
      const z = h.body.mouth;
      z.stretch = clamp(z.stretch + over * B.stretchPerCm);
      z.peak = Math.max(z.peak, z.stretch);
    }
  }
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

  // stretch: only what goes beyond the comfortable size leaves a mark
  if (zone) {
    const over = partner.size - fitOf(ctx.state, zone);
    if (over > 0) {
      const z = h.body[zone];
      z.stretch = clamp(z.stretch + over * B.stretchPerCm * (B.stretchZone[zone] ?? 1));
      z.peak = Math.max(z.peak, z.stretch);
    }
  }

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
    for (const zone of ZONES) {
      const z = h.body[zone];
      z.stretch = Math.max(z.peak * B.permanentShare, z.stretch - B.recoverPerDay);
    }
    h.satisfied = 0;
  });

  api.invariants.add("body-bounds", (s) => {
    const h = bs(s).heroine;
    for (const zone of ZONES) {
      const z = h.body[zone];
      if (z.stretch < 0 || z.stretch > 100 || z.peak < z.stretch - 1e-9) return `${zone} stretch out of range: ${z.stretch} (peak ${z.peak})`;
    }
    for (const [k, v] of Object.entries(h.skills)) if (v < 0 || v > 100) return `skill ${k} out of range: ${v}`;
    for (const [k, v] of Object.entries({ satisfied: h.satisfied, sizeTaste: h.sizeTaste, desire: h.marriage.desire, resent: h.marriage.resent }))
      if (v < 0 || v > 100) return `${k} out of range: ${v}`;
    return null;
  });
}
