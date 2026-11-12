import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron, Visit } from "../state";
import { addMoney, addReputation } from "./economy";
import { advanceEncounter, endEncounter, runProposals, warmGuests } from "./encounters";
import { changeHeroine } from "./heroine";
import { generatePatron, pickReturning } from "./patrons";
import { HALL, husbandSees, ticks, TICKS_PER_SHIFT, ticksDone } from "./places";
export { HALL };

import { tired, wakeMinute } from "./rhythm";
export const WAIT = "base/wait";
export const TIP_FORMULA = "base/tip";
/** Fixed waits offered to the player, in minutes: ordinary work, and while something is going on in front of him. */
export const WAIT_MINUTES = [5, 15, 60];
export const WAIT_MINUTES_CLOSE = [1, 5, 15];
export const SERVE = "base/serve";
/** Something he is watching minute by minute: a guest with her in his sight, or a moment he has to answer. */
export const watching = (state: GameState) => {
  const b = bs(state);
  return b.reaction !== null || (b.encounter !== null && husbandSees(state, b.encounter.loc));
};
const bal = content.balance.shift;
const ORDER_EVERY = ticks(bal.orderEveryMinutes);
const MAX_WAIT = ticks(bal.maxWaitMinutes);

export interface TipInput {
  patron: string;
  bill: number;
}

export const visitOf = (state: GameState, patronId: string): Visit | undefined =>
  bs(state).shift?.visits.find((v) => v.patron === patronId);

/** Marks the current tick as eventful: "wait until something happens" stops here. */
export const interrupt = (ctx: Ctx) => {
  const sh = bs(ctx.state).shift;
  if (sh) sh.interrupt = true;
};

const wantsOrder = (v: Visit) => v.served === 0 || v.sinceOrder >= ORDER_EVERY;

/** Sits a guest down at a table and starts his visit. */
function seat(ctx: Ctx, patron: Patron, known: boolean) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  patron.memory.visits += 1;
  patron.memory.lastDay = ctx.state.time.day;
  if (!patron.regular && patron.memory.visits >= bal.regularAfterVisits) {
    patron.regular = true;
    ctx.log("log.patron.regular", { name: `@name:${patron.name}` });
  }
  sh.visits.push({
    patron: patron.id,
    stay: ctx.rng.int(ticks(bal.stayMinutes[0]), ticks(bal.stayMinutes[1])),
    served: 0,
    waited: 0,
    sinceOrder: 0,
    // a man who has been somewhere with her does not start from small talk again
    tier: Math.max(-1, patron.memory.tier - 1),
    blocked: false,
    pressure: 0,
    retry: null,
    rounds: 0,
  });
  ctx.state.where[patron.id] = HALL;
  ctx.log(known ? "log.patron.returns" : "log.patron.arrives", { name: `@name:${patron.name}`, type: `patron.type.${patron.type}` });
  ctx.emit("patron:arrived", { id: patron.id, returning: known });
  interrupt(ctx);
}

function arrive(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  if (sh.tick >= bal.hours * 60 - bal.lastArrivalBefore) return; // too late in the evening to start one
  // reputation 0 -> 40% of the base flow, 50 -> 100%, 100 -> 160%
  const perTick = ((bal.arrivalsPerHour * bal.minutesPerTick) / 60) * (0.4 + (b.reputation / 50) * 0.6) * (1 + (b.day?.arrivals ?? 0) + b.gossip * content.secrecy.gossip.arrivals);
  const count = Math.floor(perTick) + (ctx.rng.chance(perTick % 1) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    if (sh.visits.length >= bal.seats) {
      sh.turnedAway += 1;
      b.today.turnedAway += 1;
      continue;
    }
    const present = sh.visits.map((v) => v.patron);
    const known = ctx.rng.chance(bal.returnChance) ? pickReturning(ctx, present) : null;
    const patron = known ?? generatePatron(ctx);
    seat(ctx, patron, known !== null);
  }
}

