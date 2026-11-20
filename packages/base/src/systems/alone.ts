// What he does by himself: with his hand, or with a toy on himself. It settles him for the day,
// and now and then she opens the door at the wrong moment; what she makes of it is hers.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { passPrep } from "./day";
import { changeHeroine } from "./heroine";
import { feel } from "./mind";
import { detail, glance } from "./glance";
import { sizeClass } from "./body";
import { changeConfidence } from "./nerve";
import { changeHim, passNight } from "./rhythm";

export const ALONE = "base/alone";
const A = content.body.alone;
const K = content.body.his;

/** The biggest toy of theirs that he can take himself. */
const toyFor = (state: GameState) => {
  const b = bs(state);
  const fit = K.fitBase + b.husband.stretch * K.fitPerStretch;
  // his own too: a toy still in the bag is his to use before it is ever hers
  const mine = new Set([...b.toys, ...(b.bag ?? []).filter((x) => x.kind === "toy").map((x) => x.id)]);
  return content.day.shop.toys.filter((t) => mine.has(t.id) && t.size <= fit + K.tooBig).sort((x, y) => y.size - x.size)[0] ?? null;
};

export function registerAlone(api: ModApi) {
  api.actions.register({
    id: ALONE,
    labelKey: "action.alone",
    describe: (a) => ({ key: `action.alone.${a.payload!.do}` }),
    enumerate(state) {
      const b = bs(state);
      const at = state.where[HUSBAND] ?? "";
      const phase = state.time.phase;
      // at home, by himself, with time on his hands, and not already spent today
      if (!A.rooms.includes(at) || state.where[WIFE] === at || b.husband.spentDay === state.time.day || b.caught || b.night?.sex) return [];
      if (phase === "prep" ? !b.day || !!b.day.busy || b.day.left <= A.minutes : phase !== "night" || !b.night) return [];
      // locked up, his hand has nothing to do
      return [...(b.husband.caged ? [] : [{ type: ALONE, payload: { do: "hand" } }]), ...(toyFor(state) ? [{ type: ALONE, payload: { do: "toy" } }] : [])];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const toy = action.payload!.do === "toy" ? toyFor(ctx.state) : null;
      b.husband.spentDay = ctx.state.time.day;
      ctx.emit("husband:came_touch", { from: "alone" });
      changeHim(ctx, "mood", A.mood, "alone");
      if (toy) {
        const fit = K.fitBase + b.husband.stretch * K.fitPerStretch;
        b.husband.stretch = clamp(b.husband.stretch + K.practice + Math.max(0, toy.size - fit) * content.body.stretchPerCm);
      }
      ctx.log(toy ? "log.alone.toy" : "log.alone.hand", toy ? { toy: `toy.${toy.id}` } : undefined);
      // she is in the house and awake: sometimes she comes looking for him
      const around = ctx.state.time.phase === "prep" ? b.day?.her?.task !== "away" && !(ctx.state.where[WIFE] ?? "").startsWith("town.") : !b.night?.herAsleep && (ctx.state.where[WIFE] ?? "").startsWith("home.");
      if (around && ctx.rng.chance(A.caughtChance)) {
        const hard = b.power >= A.hardPower || h.latents.cruel_streak !== undefined;
        const warm = h.marriage.desire >= A.warmDesire && h.marriage.resent < A.warmMaxResent;
        if (toy) {
          // what he does to himself there tells her something about who can do what to whom
          b.power = clamp(b.power + A.toy.power);
          // and it is one she has never seen: now she has
          if ((b.bag ?? []).some((x) => x.id === toy.id)) {
            b.bag = b.bag!.filter((x) => x.id !== toy.id);
            b.toys.push(toy.id);
            changeHeroine(ctx, "arousal", 3, "new toy");
            ctx.log("log.alone.caught.toy.unknown", { toy: `toy.${toy.id}` });
          }
          if (hard || (warm && h.traits.openness >= A.toy.joinOpenness)) {
            b.power = clamp(b.power + A.toy.powerJoin);
            changeHeroine(ctx, "arousal", A.toy.arousal, "husband");
            b.promised = ctx.state.time.day; // tonight she comes to him with an idea of her own
            ctx.log(hard ? "log.alone.caught.toy.hard" : "log.alone.caught.toy.warm");
          } else {
            changeHeroine(ctx, "mood", A.toy.mood, "husband");
            feel(ctx, "pity", A.toy.pity, 1, "caught");
            changeConfidence(ctx, A.confidence, "caught");
            ctx.log("log.alone.caught.toy");
          }
        } else if (warm && !hard) {
          changeHeroine(ctx, "arousal", A.hand.arousal, "husband");
          changeHeroine(ctx, "mood", A.hand.moodWarm, "husband");
          ctx.log("log.alone.caught.hand.warm");
          // she does not just stand in the door: she comes in and takes over
          if (h.traits.openness >= A.joinOpenness) {
            h.marriage.desire = clamp(h.marriage.desire + A.joinDesire);
            changeHim(ctx, "mood", A.joinMood, "she joined");
            ctx.log("log.alone.joined");
            glance(ctx, "by_hand", ctx.state.where[HUSBAND], [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }]);
            ctx.emit("husband:joined_alone", {});
          }
        } else {
          changeHeroine(ctx, "mood", A.hand.mood, "husband");
          h.marriage.desire = Math.max(0, h.marriage.desire - A.hand.desire);
          if (hard) b.power = clamp(b.power + 1);
          changeConfidence(ctx, A.confidence, "caught");
          ctx.log(hard ? "log.alone.caught.hand.hard" : "log.alone.caught.hand");
        }
        detail(ctx, { id: toy ? "toy_him" : "him_alone", who: HUSBAND, tags: toy ? { tsize: String(sizeClass(toy.size)), who: "self" } : {} });
        ctx.emit("husband:caught_alone", { toy: !!toy });
      }
      if (ctx.state.time.phase === "prep") passPrep(ctx, A.minutes);
      else passNight(ctx, A.minutes);
    },
  });
}
