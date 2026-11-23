// What he does by himself: with his hand, or with a toy on himself. It is played a few minutes at a time, like a scene in bed:
// faster, slower, deeper, what he thinks about - until he finishes or stops. Every move she may open the door;
// what she makes of it is hers.
import type { Ctx, GameState, ModApi } from "@tc/core";
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
export const ALONE_DO = "base/alone-do";
const A = content.body.alone;
const K = content.body.his;
const S = A.steps;

const fitOf = (state: GameState) => K.fitBase + bs(state).husband.stretch * K.fitPerStretch;
/** His toys: what is in the drawer, and what is still in the bag he has not given her. */
const myToys = (state: GameState) => {
  const b = bs(state);
  const mine = new Set([...b.toys, ...(b.bag ?? []).filter((x) => x.kind === "toy").map((x) => x.id)]);
  return content.day.shop.toys.filter((t) => mine.has(t.id)).sort((x, y) => x.size - y.size);
};
/** The biggest toy of his that he can take himself. */
const toyFor = (state: GameState) => {
  const fit = fitOf(state);
  return [...myToys(state)].reverse().find((t) => t.size <= fit + K.tooBig) ?? null;
};
/** The scene is going on: started or moved on by the very last move. Any other move has ended it. */
export const aloneNow = (state: GameState) => {
  const al = bs(state).alone;
  return al && al.turn === state.turn ? al : null;
};
const THOUGHTS = ["plain", "pathetic", "femdom", "netorare"] as const;