/** One order goes out: the bill, the tip (nobody tips the husband for her smile), the stock. */
function serveOne(ctx: Ctx, v: Visit, taker: "wife" | "husband"): boolean {
  const b = bs(ctx.state);
  const sh = b.shift!;
  if (b.stock <= 0) {
    if (!sh.stockWarned) {
      sh.stockWarned = true;
      ctx.log("log.out_of_stock");
      interrupt(ctx);
    }
    return false;
  }
  const p = b.patrons[v.patron]!;
  const type = content.patronTypes.find((t) => t.id === p.type)!;
  const bill = Math.round(ctx.rng.int(type.spend[0], type.spend[1]) * (ctx.state.where[HUSBAND] === "cafe.kitchen" ? 1 + bal.husbandInKitchenBill : 1) * (1 + b.billBonus) * bal.billFactor);
  const tip = taker === "husband" ? 0 : Math.max(0, Math.round(ctx.engine.evaluate<TipInput>(TIP_FORMULA, ctx.state, { patron: p.id, bill }).total));
  b.stock -= 1;
  b.clean = Math.max(0, b.clean - content.day.dirtPerServed);
  v.served += 1;
  v.waited = 0;
  v.sinceOrder = 0;
  sh.income += bill;
  sh.tips += tip;
  sh.served += 1;
  b.today.income += bill;
  b.today.tips += tip;
  b.today.served += 1;
  p.memory.served += 1;
  p.memory.tipsTotal += tip;
  addMoney(ctx, bill + tip, "service");
  if (taker === "wife") changeHeroine(ctx, "energy", -bal.energyPerServe, "work");
  ctx.emit("patron:served", { id: p.id, bill, tip, by: taker });
  return true;
}

/** She takes the order of whoever has waited longest, when her hands are free and she is on the floor. */
function serve(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  let served: string | null = null;
  if (!b.encounter && !b.night && b.heroine.energy > 0 && sh.tick >= (sh.wifeFreeAt ?? 0)) {
    const v = sh.visits.filter(wantsOrder).sort((a, c) => c.waited - a.waited || a.served - c.served)[0];
    if (v && serveOne(ctx, v, "wife")) {
      served = v.patron;
      sh.wifeFreeAt = sh.tick + bal.serveMinutes;
    }
  }
  for (const x of sh.visits) {
    if (x.patron === served) continue;
    x.sinceOrder += 1;
    if (wantsOrder(x)) x.waited += 1;
  }
}

function leave(ctx: Ctx, v: Visit, reason: "done" | "ignored" | "closing") {
  const b = bs(ctx.state);
  const p = b.patrons[v.patron]!;
  if (reason === "ignored") {
    addReputation(ctx, -1);
    p.memory.affinity = clamp(p.memory.affinity - 5, -100, 100);
    ctx.log("log.patron.walks_out", { name: `@name:${p.name}` });
    interrupt(ctx);
  } else if (v.served > 0) {
    addReputation(ctx, 0.25);
  }
  delete ctx.state.where[p.id];
  ctx.emit("patron:left", { id: p.id, reason, served: v.served });
}

function depart(ctx: Ctx) {
  const sh = bs(ctx.state).shift!;
  const staying: Visit[] = [];
  for (const v of sh.visits) {
    v.stay -= 1;
    if (bs(ctx.state).encounter?.patron === v.patron) {
      v.stay = Math.max(1, v.stay); // nobody walks out in the middle of things
      staying.push(v);
    } else if (v.waited >= MAX_WAIT) leave(ctx, v, "ignored");
    else if (v.stay <= 0) leave(ctx, v, "done");
    else staying.push(v);
  }
  sh.visits = staying;
  if (sh.moment && !staying.some((v) => v.patron === sh.moment!.patron)) sh.moment = null;
}

/** Time passes while nobody is minding the floor: the guests wait, then the evening catches up. */
export function runUnattended(ctx: Ctx, minutes: number) {
  const sh = bs(ctx.state).shift;
  if (!sh) return;
  const n = ticks(minutes);
  for (const v of sh.visits) v.waited += n;
  for (let i = 0; i < n && !ticksDone(sh); i++) tick(ctx);
}

