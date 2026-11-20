// His own body in bed: how sure of himself he is, and how long he has gone without.
// Both pile up. A bad night makes the next one likelier to go wrong; a long stretch without makes him quick,
// and sooner or later it ends in his sleep. None of it depends on her: it can happen with a wife who adores him.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { changeHeroine } from "./heroine";
import { feel } from "./mind";
import { changeHim } from "./rhythm";

const N = content.body.nerve;

export const confidenceOf = (state: GameState) => bs(state).husband.confidence ?? N.confidence.start;
/** Nights in a row that ended without his own release. */
export const dryOf = (state: GameState) => bs(state).husband.dry ?? 0;

/** The only way his confidence changes: it never falls through the floor. */
export function changeConfidence(ctx: Ctx, amount: number, reason: string) {
  const h = bs(ctx.state).husband;
  const before = confidenceOf(ctx.state);
  h.confidence = Math.max(N.confidence.floor, clamp(before + amount));
  if (h.confidence !== before) ctx.emit("husband:changed", { key: "confidence", amount: h.confidence - before, reason });
}

/** Chance per turn of a scene that he goes soft for no reason of hers: a little always, more the less sure he is. */
export const softChance = (state: GameState) => {
  const c = confidenceOf(state);
  // above the start the plain bad luck thins out to half, never to nothing: it happens to the surest of men
  return c >= N.confidence.start ? N.soft.base * (0.5 + (0.5 * (100 - c)) / (100 - N.confidence.start)) : N.soft.base + (N.confidence.start - c) * N.soft.perLostConfidence;
};
/** Chance that tonight he is over almost before it starts: nights without, and nerves. */
export const earlyChance = (state: GameState) => dryOf(state) * N.early.perDryNight + Math.max(0, N.confidence.start - confidenceOf(state)) * N.early.perLostConfidence;

export const WET_TELL = "base/wet-tell";
export function registerNerve(api: ModApi) {
  // A wet dream she slept through: he can tell her himself that morning, or say nothing.
  api.actions.register({
    id: WET_TELL,
    labelKey: "action.wet_tell",
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || b.husband.wetSecret !== state.time.day || !state.where[HUSBAND] || state.where[HUSBAND] !== state.where[WIFE] || b.day?.busy) return [];
      return [{ type: WET_TELL }];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.husband.wetSecret = undefined;
      // owning up costs him a little face and buys a little trust; how she takes it is how she feels about him
      h.marriage.trust = clamp((h.marriage.trust ?? 50) + N.wet.tellTrust);
      b.power = clamp(b.power + N.wet.power);
      const kind = h.marriage.desire >= N.react.warmDesire;
      feel(ctx, "pity", kind ? N.wet.pity / 2 : N.wet.pity, 1, "wet dream");
      if (kind) changeHeroine(ctx, "arousal", N.wet.tellArousal, "husband");
      ctx.log(kind ? "log.nerve.wet.told.kind" : "log.nerve.wet.told");
      ctx.emit("husband:wet_dream", { noticed: true, who: HUSBAND, told: true });
    },
  });
  // what a night in bed does to him
  api.events.on("bed:ended", (ctx, e) => {
    const { outcome } = e.payload as { outcome: string };
    const b = bs(ctx.state);
    const h = b.heroine;
    if (!["dropped", "went_soft", "stopped"].includes(outcome)) b.husband.dry = -1; // tonight he had his; the night's end makes it 0
    const failed = outcome === "went_soft" || outcome === "too_soon" || outcome === "premature";
    if (failed) {
      changeConfidence(ctx, outcome === "went_soft" ? N.confidence.soft : N.confidence.early, outcome);
      // how she takes it is hers: a wife who holds the reins lets him feel it, a warm one does not let him sink
      const hard = b.power >= N.react.hardPower || h.latents.cruel_streak !== undefined;
      const warm = !hard && h.marriage.desire >= N.react.warmDesire && h.marriage.resent < N.react.warmMaxResent;
      if (hard) {
        b.power = clamp(b.power + N.react.power);
        changeConfidence(ctx, N.confidence.mocked, "mocked");
        ctx.log("log.nerve.mocked");
      } else if (warm) {
        changeConfidence(ctx, N.confidence.comforted, "comforted");
        ctx.log("log.nerve.comforted");
      }
    } else if (outcome === "came") changeConfidence(ctx, N.confidence.good, "good night");
    else if (outcome === "his") changeConfidence(ctx, N.confidence.his, "his night");
  });
  api.events.on("husband:came_touch", (ctx) => void (bs(ctx.state).husband.dry = -1));
  api.events.on("day:did", (ctx, e) => {
    if (e.payload!.do === "gym" || e.payload!.do === "gym_together") changeConfidence(ctx, N.confidence.gym, "gym");
  });

  // the night is over: one more without, or the count starts again
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase !== "night") return;
    const h = bs(ctx.state).husband;
    h.dry = (h.dry ?? 0) + 1;
  });

  // the morning: nerves settle a little on their own, and sometimes the night has settled the other thing for him
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep" || ctx.state.time.day <= 1) return;
      const b = bs(ctx.state);
      const conf = confidenceOf(ctx.state);
      if (conf !== N.confidence.start) changeConfidence(ctx, Math.sign(N.confidence.start - conf) * Math.min(N.confidence.settle, Math.abs(N.confidence.start - conf)), "time");
      const dry = dryOf(ctx.state);
      if (dry < 1 || !ctx.rng.chance(Math.min(N.wet.max, N.wet.base + dry * N.wet.perDryNight))) return;
      b.husband.dry = 0;
      changeHim(ctx, "arousal", -content.body.his.wetRelief, "wet dream"); // in his sleep: it does not count for much
      // she is usually up before him: whether she saw the sheet is a matter of luck
      const noticed = ctx.rng.chance(N.wet.noticed);
      if (!noticed) {
        changeHim(ctx, "mood", N.wet.mood, "wet dream");
        ctx.log("log.nerve.wet.alone");
        b.husband.wetSecret = ctx.state.time.day; // his to tell or to keep
        return;
      }
      changeHim(ctx, "mood", N.wet.moodNoticed, "wet dream");
      changeConfidence(ctx, N.confidence.wet, "wet dream");
      changeHeroine(ctx, "mood", N.wet.herMood, "husband");
      feel(ctx, "pity", N.wet.pity, 1, "wet dream");
      b.power = clamp(b.power + N.wet.power);
      ctx.log(b.heroine.marriage.desire >= N.react.warmDesire ? "log.nerve.wet.noticed.kind" : "log.nerve.wet.noticed");
      ctx.emit("husband:wet_dream", { noticed, who: HUSBAND });
    },
    20,
  );

  api.invariants.add("nerve", (s) => {
    const c = confidenceOf(s);
    return c < N.confidence.floor || c > 100 ? `his confidence out of range: ${c}` : dryOf(s) < -1 ? `nights without below -1: ${dryOf(s)}` : null;
  });
}