/** Time passes for whatever part of the day it is. */
const spend = (ctx: Ctx, minutes: number) => (ctx.state.time.phase === "prep" ? passPrep(ctx, minutes) : passNight(ctx, minutes));

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
      if (aloneNow(state) || !A.rooms.includes(at) || state.where[WIFE] === at || b.husband.spentDay === state.time.day || b.caught || b.night?.sex) return [];
      if (phase === "prep" ? !b.day || !!b.day.busy || b.day.left <= A.minutes : phase !== "night" || !b.night) return [];
      // locked up, his hand has nothing to do
      return [...(b.husband.caged ? [] : [{ type: ALONE, payload: { do: "hand" } }]), ...(toyFor(state) ? [{ type: ALONE, payload: { do: "toy" } }] : [])];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const toy = action.payload!.do === "toy" ? toyFor(ctx.state) : null;
      b.alone = { do: toy ? "toy" : "hand", ...(toy ? { toy: toy.id } : {}), his: clamp(himArousal(ctx.state) * S.startShare), turns: 0, turn: ctx.state.turn, room: ctx.state.where[HUSBAND]! };
      if (toy) b.husband.stretch = clamp(b.husband.stretch + K.practice + Math.max(0, toy.size - fitOf(ctx.state)) * content.body.stretchPerCm);
      ctx.log(toy ? "log.alone.start.toy" : "log.alone.start.hand", toy ? { toy: `toy.${toy.id}` } : undefined);
      show(ctx);
    },
  });

  api.actions.register({
    id: ALONE_DO,
    labelKey: "action.alone_do",
    describe: (a) => ({ key: `action.alone_do.${a.payload!.do}` }),
    enumerate(state) {
      const al = aloneNow(state);
      if (!al) return [];
      const dos: string[] = ["keep", "faster", "slower", ...THOUGHTS.map((t) => `think_${t}`)];
      if (al.do === "toy" && myToys(state).some((t) => t.size > (myToys(state).find((x) => x.id === al.toy)?.size ?? 0))) dos.push("bigger");
      if (al.do === "hand" && toyFor(state)) dos.push("take_toy");
      if (al.his >= S.finishFrom) dos.push("finish");
      dos.push("stop");
      return dos.map((d) => ({ type: ALONE_DO, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const al = b.alone!;
      al.turn = ctx.state.turn;
      const what = action.payload!.do as string;
      if (what === "stop") {
        b.alone = undefined;
        changeHim(ctx, "arousal", 5, "stopped");
        ctx.log("log.alone.stop");
        return;
      }
      let rate = al.do === "toy" ? S.toyRate + bs(ctx.state).husband.stretch * S.perStretch : S.handRate;
      if (what === "faster") rate *= S.faster;
      if (what === "slower") rate *= S.slower;
      if (what === "finish") rate = 100;
      if (what === "bigger" || what === "take_toy") {
        const now = myToys(ctx.state).find((x) => x.id === al.toy)?.size ?? 0;
        const next = what === "take_toy" ? toyFor(ctx.state) : myToys(ctx.state).find((t) => t.size > now);
        if (next) {
          al.do = "toy";
          al.toy = next.id;
          const fit = fitOf(ctx.state);
          // something bigger than he is used to teaches his body more, and hurts a little
          b.husband.stretch = clamp(b.husband.stretch + K.practice + Math.max(0, next.size - fit) * content.body.stretchPerCm);
          if (next.size > fit + K.tooBig) rate *= 0.4;
          ctx.log(what === "take_toy" ? "log.alone.take_toy" : "log.alone.bigger", { toy: `toy.${next.id}` });
        }
      }
      if (what.startsWith("think_")) {
        const kind = what.slice(6) as (typeof THOUGHTS)[number];
        rate *= thoughtRate(ctx, kind);
        al.thought = kind;
        const name = topMan(ctx.state);
        ctx.log(`log.alone.think.${kind}.${ctx.rng.int(1, 3)}`, { name: name ? `@name:${name}` : "" }, ["thought"]);
      }
      al.his = clamp(al.his + rate);
      al.turns += 1;
      spend(ctx, S.minutes);
      if (!bs(ctx.state).alone) return; // the afternoon or the night ran out under him
      if (caught(ctx)) return;
      if (al.his >= 100) return void finish(ctx);
      if (al.turns % 2 === 0) ctx.log(`log.alone.turn.${al.do}.${ctx.rng.int(1, 3)}`);
      show(ctx);
    },
  });

  /** His arousal as it was when he started: it is where the scene starts from. */
  const himArousal = (state: GameState) => bs(state).husband.arousal ?? 0;
  /** The man he would think of: the one she went furthest with that he knows of. */
  const topMan = (state: GameState) => {
    const b = bs(state);
    const p = Object.values(b.patrons).filter((x) => x.memory.tier >= 2).sort((x, y) => y.memory.tier - x.memory.tier || x.id.localeCompare(y.id))[0];
    return p?.name ?? null;
  };
  /** What a thought does for him: what he has lived through makes it stronger. */
  const thoughtRate = (ctx: Ctx, kind: (typeof THOUGHTS)[number]) => {
    const b = bs(ctx.state);
    if (kind === "plain") return S.think.plain;
    if (kind === "pathetic") {
      changeConfidence(ctx, -0.5, "thinking");
      return S.think.pathetic + (b.husband.size < 14 ? 0.2 : 0);
    }
    if (kind === "femdom") return S.think.femdom + Math.min(0.4, b.power / 100 + b.husband.stretch / 100);
    // her with another man: the more he has seen of it, the more it does
    const seen = Object.values(b.patrons).some((p) => p.memory.tier >= 5);
    return S.think.netorare + (seen ? 0.4 : 0) + (b.mode === "open" ? 0.2 : 0);
  };
  /** The pictures of it: his hand or the toy, for the move it is on. */
  const show = (ctx: Ctx) => {
    const al = bs(ctx.state).alone!;
    const toy = al.toy ? content.day.shop.toys.find((t) => t.id === al.toy) : null;
    detail(ctx, toy ? { id: "toy_him", who: HUSBAND, tags: { tsize: String(sizeClass(toy.size)), who: "self" } } : { id: "him_alone", who: HUSBAND });
  };
  /** He is done: it settles him for the day. */
  const finish = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const al = b.alone!;
    b.alone = undefined;
    b.husband.spentDay = ctx.state.time.day;
    ctx.emit("husband:came_touch", { from: "alone" });
    changeHim(ctx, "mood", A.mood, "alone");
    // how it ends, not "a quarter of an hour later he puts it back": the scene has been played move by move
    ctx.log(al.toy ? "log.alone.came.toy" : "log.alone.came.hand", al.toy ? { toy: `toy.${al.toy}` } : undefined);
    ctx.emit("husband:alone", { toy: al.toy ?? "", thought: al.thought ?? "" });
  };
  /** She is in the house and awake: every few minutes she may come looking for him. Returns true when she did. */
  const caught = (ctx: Ctx): boolean => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const al = b.alone!;
    const around = ctx.state.time.phase === "prep" ? b.day?.her?.task !== "away" && !(ctx.state.where[WIFE] ?? "").startsWith("town.") : !b.night?.herAsleep && (ctx.state.where[WIFE] ?? "").startsWith("home.");
    // a slower, longer session gives her more time to come up the stairs
    if (!around || !ctx.rng.chance(S.caughtPerTurn)) return false;
    const toy = al.toy ? content.day.shop.toys.find((t) => t.id === al.toy) ?? null : null;
    b.alone = undefined;
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
        b.husband.spentDay = ctx.state.time.day;
        ctx.emit("husband:came_touch", { from: "alone" });
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
    return true;
  };
  api.events.on("phase:exit", (ctx) => void (bs(ctx.state).alone = undefined));
}
