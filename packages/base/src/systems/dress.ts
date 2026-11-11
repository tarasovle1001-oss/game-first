// How much she has on. Her husband can ask her to take off her top, her skirt and underwear, or everything.
// In the bedroom it is easy; in an empty room it takes an open wife; in front of guests it takes
// a very open one, or one who likes being looked at. What the guests see, they react to.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Bare } from "../state";
import { CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";
import { HALL } from "./places";

export const STRIP = "base/strip";
const D = content.manners.talk.bare;
const BEDROOM = "home.bedroom";
const LEVELS: Exclude<Bare, "none">[] = ["top", "bottom", "all"];

export const bareOf = (state: GameState): Bare => bs(state).heroine.bare ?? "none";
/** What the pictures call what she has on: the outfit, or what is left of it. */
export const dressOf = (state: GameState): string => {
  const bare = bareOf(state);
  return bare === "none" ? bs(state).heroine.outfit : bare === "all" ? "naked" : bare === "top" ? "topless" : "bottomless";
};
/** Who can see her where she is: nobody but him, nobody at all right now, or the guests. */
export const eyesOn = (state: GameState, loc = state.where[WIFE] ?? ""): "bedroom" | "private" | "hall" => {
  if (loc === BEDROOM) return "bedroom";
  const guests = state.time.phase === "shift" && (bs(state).shift?.visits.length ?? 0) > 0;
  return loc === HALL && guests ? "hall" : "private";
};
/** How far above (or below) what it takes she is, for going this bare in this place. */
export const bareMargin = (state: GameState, off: Exclude<Bare, "none">, where = eyesOn(state)): number => {
  const b = bs(state);
  const h = b.heroine;
  const likesEyes = h.latents.exhibitionist !== undefined && where !== "bedroom" ? D.exhibitionist : 0;
  const habit = Math.min(D.habitMax, (b.bareTimes ?? 0) * D.perTime);
  const marriage = where === "hall" ? 0 : (h.marriage.desire - 50) * D.perDesire;
  return h.traits.openness + h.arousal * D.perArousal + h.drunk * D.perDrunk + likesEyes + habit + marriage - D.need[where]![off];
};

const guestsSee = (ctx: Ctx, first: boolean) => {
  const b = bs(ctx.state);
  const bare = bareOf(ctx.state);
  if (bare === "none" || eyesOn(ctx.state) !== "hall") return;
  for (const v of b.shift!.visits) {
    const p = b.patrons[v.patron];
    if (!p || v.sawBare === bare) continue;
    v.sawBare = bare;
    p.memory.interest = clamp(p.memory.interest + D.allure[bare]);
  }
  b.gossip = clamp(b.gossip + D.gossip[bare]);
  if (first) ctx.log(`log.bare.guests.${bare}`);
};
const dress = (ctx: Ctx, key: string | null) => {
  const h = bs(ctx.state).heroine;
  if (bareOf(ctx.state) === "none") return;
  h.bare = "none";
  if (key) ctx.log(key);
};

export function registerDress(api: ModApi) {
  api.actions.register({
    id: STRIP,
    labelKey: "action.strip",
    describe: (a) => ({ key: `action.strip.${a.payload!.off}` }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase === "summary" || b.encounter || b.caught || b.reaction || b.night?.sex) return [];
      if (state.where[HUSBAND] !== state.where[WIFE] || !state.where[WIFE]) return [];
      const now = bareOf(state);
      const stamp = `${state.time.day}:${state.time.phase}`;
      const asks = b.bareRefused === stamp ? [] : LEVELS.filter((l) => l !== now);
      return [...asks, ...(now === "none" ? [] : (["none"] as const))].map((off) => ({ type: STRIP, payload: { off } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const off = action.payload!.off as Bare;
      const where = eyesOn(ctx.state);
      if (off === "none") {
        // dressing is never a problem, but if it was her own idea she takes the hint
        const own = b.bareOwn === true;
        if (own) h.marriage.resent = clamp(h.marriage.resent + D.backResent);
        b.bareOwn = false;
        dress(ctx, own ? "log.bare.dress.sulk" : "log.bare.dress");
        return;
      }
      const margin = bareMargin(ctx.state, off, where);
      if (margin < 0) {
        b.bareRefused = `${ctx.state.time.day}:${ctx.state.time.phase}`;
        if (margin < -D.offended) h.marriage.resent = clamp(h.marriage.resent + D.refuseResent);
        ctx.log(`log.bare.no.${where}${margin < -D.offended ? ".offended" : ""}`, { what: `bare.${off}` });
        return;
      }
      h.bare = off;
      b.bareOwn = false;
      b.bareTimes = (b.bareTimes ?? 0) + 1;
      if (where !== "bedroom") h.traits.openness = clamp(h.traits.openness + D.openness[where]);
      ctx.log(`log.bare.yes.${where}.${off}${margin < D.shy ? ".shy" : ""}`);
      // what he feels about it depends on whether this was ever his secret to keep
      if (where === "hall") ctx.log(b.mode === "open" ? "log.bare.husband.open" : "log.bare.husband.hidden");
      guestsSee(ctx, true);
      ctx.emit("bare:changed", { to: off, where });
    },
  });

  // New guests see her as she is; she covers up the moment it is more than she can stand.
  api.events.on("patron:arrived", (ctx) => {
    const bare = bareOf(ctx.state);
    if (bare === "none") return;
    if (eyesOn(ctx.state) === "hall" && bareMargin(ctx.state, bare, "hall") < 0) dress(ctx, "log.bare.covers");
    else guestsSee(ctx, false);
  });
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id !== WIFE) return;
    const bare = bareOf(ctx.state);
    if (bare !== "none" && bareMargin(ctx.state, bare) < 0) dress(ctx, "log.bare.covers.leaving");
  });
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const phase = e.payload!.phase as string;
    if (phase === "prep") {
      dress(ctx, null); // a new day starts dressed
      b.bareOwn = false;
    }
    if (phase !== "shift") return;
    const bare = bareOf(ctx.state);
    if (bare !== "none" && bareMargin(ctx.state, bare, "hall") < 0) dress(ctx, "log.bare.covers.opening");
    // a wife who likes being looked at, and is past caring, sometimes comes down like that on her own
    if (bareOf(ctx.state) === "none" && h.latents.exhibitionist !== undefined && bareMargin(ctx.state, "top", "hall") >= D.ownMargin && ctx.rng.chance(D.ownChance)) {
      h.bare = bareMargin(ctx.state, "all", "hall") >= D.ownMargin ? "all" : "top";
      b.bareOwn = true;
      ctx.log(`log.bare.own.${h.bare}`);
    }
  });
  // every tick she works like that, the room gets used to looking, and so does she
  api.events.on("shift:tick", (ctx) => {
    const bare = bareOf(ctx.state);
    if (bare === "none" || eyesOn(ctx.state) !== "hall") return;
    guestsSee(ctx, false);
    const h = bs(ctx.state).heroine;
    h.arousal = clamp(h.arousal + (h.latents.exhibitionist !== undefined ? D.arousalPerTick : D.arousalPerTick / 3));
  });

  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.bare",
    labelKey: "factor.tip.bare",
    order: 32,
    eval: (state, { bill }) => {
      const bare = bareOf(state);
      return bare === "none" || state.where[WIFE] !== HALL ? null : (bill * D.tip[bare]) / 4;
    },
  });
  // half undressed already, the next step is a shorter one
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.bare",
    labelKey: "factor.consent.bare",
    order: 44,
    eval: (state, input) => {
      const bare = bareOf(state);
      const act = content.acts.find((a) => a.id === input.act);
      return bare === "none" || !act || act.tier < 2 || input.partner === HUSBAND ? null : D.consent[bare];
    },
  });
  api.invariants.add("bare", (s) => (["none", "top", "bottom", "all"].includes(bareOf(s)) ? null : `unknown undress state: ${bs(s).heroine.bare}`));
}
