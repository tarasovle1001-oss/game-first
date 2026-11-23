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
import { clockText, husbandSees } from "./places";
import { passPrep } from "./day";

export const SLEEP = "base/sleep";
export const NIGHT_WAIT = "base/night-wait";
export const WASH = "base/wash";
export const NAP = "base/nap";
export const SEND_WASH = "base/send-wash";
export const WASH_TOGETHER = "base/wash-together";
export const BATH_DO = "base/bath-do";
export const WAKE_HER = "base/wake-her";
const R = content.day.rhythm;
const BATH = "home.bathroom";
/** The minute the night starts at: when the doors closed, which is the usual hour unless he shut early. */
export const nightStart = (state: GameState) => bs(state).nightStart ?? (content.balance.shift.opensAt + content.balance.shift.hours) * 60;

type HimKey = "energy" | "mood" | "arousal";
export const himOf = (state: GameState) => {
  const h = bs(state).husband;
  return { energy: h.energy ?? R.him.start.energy, mood: h.mood ?? R.him.start.mood, arousal: h.arousal ?? R.him.start.arousal };
};
/** The only way his fast state changes: clamps and tells mods. */
export function changeHim(ctx: Ctx, key: HimKey, amount: number, reason: string) {
  const h = bs(ctx.state).husband;
  const before = himOf(ctx.state)[key];
  if (key === "energy" && amount < 0) amount *= R.energyCost;
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

const nightHooks: ((ctx: Ctx) => void)[] = [];
/** Other systems hang things on the night's clock here: called once for every minute that passes. */
export const onNightMinute = (hook: (ctx: Ctx) => void) => void nightHooks.push(hook);
/** The night moves on: sooner or later she is asleep. */
export function passNight(ctx: Ctx, minutes: number) {
  const b = bs(ctx.state);
  const n = b.night;
  if (!n || ctx.state.time.phase !== "night") return;
  // a minute at a time, so that what is timed by the night's clock (her trip upstairs) happens when it should
  for (let i = 0; i < minutes; i++) {
    n.minute = (n.minute ?? 0) + 1;
    ctx.state.time.minute = nightStart(ctx.state) + n.minute;
    for (const hook of nightHooks) hook(ctx);
    if (!bs(ctx.state).night) return;
  }
  if (!n.herAsleep && !n.up && !n.sex && !n.rest && !n.wants && !b.complaint && !b.approach && (n.minute ?? 0) >= R.herBedtime) {
    n.herAsleep = n.minute;
    if (n.scene === "night_awake") n.scene = "sleeping";
    ctx.log("log.night.her_asleep");
  }
}

export function registerRhythm(api: ModApi) {
  api.events.on("game:init", (ctx) => {
    Object.assign(bs(ctx.state).husband, R.him.start);
  });

  // --- the night has a clock -------------------------------------------------------------------
  api.events.on("husband:refused", (ctx) => {
    const n1 = bs(ctx.state).night;
    if (n1) n1.noes = (n1.noes ?? 0) + 1; // what she has said no to tonight colours what she says yes to after
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
    const n0 = bs(ctx.state).night;
    if (n0 && !["dropped", "stopped"].includes(outcome)) n0.had = (n0.had ?? 0) + 1; // for what is said after
    passNight(ctx, outcome === "by_hand" ? R.nightCosts.self : R.nightCosts.ask);
    changeHim(ctx, "energy", -R.him.bed, "bed");
    if (!["dropped", "went_soft", "stopped"].includes(outcome)) {
      const ruined = bs(ctx.state).husband.ruinedTurn === ctx.state.turn;
      changeHim(ctx, "mood", ruined ? 0 : R.him.mood.came, "came");
      // a ruined one is spent and still wanting: it takes the edge off and no more
      changeHim(ctx, "arousal", ruined ? -content.body.his.ruinedRelief : -100, ruined ? "ruined" : "came");
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
    describe: (a) => (a.payload?.until ? { key: "action.wait.until" } : { key: "action.wait.minutes", params: { minutes: a.payload!.minutes as number } }),
    enumerate: (state) => (state.time.phase === "night" && bs(state).night && !bs(state).night!.sex && !bs(state).complaint ? [...R.nightWaits.map((m) => ({ type: NIGHT_WAIT, payload: { minutes: m } as Record<string, string | number> })), { type: NIGHT_WAIT, payload: { until: "event" } as Record<string, string | number> }] : []),
    apply(ctx, a) {
      if (!a.payload?.until) return passNight(ctx, a.payload!.minutes as number);
      // lying awake until something happens: a line he can see, her falling asleep, or the small hours
      const before = ctx.state.log.length;
      const wasAsleep = !!bs(ctx.state).night?.herAsleep;
      for (let i = 0; i < R.nightUntilMax / 5; i++) {
        passNight(ctx, 5);
        const n = bs(ctx.state).night;
        if (!n || n.sex || bs(ctx.state).complaint || bs(ctx.state).approach) break;
        if ((!wasAsleep && n.herAsleep) || ctx.state.log.slice(before).some((e) => !e.tags?.includes("unseen") && !e.tags?.includes("thought"))) break;
      }
    },
  });
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id === HUSBAND && ctx.state.time.phase === "night") passNight(ctx, 1);
  });

  // --- sleep -------------------------------------------------------------------------------------
  // Going to bed is how the night ends. The plain "next" sleeps till the usual hour; this one picks another.
  api.actions.register({
    id: SLEEP,
    labelKey: "action.sleep",
    describe: (a): { key: string; params?: Record<string, string | number> } => (a.payload!.hours ? { key: "action.sleep.hours", params: { hours: a.payload!.hours as number } } : a.payload!.until === "event" ? { key: "action.sleep.event" } : { key: "action.sleep.until", params: { hour: a.payload!.until as number } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.sex || b.complaint) return [];
      // an hour at a time, or until something wakes him: the night goes on while he sleeps, and he may wake to it
      return [{ type: SLEEP, payload: { hours: 1 } as Record<string, string | number> }, { type: SLEEP, payload: { until: "event" } as Record<string, string | number> }, ...R.wake.slice(1).map((h) => ({ type: SLEEP, payload: { until: h } as Record<string, string | number> }))];
    },
    accepts: (state, a) => state.time.phase === "night" && !bs(state).night?.sex && !bs(state).complaint && (a.payload?.hours === 1 || a.payload?.until === "event" || R.wake.includes(a.payload?.until as number)),
    apply(ctx, a) {
      const b = bs(ctx.state);
      if (a.payload!.hours || a.payload!.until === "event") return void sleepSteps(ctx, a.payload!.hours ? 60 : Infinity);
      b.wakeAt = a.payload!.until as number;
      ctx.emit("phase:exit", { phase: "night" });
      ctx.emit("core:setPhase", { phase: "summary", newDay: false });
    },
  });
  /** He sleeps for a while, five minutes at a time: what happens meanwhile happens, and may wake him. */
  const sleepSteps = (ctx: Ctx, minutes: number) => {
    const b = bs(ctx.state);
    const n = b.night!;
    const morning = 1440 + R.wake[0]! * 60;
    if (n.watch) ctx.emit("watch:skip"); // he turns over and sleeps: she finishes without him
    n.himAsleep = true;
    const before = ctx.state.log.length;
    ctx.log("log.sleep.step");
    let slept = 0;
    while (slept < minutes) {
      passNight(ctx, 5);
      slept += 5;
      const now = bs(ctx.state).night;
      if (!now) return;
      now.slept = (now.slept ?? 0) + 5;
      if (ctx.state.time.minute >= morning) break;
      // something he hears or sees wakes him; with everything on screen, so does what he would not have noticed
      const fresh = ctx.state.log.slice(before + 1);
      if (minutes === Infinity && fresh.some((e) => !e.tags?.includes("minor") && (!e.tags?.includes("unseen") || b.viewAll === true) && e.key !== "log.night.her_asleep")) break;
      if (now.sex || bs(ctx.state).complaint || bs(ctx.state).approach) break;
      if (now.watch) break; // she has started something next to him: the player gets to see it, awake or not
    }
    const n2 = bs(ctx.state).night;
    if (n2) n2.himAsleep = false;
    if (ctx.state.time.minute >= morning) {
      // morning: the night is over, he gets up at the usual hour
      ctx.emit("phase:exit", { phase: "night" });
      ctx.emit("core:setPhase", { phase: "summary", newDay: false });
      return;
    }
    if (n2?.watch && !n2.watch.awake) return; // he sleeps on; what is on the screen is for the player
    ctx.log("log.sleep.woke", { time: clockText(ctx.state.time.minute) });
  };
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
      // minutes after midnight they lay down at: closing early buys sleep, a long evening costs it
      const late = nightStart(ctx.state) - 1440;
      const bed = late + (n.minute ?? 0);
      const his = (Math.max(0, wakeMinute(ctx.state) - bed) + (n.slept ?? 0)) / 60; // and the hours he slept on and off before that
      const hers = Math.max(0, R.herWake * 60 - (late + (n.herAsleep ?? n.minute ?? 0))) / 60;
      // a short night is worth less than its hours: the first ones only take the edge off
      const restOf = (h: number) => Math.min(h, R.sleep.fullAfter) * R.sleep.shortShare + Math.max(0, h - R.sleep.fullAfter);
      changeHim(ctx, "energy", Math.round(restOf(his) * R.energyPerHour.him), "sleep");
      changeHeroine(ctx, "energy", Math.round(restOf(hers) * R.energyPerHour.her), "sleep");
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
    const sh = b.shift;
    if (sh?.asleepHim) return; // out cold upstairs: nothing costs him anything, and he sees nothing
    const was = tired(ctx.state);
    changeHim(ctx, "energy", -R.him.shiftPerTick, "shift");
    if (!was && tired(ctx.state)) ctx.log("log.him.tired");
    // nothing left at all, and he stays on his feet anyway: a couple of steps like that and he drops for hours
    // (decided 23.11: at least four, and the hall is hers meanwhile)
    if (sh && himOf(ctx.state).energy <= 0 && !b.night && !b.caught && !b.reaction) {
      sh.dry = (sh.dry ?? 0) + 1;
      if (sh.dry === 1) ctx.log("log.him.dry");
      if (sh.dry >= R.collapse.after) sh.collapse = true;
    } else if (sh) sh.dry = 0;
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
    // in the evening too: she holds the floor while he takes a quarter of an hour for himself upstairs
    if (state.time.phase === "shift") return !!b.shift && !b.night && !b.encounter && !b.ask && !b.approach && !b.complaint && !b.caught && !b.reaction;
    return state.time.phase === "night" && !!b.night && !b.night.sex && !b.complaint;
  };
  const stamp = (state: GameState) => `${state.time.day}:${state.time.phase}`;
  const spend = (ctx: Ctx, minutes: number) => {
    if (ctx.state.time.phase === "prep") passPrep(ctx, minutes);
    else if (ctx.state.time.phase === "shift") ctx.emit("shift:pass", { minutes });
    else passNight(ctx, minutes);
  };
  // An hour on the bed in the middle of the evening: the floor is hers meanwhile.
  api.actions.register({
    id: NAP,
    labelKey: "action.nap",
    enumerate: (state) => (state.time.phase === "shift" && quiet(state) && state.where[HUSBAND] === "home.bedroom" && state.where[WIFE] !== "home.bedroom" && bs(state).husband.napped !== stamp(state) ? [{ type: NAP }] : []),
    apply(ctx) {
      const h = bs(ctx.state).husband;
      h.napped = stamp(ctx.state);
      changeHim(ctx, "energy", R.bath.napEnergy, "nap");
      ctx.log("log.shift.nap");
      spend(ctx, R.bath.napMinutes);
    },
  });
  api.actions.register({
    id: WASH,
    labelKey: "action.wash",
    enumerate: (state) => (quiet(state) && state.where[HUSBAND] === BATH && bs(state).husband.washed !== stamp(state) ? [{ type: WASH }] : []),
    apply(ctx) {
      const h = bs(ctx.state).husband;
      h.washed = stamp(ctx.state);
      h.cumOn = 0;
      changeHim(ctx, "mood", R.bath.washMood, "wash");
      changeHim(ctx, "energy", R.bath.washEnergy, "wash"); // a shower wakes him up a little
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
      // at home only: there is no shower in the middle of the market
      const here = state.where[HUSBAND] === state.where[WIFE] && b.day?.her?.task !== "away" && !(state.where[HUSBAND] ?? "").startsWith("town.");
      return quiet(state) && here && !b.night?.sex && !b.night?.herAsleep && b.sentWash !== stamp(state) ? [{ type: SEND_WASH }] : [];
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
      changeHim(ctx, "energy", R.bath.washEnergy, "bath");
      changeHeroine(ctx, "energy", R.bath.washEnergy, "bath");
      changeHeroine(ctx, "arousal", warm ? 8 : 2, "bath");
      changeHeroine(ctx, "mood", 2, "bath");
      ctx.log(warm ? "log.bath.together.warm" : "log.bath.together");
      ctx.emit("couple:talk", { do: "cuddle", ok: true });
      // they stay under the water a while longer: the scene is on screen now and for the next move, not one move late
      if (b.day?.her?.task === "wash") b.day.her.left = R.bath.washMinutes + 10;
      passPrep(ctx, R.bath.washMinutes);
    },
  });
  // She is asleep: nothing is said to a sleeping woman. He can wake her - and how that goes is up to how she is and how she feels about him.
  api.actions.register({
    id: WAKE_HER,
    labelKey: "action.wake_her",
    enumerate(state) {
      const n = bs(state).night;
      return state.time.phase === "night" && n?.herAsleep !== undefined && !n.sex && state.where[HUSBAND] === state.where[WIFE] ? [{ type: WAKE_HER }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const n = b.night!;
      passNight(ctx, 2);
      if (h.energy < R.wakeHer.tiredEnergy) {
        // too tired to be woken at all
        annoy(ctx, R.wakeHer.annoy / 2, "him");
        ctx.log("log.night.wake.no");
        return;
      }
      n.herAsleep = undefined;
      n.woken = true;
      if (h.marriage.desire >= R.wakeHer.warmDesire && h.marriage.resent < 30) ctx.log("log.night.wake.fine");
      else {
        annoy(ctx, R.wakeHer.annoy, "him");
        changeHeroine(ctx, "mood", R.wakeHer.mood, "woken");
        ctx.log("log.night.wake.cross");
      }
      ctx.emit("her:woken");
    },
  });
  // Under the water together, move by move: his hands with the soap, then closer, if she lets him.
  api.actions.register({
    id: BATH_DO,
    labelKey: "action.bath_do",
    describe: (a) => ({ key: `action.bath_do.${a.payload!.do}` }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || b.washedWith !== state.time.day || b.day?.her?.task !== "wash" || b.day.busy || state.where[HUSBAND] !== BATH || state.where[WIFE] !== BATH) return [];
      const done = b.bathDone?.day === state.time.day ? b.bathDone.list : [];
      return ["soap", "closer", "hers"].filter((d) => !done.includes(d) && (d !== "hers" || done.includes("closer"))).map((d) => ({ type: BATH_DO, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const what = action.payload!.do as string;
      if (b.bathDone?.day !== ctx.state.time.day) b.bathDone = { day: ctx.state.time.day, list: [] };
      b.bathDone.list.push(what);
      const S = R.bath.steps;
      // soap is always welcome; closer and further need her to want him
      const ok = what === "soap" || h.marriage.desire >= (what === "closer" ? S.closerDesire : S.hersDesire);
      if (ok) {
        changeHeroine(ctx, "arousal", what === "soap" ? S.soap : what === "closer" ? S.closer : S.hers, "bath");
        changeHeroine(ctx, "mood", 1, "bath");
        changeHim(ctx, "arousal", what === "soap" ? S.soap : S.closer, "bath");
        if (what === "hers") h.marriage.desire = clamp(h.marriage.desire + 1);
      } else {
        changeHeroine(ctx, "mood", -1, "bath");
        b.bathDone.list.push("closer", "hers"); // she has turned the water off
      }
      ctx.log(`log.bath.do.${what}${ok ? "" : ".no"}`);
      ctx.emit("couple:talk", { do: what === "soap" ? "shoulders" : "fondle_breast", ok });
      if (b.day?.her?.task === "wash") b.day.her.left = Math.max(b.day.her.left, S.minutes + 5);
      passPrep(ctx, S.minutes);
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