/** One minute of the evening. Slow things (moods, sobering up, timed arrivals) still run every ten: event "shift:tick". */
function tick(ctx: Ctx) {
  const sh = bs(ctx.state).shift!;
  sh.tick += 1;
  ctx.state.time.minute = bal.opensAt * 60 + sh.tick * bal.minutesPerTick;
  advanceEncounter(ctx);
  arrive(ctx);
  runProposals(ctx); // guests try their luck before she gets back to work
  serve(ctx);
  // run dry in the middle of the evening, she goes up to lie down for an hour and the floor is his
  const hq = bs(ctx.state);
  if (sh.quietUntil !== undefined && sh.tick >= sh.quietUntil) {
    sh.quietUntil = undefined;
    changeHeroine(ctx, "energy", content.day.rhythm.quiet.her, "quiet hour");
    ctx.log("log.quiet.her.back");
  } else if (sh.quietUntil === undefined && hq.heroine.energy <= 0 && !hq.encounter && !hq.night && !hq.approach && !hq.ask && (sh.awayUntil ?? 0) <= sh.tick && sh.tick < TICKS_PER_SHIFT - 30) {
    sh.quietUntil = sh.tick + content.day.rhythm.quiet.minutes;
    sh.awayUntil = sh.quietUntil;
    ctx.state.where[WIFE] = "home.bedroom";
    ctx.log("log.quiet.her.shift");
  }
  // she is on the floor while there are guests, behind the bar otherwise
  if (!bs(ctx.state).encounter && !bs(ctx.state).night && !bs(ctx.state).approach && !bs(ctx.state).ask && (sh.awayUntil ?? 0) <= sh.tick) ctx.state.where[WIFE] = sh.visits.length > 0 ? HALL : "cafe.bar";
  depart(ctx);
  ctx.emit("shift:minute", { minute: sh.tick });
  if (sh.tick % TEN === 0) {
    warmGuests(ctx);
    ctx.emit("shift:tick", { tick: sh.tick / TEN });
  }
  ctx.flush(); // every minute is fully resolved before the next one, however long the wait
}
const TEN = ticks(10);

