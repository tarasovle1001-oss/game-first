import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Visit } from "../state";
import { addMoney, addReputation } from "./economy";
import { endEncounter, runProposals } from "./encounters";
import { changeHeroine } from "./heroine";
import { generatePatron, pickReturning } from "./patrons";
import { HALL, ticks, TICKS_PER_SHIFT, ticksDone } from "./places";
export { HALL };

export const WAIT = "base/wait";
export const TIP_FORMULA = "base/tip";
/** Fixed waits offered to the player, in minutes. */
export const WAIT_MINUTES = [10, 30, 60];
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

function arrive(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  // reputation 0 -> 40% of the base flow, 50 -> 100%, 100 -> 160%
  const perTick = ((bal.arrivalsPerHour * bal.minutesPerTick) / 60) * (0.4 + (b.reputation / 50) * 0.6);
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
    });
    ctx.state.where[patron.id] = HALL;
    ctx.log(known ? "log.patron.returns" : "log.patron.arrives", { name: `@name:${patron.name}`, type: `patron.type.${patron.type}` });
    ctx.emit("patron:arrived", { id: patron.id, returning: known !== null });
    interrupt(ctx);
  }
}

/** One order per tick, and only while she is on the floor and not busy with someone. */
function serve(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const waiting = sh.visits.filter(wantsOrder).sort((a, c) => c.waited - a.waited || a.served - c.served);
  let servedId: string | null = null;
  const v = waiting[0];
  if (v && !b.encounter && b.heroine.energy > 0) {
    if (b.stock <= 0) {
      if (!sh.stockWarned) {
        sh.stockWarned = true;
        ctx.log("log.out_of_stock");
        interrupt(ctx);
      }
    } else {
      const p = b.patrons[v.patron]!;
      const type = content.patronTypes.find((t) => t.id === p.type)!;
      const bill = ctx.rng.int(type.spend[0], type.spend[1]);
      const tip = Math.max(0, Math.round(ctx.engine.evaluate<TipInput>(TIP_FORMULA, ctx.state, { patron: p.id, bill }).total));
      b.stock -= 1;
      v.served += 1;
      v.waited = 0;
      v.sinceOrder = 0;
      servedId = p.id;
      sh.income += bill;
      sh.tips += tip;
      sh.served += 1;
      b.today.income += bill;
      b.today.tips += tip;
      b.today.served += 1;
      p.memory.served += 1;
      p.memory.tipsTotal += tip;
      addMoney(ctx, bill + tip, "service");
      changeHeroine(ctx, "energy", -bal.energyPerServe, "work");
      ctx.emit("patron:served", { id: p.id, bill, tip });
    }
  }
  for (const x of sh.visits) {
    if (x.patron === servedId) continue;
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

/** Ten minutes of the evening. */
function tick(ctx: Ctx) {
  const sh = bs(ctx.state).shift!;
  sh.tick += 1;
  ctx.state.time.minute = bal.opensAt * 60 + sh.tick * bal.minutesPerTick;
  endEncounter(ctx); // only ends what has run its time
  arrive(ctx);
  runProposals(ctx); // guests try their luck before she gets back to work
  serve(ctx);
  // she is on the floor while there are guests, behind the bar otherwise
  if (!bs(ctx.state).encounter) ctx.state.where[WIFE] = sh.visits.length > 0 ? HALL : "cafe.bar";
  depart(ctx);
  ctx.emit("shift:tick", { tick: sh.tick });
}

export function registerShift(api: ModApi) {
  const clock = content.balance.clock;
  api.events.on("phase:enter", (ctx, e) => {
    const phase = e.payload!.phase as string;
    const b = bs(ctx.state);
    if (phase === "prep") ctx.state.time.minute = clock.prep;
    if (phase === "night") ctx.state.time.minute = clock.night;
    if (phase === "summary") ctx.state.time.minute = clock.summary;
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

  // Waiting is how the evening moves: a fixed stretch, or until something worth a look happens.
  api.actions.register({
    id: WAIT,
    labelKey: "action.wait",
    describe: (action) =>
      action.payload?.until ? { key: "action.wait.until" } : { key: "action.wait.minutes", params: { minutes: action.payload!.minutes as number } },
    enumerate(state) {
      const sh = bs(state).shift;
      if (state.time.phase !== "shift" || !sh || ticksDone(sh)) return [];
      return [...WAIT_MINUTES.map((minutes) => ({ type: WAIT, payload: { minutes } })), { type: WAIT, payload: { until: "event" } }];
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
      const at = state.where[HUSBAND];
      if (!b.shift || b.shift.visits.length === 0 || at !== HALL || state.where[WIFE] !== HALL) return null;
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
