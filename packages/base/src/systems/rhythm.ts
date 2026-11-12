// The day around the clock: the night has its own minutes and ends in sleep, the morning starts when he gets up.
// He has a state of his own (energy, mood, arousal), money sits on both their minds, and there is a bathroom.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { annoy } from "./annoy";
import { CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { wash } from "./look";
import { husbandSees } from "./places";
import { passPrep } from "./day";

export const SLEEP = "base/sleep";
export const NIGHT_WAIT = "base/night-wait";
export const WASH = "base/wash";
export const SEND_WASH = "base/send-wash";
export const WASH_TOGETHER = "base/wash-together";
const R = content.day.rhythm;
const BATH = "home.bathroom";
const MIDNIGHT = 1440;

type HimKey = "energy" | "mood" | "arousal";
export const himOf = (state: GameState) => {
  const h = bs(state).husband;
  return { energy: h.energy ?? R.him.start.energy, mood: h.mood ?? R.him.start.mood, arousal: h.arousal ?? R.him.start.arousal };
};
/** The only way his fast state changes: clamps and tells mods. */
export function changeHim(ctx: Ctx, key: HimKey, amount: number, reason: string) {
  const h = bs(ctx.state).husband;
  const before = himOf(ctx.state)[key];
  h[key] = clamp(before + amount);
  if (h[key] !== before) ctx.emit("husband:changed", { key, amount: h[key]! - before, reason });
}
export const tired = (state: GameState) => himOf(state).energy < R.him.tiredBelow;
/** Whether he has it in him to start this piece of work. */
export const canDo = (state: GameState, energy: number | undefined) => !energy || energy < 0 || himOf(state).energy >= energy;
/** How well his words land today: a sour man charms nobody. */
export const talkScale = (state: GameState) => {
  const m = himOf(state).mood;
  return m < 30 ? R.him.mood.talkLow : m >= 70 ? R.him.mood.talkHigh : 1;
};
/** Minutes of the day he gets up at tomorrow. */
export const wakeMinute = (state: GameState) => (bs(state).wakeAt ?? R.wake[0]!) * 60;
const Wd = content.day.world;
/** 0 = Sunday. The game starts on a Monday. */
export const weekdayOf = (state: GameState) => state.time.day % 7;
/** How well the place is known, 0..100: regulars, time, and how it is run. */
export const fameOf = (state: GameState) => {
  const b = bs(state);
  return clamp(Object.values(b.patrons).filter((p) => p.regular).length * Wd.famePerRegular + b.daysPlayed * Wd.famePerDay + b.reputation * 0.2);
};
export const fameTier = (state: GameState) => Wd.fameTiers.filter(([from]) => fameOf(state) >= from).at(-1)![1];
/** How heavy the money is today: 0 nothing, 1 it nags, 2 it keeps them awake. */
export const worryOf = (state: GameState): 0 | 1 | 2 => {
  const b = bs(state);
  // the loan they started with is a fact of life; what weighs is falling behind on it
  const over = b.debt - content.balance.start.debt;
  if (b.loan.missed > 0 || over >= R.worry.hardDebt) return 2;
  return over >= R.worry.debtFrom || b.money < R.worry.cashBelow ? 1 : 0;
};

/** The night moves on: sooner or later she is asleep. */
export function passNight(ctx: Ctx, minutes: number) {
  const b = bs(ctx.state);
  const n = b.night;
  if (!n || ctx.state.time.phase !== "night") return;
  n.minute = (n.minute ?? 0) + minutes;
  ctx.state.time.minute = MIDNIGHT + n.minute;
  if (!n.herAsleep && !n.sex && !n.wants && !b.complaint && !b.approach && n.minute >= R.herBedtime) {
    n.herAsleep = n.minute;
    ctx.log("log.night.her_asleep");
  }
}

export function registerRhythm(api: ModApi) {
  api.events.on("game:init", (ctx) => {
    Object.assign(bs(ctx.state).husband, R.him.start);
  });

  // --- the night has a clock -------------------------------------------------------------------
  api.events.on("husband:refused", (ctx) => {
    passNight(ctx, R.nightCosts.ask);
    changeHim(ctx, "mood", R.him.mood.refused, "refused");
  });
  api.events.on("bed:started", (ctx) => {
    const n = bs(ctx.state).night;
    passNight(ctx, R.nightCosts.ask);
    // she was asleep: he has what he wanted, and she has something to say about being woken
    if (n?.herAsleep && ctx.state.time.phase === "night") {
      n.herAsleep = undefined;
      n.woken = true;
      annoy(ctx, R.wakeHer.annoy, "him");
      changeHeroine(ctx, "mood", R.wakeHer.mood, "woken");
      ctx.log("log.night.woke_her");
      ctx.emit("her:woken");
    }
  });
  api.events.on("bed:turn", (ctx) => passNight(ctx, R.nightCosts.turn));
  api.events.on("couple:talk", (ctx) => passNight(ctx, R.nightCosts.talk));
  api.events.on("bed:ended", (ctx, e) => {
    const { outcome } = e.payload as { outcome: string };
    passNight(ctx, outcome === "by_hand" ? R.nightCosts.self : R.nightCosts.ask);
    changeHim(ctx, "energy", -R.him.bed, "bed");
    if (!["dropped", "went_soft", "stopped"].includes(outcome)) {
      changeHim(ctx, "mood", R.him.mood.came, "came");
      changeHim(ctx, "arousal", -100, "came");
    }
  });
  api.events.on("husband:came_touch", (ctx) => changeHim(ctx, "arousal", -100, "came"));
  // waking her for it is its own row in what she answers
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.asleep",
    labelKey: "factor.consent.asleep",
    order: 58,
    eval: (state, { partner }) => (partner === HUSBAND && state.time.phase === "night" && bs(state).night?.herAsleep ? R.wakeHer.consent : null),
  });
  api.actions.register({
    id: NIGHT_WAIT,
    labelKey: "action.wait",
    describe: (a) => ({ key: "action.wait.minutes", params: { minutes: a.payload!.minutes as number } }),
    enumerate: (state) => (state.time.phase === "night" && bs(state).night && !bs(state).night!.sex && !bs(state).complaint ? R.nightWaits.map((m) => ({ type: NIGHT_WAIT, payload: { minutes: m } })) : []),
    apply: (ctx, a) => passNight(ctx, a.payload!.minutes as number),
  });
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id === HUSBAND && ctx.state.time.phase === "night") passNight(ctx, 1);
  });

  // --- sleep -------------------------------------------------------------------------------------
  // Going to bed is how the night ends. The plain "next" sleeps till the usual hour; this one picks another.
  api.actions.register({
    id: SLEEP,
    labelKey: "action.sleep",
    describe: (a) => ({ key: "action.sleep.until", params: { hour: a.payload!.until as number } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.sex || b.complaint) return [];
      return R.wake.slice(1).map((h) => ({ type: SLEEP, payload: { until: h } }));
    },
    accepts: (state, a) => state.time.phase === "night" && !bs(state).night?.sex && !bs(state).complaint && R.wake.includes(a.payload?.until as number),
    apply(ctx, a) {
      bs(ctx.state).wakeAt = a.payload!.until as number;
      ctx.emit("phase:exit", { phase: "night" });
      ctx.emit("core:setPhase", { phase: "summary", newDay: false });
    },
  });
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      const b = bs(ctx.state);
      if (e.payload!.phase === "night" && b.night) {
        b.night.minute = 0;
        b.wakeAt = undefined;
      }
    },
    -5,
  );
  // what the hours in bed give back, to each of them by their own count
  api.events.on(
    "phase:exit",
    (ctx, e) => {
      const b = bs(ctx.state);
      const n = b.night;
      if (e.payload!.phase !== "night" || !n) return;
      const bed = n.minute ?? 0;
      const his = Math.max(0, wakeMinute(ctx.state) - bed) / 60;
      const hers = Math.max(0, R.herWake * 60 - (n.herAsleep ?? bed)) / 60;
      changeHim(ctx, "energy", Math.round(his * R.energyPerHour.him), "sleep");
      changeHeroine(ctx, "energy", Math.round(hers * R.energyPerHour.her), "sleep");
      // he lay down wanting and got nothing: it is still there in the morning
      if (himOf(ctx.state).arousal >= 40) changeHim(ctx, "arousal", R.him.arousal.carried, "unspent");
      b.slept = { him: Math.round(his * 10) / 10, her: Math.round(hers * 10) / 10 };
    },
    30, // before the bedroom state is cleared
  );

  // --- the morning ---------------------------------------------------------------------------------
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep") return;
      const b = bs(ctx.state);
      const him = himOf(ctx.state);
      if (ctx.state.time.day > 1) {
        changeHim(ctx, "mood", Math.round((R.him.moodRest - him.mood) * R.him.settle), "morning");
        changeHim(ctx, "arousal", Math.round((R.him.arousalRest - him.arousal) * R.him.settle), "morning");
        if (b.slept) ctx.log("log.morning.slept", { hours: b.slept.him, hour: (b.wakeAt ?? R.wake[0]!) as number });
        if ((b.wakeAt ?? R.wake[0]!) > R.herWake) ctx.log("log.morning.she_is_up");
        if (him.energy < 40) {
          changeHim(ctx, "mood", R.him.tiredMood, "tired");
          ctx.log("log.morning.tired");
        }
      }
      // money on the mind: his, and hers a little less
      const w = worryOf(ctx.state);
      if (w > 0 && ctx.state.time.day > 1) {
        const m = w === 2 ? R.worry.hardMood : R.worry.mood;
        changeHim(ctx, "mood", m, "money");
        changeHeroine(ctx, "mood", Math.round(m * R.worry.herShare), "money");
        ctx.log(`log.morning.worry.${w}`, { mood: m });
      }
      // the day of the week and the sky decide how many come tonight; a known place draws more
      const sky = ctx.rng.weighted(Wd.weather.map((w) => ({ item: w, weight: w.weight })));
      b.weather = sky.id;
      if (b.day) b.day.arrivals += Wd.weekdays[weekdayOf(ctx.state)]! + sky.arrivals + fameOf(ctx.state) * Wd.fameArrivals;
      if (ctx.state.time.day > 1) ctx.log("log.morning.day", { weekday: `weekday.${weekdayOf(ctx.state)}`, weather: `weather.${sky.id}` });
      // his face at breakfast is part of her morning
      changeHeroine(ctx, "mood", Math.round((himOf(ctx.state).mood - R.him.moodRest) * R.him.mood.toHer), "his mood");
    },
    -20,
  );

  // --- what the day takes out of him ---------------------------------------------------------------
  api.events.on("day:did", (ctx, e) => {
    const a = content.day.activities.find((x) => x.id === (e.payload!.do as string));
    if (a?.energy) changeHim(ctx, "energy", -a.energy * ((e.payload!.share as number | undefined) ?? 1), a.id);
    if (a?.id === "date") changeHim(ctx, "mood", 4, "date");
    if (a?.gym) changeHim(ctx, "mood", 3, "gym");
  });
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const was = tired(ctx.state);
    changeHim(ctx, "energy", -R.him.shiftPerTick, "shift");
    if (!was && tired(ctx.state)) ctx.log("log.him.tired");
    // what he watches does not leave him cold
    if (b.reaction || b.caught) changeHim(ctx, "arousal", R.him.arousal.watch, "watching");
    else if ((b.heroine.bare ?? "none") !== "none" && husbandSees(ctx.state, ctx.state.where[WIFE] ?? "")) changeHim(ctx, "arousal", R.him.arousal.bare, "her bare");
  });
  api.events.on("patron:served", (ctx, e) => {
    if (e.payload!.by === HUSBAND) changeHim(ctx, "energy", -R.him.serve, "serving");
  });
  api.events.on("couple:talk", (ctx, e) => {
    const o = content.manners.talk.options.find((x) => x.id === (e.payload!.do as string));
    if (o?.group === "touch" && e.payload!.ok) changeHim(ctx, "arousal", R.him.arousal.touch, "touch");
  });

  // --- the bathroom --------------------------------------------------------------------------------
  const quiet = (state: GameState) => {
    const b = bs(state);
    if (state.time.phase === "prep") return !!b.day && !b.day.busy && b.day.left > R.bath.washMinutes;
    return state.time.phase === "night" && !!b.night && !b.night.sex && !b.complaint;
  };
  const stamp = (state: GameState) => `${state.time.day}:${state.time.phase}`;
  const spend = (ctx: Ctx, minutes: number) => {
    if (ctx.state.time.phase === "prep") passPrep(ctx, minutes);
    else passNight(ctx, minutes);
  };
  api.actions.register({
    id: WASH,
    labelKey: "action.wash",
    enumerate: (state) => (quiet(state) && state.where[HUSBAND] === BATH && bs(state).husband.washed !== stamp(state) ? [{ type: WASH }] : []),
    apply(ctx) {
      const h = bs(ctx.state).husband;
      h.washed = stamp(ctx.state);
      h.cumOn = 0;
      changeHim(ctx, "mood", R.bath.washMood, "wash");
      ctx.log("log.bath.wash");
      spend(ctx, R.bath.washMinutes);
    },
  });
  // "Go and wash." He does not know what there is to wash off; she does.
  api.actions.register({
    id: SEND_WASH,
    labelKey: "action.send_wash",
    enumerate(state) {
      const b = bs(state);
      const here = state.where[HUSBAND] === state.where[WIFE] && b.day?.her?.task !== "away";
      return quiet(state) && here && !b.night?.herAsleep && b.sentWash !== stamp(state) ? [{ type: SEND_WASH }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.sentWash = stamp(ctx.state);
      const marks = Object.keys(h.cum ?? {}).length + Object.keys(h.after ?? {}).length;
      wash(ctx);
      if (marks === 0) {
        annoy(ctx, R.bath.sendAnnoy, "him");
        ctx.log("log.bath.send.clean");
      } else ctx.log("log.bath.send");
      if (ctx.state.time.phase === "prep" && b.day) {
        b.day.her = { task: "wash", left: R.bath.sendMinutes };
        ctx.state.where[WIFE] = BATH;
      } else passNight(ctx, R.bath.sendMinutes);
      ctx.emit("bath:sent", { marks });
    },
  });
  // She let him stay: they can wash together.
  api.actions.register({
    id: WASH_TOGETHER,
    labelKey: "action.wash_together",
    enumerate(state) {
      const b = bs(state);
      const ok = state.time.phase === "prep" && b.day?.her?.task === "wash" && !b.day.busy && state.where[HUSBAND] === BATH && state.where[WIFE] === BATH && b.washedWith !== state.time.day;
      return ok ? [{ type: WASH_TOGETHER }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      b.washedWith = ctx.state.time.day;
      b.husband.washed = stamp(ctx.state);
      b.husband.cumOn = 0;
      const warm = b.heroine.marriage.desire >= 50;
      changeHim(ctx, "arousal", warm ? 12 : 6, "bath");
      changeHim(ctx, "mood", 3, "bath");
      changeHeroine(ctx, "arousal", warm ? 8 : 2, "bath");
      changeHeroine(ctx, "mood", 2, "bath");
      ctx.log(warm ? "log.bath.together.warm" : "log.bath.together");
      ctx.emit("couple:talk", { do: "cuddle", ok: true });
      passPrep(ctx, R.bath.washMinutes);
    },
  });
  // Walking in on her while she washes: welcome or not, by what she feels for him just now.
  api.events.on("entity:moved", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.id !== HUSBAND || e.payload!.to !== BATH || ctx.state.time.phase !== "prep" || b.day?.her?.task !== "wash" || b.walkedIn === ctx.state.time.day) return;
    b.walkedIn = ctx.state.time.day;
    const m = b.heroine.marriage;
    const W = R.bath.walkIn;
    if (m.desire - m.resent >= W.margin) {
      changeHim(ctx, "arousal", W.arousal, "bath");
      changeHeroine(ctx, "arousal", Math.round(W.arousal / 2), "bath");
      ctx.log("log.bath.walkin.ok");
      ctx.emit("bath:walkin", { ok: true });
    } else {
      annoy(ctx, W.annoy, "him");
      ctx.state.where[HUSBAND] = e.payload!.from as string;
      ctx.log("log.bath.walkin.out");
      ctx.emit("bath:walkin", { ok: false });
    }
  });

  api.invariants.add("rhythm", (s) => {
    const him = himOf(s);
    for (const [k, v] of Object.entries(him)) if (!(v >= 0 && v <= 100)) return `husband ${k} out of range: ${v}`;
    const n = bs(s).night;
    if (n && (n.minute ?? 0) < 0) return "night clock is negative";
    return null;
  });
}
