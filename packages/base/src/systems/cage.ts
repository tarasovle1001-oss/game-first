// The cage as a state of his, not a moment in bed: once it is on, it stays on by day and by night until she takes it off.
// While it is on he has nothing to enter her with: only what needs nothing of him is possible, and none of it ends for him.
import { cruelNow } from "./hernight";
import { flagOff } from "./kinks";
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { changeHeroine } from "./heroine";

export const CAGE = "base/cage";
const Cg = content.body.cage;

export const cagedDays = (state: GameState): number | null => {
  const c = bs(state).husband.caged;
  return c ? state.time.day - c.day : null;
};
export const isCaged = (state: GameState) => !!bs(state).husband.caged;
/** She likes holding the key: a wife with power over him, or with that streak in her. */
const keeper = (state: GameState) => bs(state).power >= Cg.keepPower || cruelNow(bs(state));

export function registerCage(api: ModApi) {
  // it goes on in bed, by her hand
  api.events.on("bed:ended", (ctx, e) => {
    if (e.payload!.act !== "chastity") return;
    const b = bs(ctx.state);
    if (b.husband.caged || flagOff(ctx.state, "cage")) return;
    b.husband.caged = { day: ctx.state.time.day };
    b.power = clamp(b.power + Cg.power);
    ctx.log("log.cage.on");
  });

  // every morning it is her decision
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep") return;
      const b = bs(ctx.state);
      const c = b.husband.caged;
      if (!c) return;
      const days = ctx.state.time.day - c.day;
      if (days < 1) return;
      const keeps = keeper(ctx.state) ? ctx.rng.chance(Cg.keepChance) : days < Cg.softDays && ctx.rng.chance(Cg.softKeepChance);
      if (keeps) {
        b.power = clamp(b.power + Cg.powerPerDay);
        if (days === 1 || days % 3 === 0) ctx.log("log.cage.kept", { days });
        return;
      }
      b.husband.caged = undefined;
      ctx.log(keeper(ctx.state) ? "log.cage.off.hers" : "log.cage.off");
    },
    15,
  );

  // he can ask; whether that helps depends on who holds the key
  api.actions.register({
    id: CAGE,
    labelKey: "action.cage.ask",
    enumerate(state) {
      const b = bs(state);
      const c = b.husband.caged;
      if (!c || c.asked === state.time.day || state.where[HUSBAND] !== state.where[WIFE] || b.caught || b.encounter || b.night?.sex || state.time.phase === "summary") return [];
      if (state.time.phase === "prep" && b.day?.busy) return [];
      return [{ type: CAGE }];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.husband.caged!.asked = ctx.state.time.day;
      const yes = !keeper(ctx.state) || (h.marriage.desire >= Cg.askDesire && h.frustration >= Cg.askFrustration);
      if (yes) {
        b.husband.caged = undefined;
        ctx.log(keeper(ctx.state) ? "log.cage.ask.yes.hers" : "log.cage.ask.yes");
        return;
      }
      b.power = clamp(b.power + 1);
      changeHeroine(ctx, "mood", 1, "husband");
      ctx.log("log.cage.ask.no");
    },
  });

  api.invariants.add("cage", (s) => {
    const c = bs(s).husband.caged;
    return c && c.day > s.time.day ? "the cage was put on in the future" : null;
  });
}