export function registerShift(api: ModApi) {
  const clock = content.balance.clock;
  api.events.on("phase:enter", (ctx, e) => {
    const phase = e.payload!.phase as string;
    const b = bs(ctx.state);
    if (phase === "prep") ctx.state.time.minute = ctx.state.time.day > 1 ? wakeMinute(ctx.state) : clock.prep;
    if (phase === "night") ctx.state.time.minute = 1440;
    if (phase === "summary") ctx.state.time.minute = wakeMinute(ctx.state); // the sums are done over breakfast
    if (phase === "shift") {
      ctx.state.time.minute = bal.opensAt * 60;
      b.shift = { tick: 0, visits: [], income: 0, tips: 0, served: 0, turnedAway: 0, moment: null, interrupt: false, stockWarned: false };
      ctx.state.where[WIFE] = "cafe.bar";
      ctx.emit("shift:start");
    }
    ctx.log("log.phase", { day: ctx.state.time.day, phase: `base.phase.${phase}` });
    if (phase === "night") ctx.state.where[WIFE] = "home.bedroom";
  }, 100);

  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase !== "shift") return;
    const b = bs(ctx.state);
    const sh = b.shift!;
    endEncounter(ctx, true);
    for (const v of sh.visits) leave(ctx, v, "closing");
    ctx.log("log.shift.end", { served: sh.served, income: sh.income, tips: sh.tips });
    ctx.emit("shift:end", { served: sh.served, income: sh.income, tips: sh.tips });
    b.shift = null;
  });

  // Someone she is expecting walks in (the phone system asks for it).
  api.events.on("base:invite-arrives", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.id as string];
    if (!b.shift || !p || b.shift.visits.some((v) => v.patron === p.id) || b.shift.visits.length >= bal.seats) return;
    seat(ctx, p, true);
  });

  // Waiting is how the evening moves: a fixed stretch, or until something worth a look happens.
  api.actions.register({
    id: WAIT,
    labelKey: "action.wait",
    describe: (action) =>
      action.payload?.until ? { key: "action.wait.until" } : { key: "action.wait.minutes", params: { minutes: action.payload!.minutes as number } },
    enumerate(state) {
      const sh = bs(state).shift;
      if (state.time.phase !== "shift" || !sh || ticksDone(sh)) return [];
      if (bs(state).caught || bs(state).night?.sex) return []; // he has to decide first; or he is busy with her
      const minutes = watching(state) ? WAIT_MINUTES_CLOSE : WAIT_MINUTES;
      return [...minutes.map((m) => ({ type: WAIT, payload: { minutes: m } })), { type: WAIT, payload: { until: "event" } }];
    },
    // any whole number of minutes is a valid wait; the buttons are only the usual ones
    accepts: (state, a) => {
      const sh = bs(state).shift;
      if (state.time.phase !== "shift" || !sh || ticksDone(sh) || bs(state).caught || bs(state).night?.sex) return false;
      return a.payload?.until === "event" || (Number.isInteger(a.payload?.minutes) && (a.payload!.minutes as number) > 0);
    },
    apply(ctx, action) {
      const sh = bs(ctx.state).shift!;
      const untilEvent = action.payload?.until === "event";
      const max = untilEvent ? TICKS_PER_SHIFT : ticks(action.payload!.minutes as number);
      sh.interrupt = false;
      for (let i = 0; i < max && !ticksDone(sh); i++) {
        tick(ctx);
        if (untilEvent && sh.interrupt) break;
      }
    },
  });

  // Walking from room to room takes a minute of the evening.
  api.events.on("entity:moved", (ctx, e) => {
    const sh = bs(ctx.state).shift;
    if (e.payload!.id === HUSBAND && ctx.state.time.phase === "shift" && sh && !ticksDone(sh) && !bs(ctx.state).night?.sex) tick(ctx);
  });

  // He takes a table himself: the order goes out, it costs him a few minutes, and nobody tips him.
  api.actions.register({
    id: SERVE,
    labelKey: "action.serve",
    describe: (a) => ({ key: "action.serve.one", params: { name: `@name:${a.payload!.name}`, minutes: a.payload!.waited as number } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      if (state.time.phase !== "shift" || !sh || ticksDone(sh) || b.caught || b.night?.sex || state.where[HUSBAND] !== HALL || b.stock <= 0 || tired(state)) return [];
      return sh.visits
        .filter(wantsOrder)
        .sort((a, c) => c.waited - a.waited || a.patron.localeCompare(c.patron))
        .slice(0, 2)
        .map((v) => ({ type: SERVE, payload: { patron: v.patron, name: b.patrons[v.patron]!.name, waited: v.waited } }));
    },
    accepts: (state, a) => {
      const sh = bs(state).shift;
      return state.time.phase === "shift" && !!sh && !ticksDone(sh) && state.where[HUSBAND] === HALL && !bs(state).caught && sh.visits.some((v) => v.patron === a.payload?.patron && wantsOrder(v));
    },
    apply(ctx, action) {
      const sh = bs(ctx.state).shift!;
      const v = sh.visits.find((x) => x.patron === action.payload!.patron)!;
      serveOne(ctx, v, "husband");
      for (let i = 0; i < bal.husbandServeMinutes && !ticksDone(sh); i++) tick(ctx);
    },
  });

  // --- tip: a small formula with named rows, visible in the debug panel ---
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.generosity",
    labelKey: "factor.tip.generosity",
    order: 0,
    eval: (state, { patron, bill }) => (bill * bs(state).patrons[patron]!.traits.generosity) / 400,
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.mood",
    labelKey: "factor.tip.mood",
    order: 10,
    eval: (state, { bill }) => (bill * (bs(state).heroine.mood - 50)) / 500,
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.bar",
    labelKey: "factor.tip.bar",
    order: 15,
    eval: (state, { bill }) => (state.where[HUSBAND] === "cafe.bar" ? (bill * bal.husbandAtBarTip) / 4 : null),
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.interest",
    labelKey: "factor.tip.interest",
    order: 20,
    eval: (state, { patron, bill }) => (bill * bs(state).patrons[patron]!.memory.interest) / 600,
  });

  // She is working the floor in front of the viewer.
  api.scenes.register({
    id: "base.serving",
    priority: 0,
    match(state) {
      const b = bs(state);
      if (!b.shift || b.shift.visits.length === 0 || !husbandSees(state, HALL) || state.where[WIFE] !== HALL) return null;
      return {
        type: "serving",
        location: HALL,
        participants: [
          { id: WIFE, role: "wife" },
          { id: b.shift.visits[0]!.patron, role: "patron" },
        ],
      };
    },
  });

  api.invariants.add("shift-consistent", (s) => {
    const b = bs(s);
    if ((s.time.phase === "shift") !== (b.shift !== null)) return `shift state does not match phase "${s.time.phase}"`;
    const present = new Set(b.shift?.visits.map((v) => v.patron) ?? []);
    for (const id of present) {
      if (!b.patrons[id]) return `visit of unknown patron ${id}`;
      if (!s.where[id]) return `patron ${id} is visiting but is nowhere`;
    }
    for (const id of Object.keys(s.where)) if (/^p\d+$/.test(id) && !present.has(id)) return `patron ${id} is placed but not visiting`;
    if (b.shift && b.shift.visits.length > content.balance.shift.seats) return "more guests than seats";
    return null;
  });
}
