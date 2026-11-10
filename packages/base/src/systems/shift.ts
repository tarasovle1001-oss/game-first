import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, WIFE } from "../state";
import type { Visit } from "../state";
import { addMoney, addReputation } from "./economy";
import { changeHeroine } from "./heroine";
import { generatePatron, pickReturning } from "./patrons";
import { ticksDone } from "./places";

export const WAIT = "base/wait";
export const TIP_FORMULA = "base/tip";
export const HALL = "cafe.hall";
const MAX_WAIT = 3; // ticks a patron sits unserved before walking out

export interface TipInput {
  patron: string;
  bill: number;
}

export const visitOf = (state: GameState, patronId: string): Visit | undefined =>
  bs(state).shift?.visits.find((v) => v.patron === patronId);

function arrive(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const bal = content.balance.shift;
  // reputation 0 -> 40% of the base flow, 50 -> 100%, 100 -> 160%
  const expected = bal.arrivalsBase * (0.4 + (b.reputation / 50) * 0.6);
  const count = Math.floor(expected) + (ctx.rng.chance(expected % 1) ? 1 : 0);
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
    sh.visits.push({ patron: patron.id, stay: ctx.rng.int(bal.stayTicks[0], bal.stayTicks[1]), served: 0, waited: 0 });
    ctx.state.where[patron.id] = HALL;
    ctx.log(known ? "log.patron.returns" : "log.patron.arrives", { name: `@name:${patron.name}`, type: `patron.type.${patron.type}` });
    ctx.emit("patron:arrived", { id: patron.id, returning: known !== null });
  }
}

function serve(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const h = b.heroine;
  const capacity = h.energy <= 0 ? 0 : h.energy < 30 ? 1 : 2;
  // longest-waiting first, then those with the fewest orders
  const queue = [...sh.visits].sort((a, c) => c.waited - a.waited || a.served - c.served).slice(0, capacity);
  const servedNow = new Set<string>();
  for (const v of queue) {
    if (b.stock <= 0) break;
    const p = b.patrons[v.patron]!;
    const type = content.patronTypes.find((t) => t.id === p.type)!;
    const bill = ctx.rng.int(type.spend[0], type.spend[1]);
    const tip = Math.max(0, Math.round(ctx.engine.evaluate<TipInput>(TIP_FORMULA, ctx.state, { patron: p.id, bill }).total));
    b.stock -= 1;
    v.served += 1;
    v.waited = 0;
    servedNow.add(p.id);
    sh.income += bill;
    sh.tips += tip;
    sh.served += 1;
    b.today.income += bill;
    b.today.tips += tip;
    b.today.served += 1;
    p.memory.served += 1;
    p.memory.tipsTotal += tip;
    addMoney(ctx, bill + tip, "service");
    changeHeroine(ctx, "energy", -content.balance.shift.energyPerServe, "work");
    ctx.emit("patron:served", { id: p.id, bill, tip });
  }
  for (const v of sh.visits) if (!servedNow.has(v.patron)) v.waited += 1;
  if (queue.length > 0 && b.stock <= 0) ctx.log("log.out_of_stock");
}

function leave(ctx: Ctx, v: Visit, reason: "done" | "ignored" | "closing") {
  const b = bs(ctx.state);
  const p = b.patrons[v.patron]!;
  if (reason === "ignored") {
    addReputation(ctx, -1);
    p.memory.affinity = clamp(p.memory.affinity - 5, -100, 100);
    ctx.log("log.patron.walks_out", { name: `@name:${p.name}` });
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
    if (v.waited >= MAX_WAIT) leave(ctx, v, "ignored");
    else if (v.stay <= 0) leave(ctx, v, "done");
    else staying.push(v);
  }
  sh.visits = staying;
}

export function registerShift(api: ModApi) {
  api.events.on("phase:enter", (ctx, e) => {
    const phase = e.payload!.phase as string;
    const b = bs(ctx.state);
    ctx.log("log.phase", { day: ctx.state.time.day, phase: `base.phase.${phase}` });
    if (phase === "shift") {
      b.shift = { tick: 0, visits: [], income: 0, tips: 0, served: 0, turnedAway: 0 };
      ctx.state.where[WIFE] = "cafe.bar";
      ctx.emit("shift:start");
    }
    if (phase === "night") ctx.state.where[WIFE] = "home.bedroom";
  });

  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase !== "shift") return;
    const b = bs(ctx.state);
    const sh = b.shift!;
    for (const v of sh.visits) leave(ctx, v, "closing");
    ctx.log("log.shift.end", { served: sh.served, income: sh.income, tips: sh.tips });
    ctx.emit("shift:end", { served: sh.served, income: sh.income, tips: sh.tips });
    b.shift = null;
  });

  api.actions.register({
    id: WAIT,
    labelKey: "action.wait",
    enumerate: (state) => (state.time.phase === "shift" && !ticksDone(bs(state).shift) ? [{ type: WAIT }] : []),
    apply(ctx) {
      const sh = bs(ctx.state).shift!;
      sh.tick += 1;
      arrive(ctx);
      serve(ctx);
      // she is on the floor while there are guests, behind the bar otherwise
      ctx.state.where[WIFE] = sh.visits.length > 0 ? HALL : "cafe.bar";
      ctx.emit("shift:tick", { tick: sh.tick });
      // guests leave after everyone had a chance to act on this tick
      ctx.emit("base:shift-depart");
    },
  });
  api.events.on("base:shift-depart", (ctx) => {
    if (bs(ctx.state).shift) depart(ctx);
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
