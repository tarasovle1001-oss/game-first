import { fameOf } from "./rhythm";
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron, Visit } from "../state";
import { addMoney, addReputation } from "./economy";
import { advanceEncounter, endEncounter, runProposals, warmGuests } from "./encounters";
import { changeHeroine } from "./heroine";
import { generatePatron, pickReturning } from "./patrons";
import { clockText, HALL, husbandSees, inTown, nextPhase, ticks, TICKS_PER_SHIFT, ticksDone } from "./places";
export { HALL };

import { changeHim, tired, wakeMinute } from "./rhythm";
export const WAIT = "base/wait";
export const TIP_FORMULA = "base/tip";
/** Fixed waits offered to the player, in minutes: ordinary work, and while something is going on in front of him. */
export const WAIT_MINUTES = [5, 15, 60];
export const WAIT_MINUTES_CLOSE = [1, 5, 15];
export const SERVE = "base/serve";
export const WORK = "base/work";
export const DOORS = "base/doors";
export const OPEN_EARLY = "base/open-early";
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
/** Somebody is standing in front of him waiting for an answer: who, as one string. A wait of any length stops when this changes. */
const waitingOnHim = (state: GameState): string => {
  const b = bs(state);
  const g = b.shift?.group;
  return [b.ask ? `ask:${b.ask.patron}:${b.ask.act}` : "", b.approach ? `her:${b.approach.kind}` : "", b.deal ? `deal:${b.deal.patron}` : "", g?.pending !== undefined ? "door" : "", g?.wants !== undefined ? `tray:${g.wants}` : "", b.caught ? "caught" : ""].filter(Boolean).join("|");
};
export const interrupt = (ctx: Ctx) => {
  const sh = bs(ctx.state).shift;
  if (sh) sh.interrupt = true;
};

const wantsOrder = (v: Visit) => !v.group && v.out === undefined && !(v.at?.startsWith("hotel.") && (v.roomOrders ?? 0) >= content.balance.hotel.roomOrders) && (v.served === 0 || v.sinceOrder >= ORDER_EVERY);

/** Where a guest's seat is tonight: the hall, or another room he has taken his drink to. */
export const seatOf = (v: Visit) => v.at ?? HALL;
/** Guests at tables in the hall: the ones the seats are counted for. */
export const hallVisits = (visits: Visit[]) => visits.filter((v) => !v.group); // a man in the sauna or upstairs still has his table
/** She goes into another room with the guests there, for a while: the hall mode runs in that room meanwhile. */
export function attendTo(ctx: Ctx, loc: string, minutes: number, why: string, patron?: string) {
  const sh = bs(ctx.state).shift;
  if (!sh) return;
  const until = sh.tick + Math.max(1, Math.round(minutes));
  sh.attend = { loc, until, why, ...(patron ? { patron } : {}) };
  sh.awayUntil = Math.max(sh.awayUntil ?? 0, until);
  sh.wifeFreeAt = Math.max(sh.wifeFreeAt ?? 0, until);
  ctx.state.where[WIFE] = loc;
  interrupt(ctx);
  ctx.emit("attend:started", { loc, why, ...(patron ? { patron } : {}) });
}
/** She comes back out of that room. */
export function endAttend(ctx: Ctx) {
  const sh = bs(ctx.state).shift;
  if (!sh?.attend) return;
  const was = sh.attend;
  sh.attend = undefined;
  sh.awayUntil = Math.min(sh.awayUntil ?? 0, sh.tick);
  sh.wifeFreeAt = Math.min(sh.wifeFreeAt ?? 0, sh.tick);
  if (ctx.state.where[WIFE] === was.loc) ctx.state.where[WIFE] = hallVisits(sh.visits).length > 0 ? HALL : "cafe.bar";
  ctx.emit("attend:ended", { loc: was.loc, why: was.why });
}

/** Sits a guest down at a table and starts his visit. */
export function seat(ctx: Ctx, patron: Patron, known: boolean, opts: { at?: string; stay?: number; group?: boolean; quiet?: boolean } = {}) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  patron.memory.visits += 1;
  patron.memory.lastDay = ctx.state.time.day;
  if (!patron.regular && patron.memory.visits >= bal.regularAfterVisits) {
    patron.regular = true;
    ctx.log("log.patron.regular", { name: `@name:${patron.name}` });
  }
  sh.visits.push({
    ...(opts.at ? { at: opts.at } : {}),
    ...(opts.group ? { group: true } : {}),
    patron: patron.id,
    stay: opts.stay ?? ctx.rng.int(ticks(bal.stayMinutes[0]), ticks(bal.stayMinutes[1])),
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
  ctx.state.where[patron.id] = opts.at ?? HALL;
  // "nods to her like an old acquaintance" is for a man who has been here before, not for a lodger coming down on his first evening
  if (!opts.quiet) ctx.log(known && patron.memory.visits > 1 ? "log.patron.returns" : known ? "log.patron.down" : "log.patron.arrives", { name: `@name:${patron.name}`, type: `patron.type.${patron.type}` });
  if (patron.rich && !opts.quiet) ctx.log("log.patron.rich", { name: `@name:${patron.name}` });
  ctx.emit("patron:arrived", { id: patron.id, returning: known });
  interrupt(ctx);
}

function arrive(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  if (sh.doors || sh.tick >= bal.hours * 60 + (sh.early ?? 0) - bal.lastArrivalBefore) return; // the door is shut, or it is too late in the evening to start one
  // how the place is run decides how many come: slowly up to "decent", fast from there to "the place to be"
  const [f0, f50, f100] = bal.flow;
  // how many come is how well the place is known (regulars, time, a fifth of the service); the service itself decides tips and who comes back
  const pop = fameOf(ctx.state);
  const share = pop <= 50 ? f0 + ((f50 - f0) * pop) / 50 : f50 + ((f100 - f50) * (pop - 50)) / 50;
  const perTick = ((bal.arrivalsPerHour * bal.minutesPerTick) / 60) * share * (1 + (b.day?.arrivals ?? 0) + b.gossip * content.secrecy.gossip.arrivals);
  // Guests come at a pace, not by a fresh roll every minute: the same number over an evening, but neither "one guest all night"
  // nor "six at the door at once" (playtest 26). The gap to the next one is drawn around the average.
  sh.arriveAcc = (sh.arriveAcc ?? 0.6 + ctx.rng.float() * 0.4) + perTick; // the doors open: the first one is not long in coming
  let count = 0;
  while (sh.arriveAcc >= (sh.arriveNext ?? 1)) {
    sh.arriveAcc -= sh.arriveNext ?? 1;
    sh.arriveNext = bal.arrivalGap[0] + ctx.rng.float() * (bal.arrivalGap[1] - bal.arrivalGap[0]);
    count++;
  }
  // a place nobody knows yet does not have a full hall at once: the next ones come when a table frees up
  const atOnce = Math.round(bal.atOnce[0] + (Math.min(100, pop) / 100) * (bal.atOnce[1] - bal.atOnce[0]));
  for (let i = 0; i < count; i++) {
    if (hallVisits(sh.visits).length >= Math.min(atOnce, bal.seats) && hallVisits(sh.visits).length < bal.seats) {
      sh.arriveAcc += (sh.arriveNext ?? 1) * 0.5; // he comes back a little later
      continue;
    }
    if (hallVisits(sh.visits).length >= bal.seats) {
      sh.turnedAway += 1;
      b.today.turnedAway += 1;
      continue;
    }
    const present = sh.visits.map((v) => v.patron);
    // a well-run place is one people come back to
    const known = ctx.rng.chance(bal.returnChance * (bal.returnByService[0] + (b.reputation / 100) * bal.returnByService[1])) ? pickReturning(ctx, present) : null;
    const patron = known ?? generatePatron(ctx);
    if (!known) {
      // why he came: for the food, or for what is said about the place. The talk of the town decides the share,
      // and when there is enough of it some of those who only wanted supper stop coming.
      const A = content.secrecy.gossip.aim;
      patron.aim = ctx.rng.chance(Math.min(A.max, A.base + b.gossip * A.perGossip)) ? "her" : "food";
      if (patron.aim === "food" && ctx.rng.chance(Math.max(0, b.gossip - A.avoidFrom) * A.avoidPerGossip)) {
        delete b.patrons[patron.id];
        continue;
      }
      patron.memory.interest = clamp(patron.memory.interest + (patron.aim === "her" ? A.herInterest : A.foodInterest));
    }
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
  const bill = Math.round(ctx.rng.int(type.spend[0], type.spend[1]) * (p.rich ? content.balance.rich.bill : 1) * (ctx.state.where[HUSBAND] === "cafe.kitchen" ? 1 + bal.husbandInKitchenBill : 1) * (1 + b.billBonus) * (bal.billFactor - ((bal.billFactor - bal.billFactorFull) * Math.max(0, b.reputation - 50)) / 50));
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
      // his drink goes to where he is sitting: the sauna, his room upstairs. She stays a moment, longer if she likes him
      const there = ctx.state.where[v.patron];
      if (there && there !== HALL && there !== "cafe.bar" && !v.away && !sh.attend) {
        const p = b.patrons[v.patron];
        const linger = ctx.rng.int(bal.attend.linger[0], bal.attend.linger[1]) + Math.max(0, p?.memory.affinity ?? 0) * bal.attend.perAffinity;
        attendTo(ctx, there, bal.serveMinutes + linger, "serve", v.patron);
        if (there.startsWith("hotel.")) v.roomOrders = (v.roomOrders ?? 0) + 1;
        ctx.log(`log.attend.serve.${there.startsWith("hotel.") ? "room" : there === "cafe.sauna" ? "sauna" : "other"}`, { name: `@name:${p?.name ?? ""}`, room: `loc.${there}` }, husbandSees(ctx.state, HALL) || husbandSees(ctx.state, there) || b.mode === "open" ? undefined : ["unseen"]);
      }
    }
  }
  for (const x of sh.visits) {
    if (x.patron === served) continue;
    x.sinceOrder += 1;
    if (wantsOrder(x)) x.waited += 1;
  }
}

export function leave(ctx: Ctx, v: Visit, reason: "done" | "ignored" | "closing") {
  const b = bs(ctx.state);
  const p = b.patrons[v.patron]!;
  if (reason === "ignored") {
    addReputation(ctx, -content.balance.service.ignored);
    p.memory.affinity = clamp(p.memory.affinity - 5, -100, 100);
    ctx.log("log.patron.walks_out", { name: `@name:${p.name}` });
    interrupt(ctx);
  } else if (v.served > 0) {
    // a place that is already run well has less to gain from one more guest served
    addReputation(ctx, content.balance.service.served * Math.min(1, (100 - b.reputation) / (100 - content.balance.service.taperFrom)));
  }
  delete ctx.state.where[p.id];
  ctx.emit("patron:left", { id: p.id, reason, served: v.served });
}

function depart(ctx: Ctx) {
  const sh = bs(ctx.state).shift!;
  const staying: Visit[] = [];
  for (const v of sh.visits) {
    v.stay -= 1;
    // his time in the sauna or upstairs is up: back to the hall (unless he is busy with her there)
    const enc0 = bs(ctx.state).encounter;
    const inScene = enc0 && (enc0.patron === v.patron || enc0.men?.some((m) => m.patron === v.patron));
    if (v.at && !v.group && v.atUntil !== undefined && sh.tick >= v.atUntil && !inScene && sh.attend?.patron !== v.patron) {
      v.at = undefined;
      v.atUntil = undefined;
      if (!v.away && v.out === undefined) ctx.state.where[v.patron] = HALL;
    }
    // a lodger who went out comes back in
    if (v.out !== undefined && sh.tick >= v.out) {
      v.out = undefined;
      ctx.state.where[v.patron] = seatOf(v);
      ctx.log("log.lodger.back_in", { name: `@name:${bs(ctx.state).patrons[v.patron]?.name ?? ""}` }, ["minor"]);
    }
    const enc = bs(ctx.state).encounter;
    if (enc && (enc.patron === v.patron || enc.men?.some((m) => m.patron === v.patron))) {
      v.stay = Math.max(1, v.stay); // nobody walks out in the middle of things
      staying.push(v);
    } else if (v.waited >= MAX_WAIT) leave(ctx, v, "ignored");
    else if (v.stay <= 0) leave(ctx, v, "done");
    else staying.push(v);
  }
  sh.visits = staying;
  if (sh.moment && !staying.some((v) => v.patron === sh.moment!.patron)) sh.moment = null;
}

/** Time passes in the evening while he is busy with himself upstairs (a shower, a nap): she minds the floor, as when he waits. */
export function passShift(ctx: Ctx, minutes: number) {
  const sh = bs(ctx.state).shift;
  if (!sh) return;
  for (let i = 0, n = ticks(minutes); i < n && !ticksDone(sh); i++) tick(ctx);
}

/** Time passes while nobody is minding the floor: the guests wait, then the evening catches up. */
export function runUnattended(ctx: Ctx, minutes: number) {
  const sh = bs(ctx.state).shift;
  if (!sh) return;
  const n = ticks(minutes);
  for (const v of sh.visits) v.waited += n;
  for (let i = 0; i < n && !ticksDone(sh); i++) tick(ctx);
}

/** A woman with a taste for it pours herself one at the bar now and then: more on a bad evening, more once she has started. */
function herOwnGlass(ctx: Ctx) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const Al = content.balance.heroine.ownGlass;
  if (!h.latents.likes_drink || b.encounter || b.night || h.drunk >= Al.upTo || b.stock <= 0) return;
  const bad = h.mood < Al.badMood || (h.annoyance ?? 0) >= Al.annoyed;
  const p = Al.base + (bad ? Al.bad : 0) + (h.drunk >= content.consent.alcohol.selfFrom ? Al.started : 0);
  if (!ctx.rng.chance(p)) return;
  changeHeroine(ctx, "drunk", Al.drunk, "her own glass");
  b.stock -= 1;
  const seen = husbandSees(ctx.state, ctx.state.where[WIFE] ?? HALL) || b.mode === "open";
  ctx.log(bad ? "log.drink.herself.bad" : "log.drink.herself", undefined, seen ? undefined : ["unseen"]);
}

/**
 * Two o'clock is not a wall. With nothing going on the last guests are seen out and that is that; a scene that began
 * before closing is not cut off: everybody else leaves, the two of them finish (in his room, if he has one upstairs).
 */
function closingTime(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const end = TICKS_PER_SHIFT + Math.round((sh.early ?? 0) / bal.minutesPerTick);
  if (sh.tick < end) return;
  const enc = b.encounter;
  if (sh.tick === end) {
    // everybody not in it is out of the door
    for (const v of sh.visits) if (v.patron !== enc?.patron && !enc?.men?.some((m) => m.patron === v.patron) && !Object.values(b.lodgers).some((l) => l.patron === v.patron)) v.stay = 0;
    if (enc) {
      const seen = husbandSees(ctx.state, enc.loc) || b.mode === "open";
      const name = `@name:${b.patrons[enc.patron]?.name ?? ""}`;
      // a man with a room upstairs: she takes it there, behind his own door
      const own = Object.entries(b.lodgers).find(([, l]) => l.patron === enc.patron)?.[0];
      if (own && enc.loc !== own && !(enc.men?.length) && ctx.state.where[HUSBAND] !== own) {
        enc.loc = own;
        ctx.state.where[WIFE] = own;
        ctx.state.where[enc.patron] = own;
        ctx.log("log.closing.upstairs", { name, room: `loc.${own}` }, seen ? undefined : ["unseen"]);
      } else ctx.log("log.closing.holds", { name }, seen ? undefined : ["unseen"]);
    }
  }
  sh.hold = !!b.encounter;
}

/** One minute of the evening. Slow things (moods, sobering up, timed arrivals) still run every ten: event "shift:tick". */
function tick(ctx: Ctx) {
  const sh = bs(ctx.state).shift!;
  sh.tick += 1;
  // one clock for the whole game: a stage reads it and moves it on, never back (a scene may have run it a few minutes ahead)
  ctx.state.time.minute = Math.max(ctx.state.time.minute, bal.opensAt * 60 - (sh.early ?? 0) + sh.tick * bal.minutesPerTick);
  closingTime(ctx);
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
  } else if (sh.quietUntil === undefined && !sh.quietDone && hq.heroine.energy <= 0 && !hq.encounter && !hq.night && !hq.approach && !hq.ask && (sh.awayUntil ?? 0) <= sh.tick && sh.tick < TICKS_PER_SHIFT - 30) {
    sh.quietDone = true; // once an evening: after that she stays on her feet and says no to what takes strength
    sh.quietUntil = sh.tick + content.day.rhythm.quiet.minutes;
    sh.awayUntil = sh.quietUntil;
    ctx.state.where[WIFE] = "home.bedroom";
    ctx.log("log.quiet.her.shift");
  }
  // something else took her out of that room (her husband called her, a guest in the hall, a dare): the visit there is over
  if (sh.attend && ctx.state.where[WIFE] !== sh.attend.loc && !hq.night?.sex) {
    sh.attend = undefined;
  }
  // her time in the other room is up: she comes back out, unless something is still going on in there
  if (sh.attend && sh.tick >= sh.attend.until) {
    const enc = hq.encounter;
    if (enc && enc.loc === sh.attend.loc) {
      sh.attend.until = sh.tick + 1;
      sh.awayUntil = Math.max(sh.awayUntil ?? 0, sh.attend.until);
    } else endAttend(ctx);
  }
  // she is on the floor while there are guests, behind the bar otherwise
  if (!bs(ctx.state).encounter && !bs(ctx.state).night && !bs(ctx.state).approach && !bs(ctx.state).ask && (sh.awayUntil ?? 0) <= sh.tick) ctx.state.where[WIFE] = sh.visits.length > 0 ? HALL : "cafe.bar";
  depart(ctx);
  ctx.emit("shift:minute", { minute: sh.tick });
  if (sh.tick % TEN === 0) {
    warmGuests(ctx);
    herOwnGlass(ctx);
    ctx.emit("shift:tick", { tick: sh.tick / TEN });
  }
  ctx.flush(); // every minute is fully resolved before the next one, however long the wait
  // closing time: the clock stops here until he locks up, so nothing from the last minutes may hang on the screen
  if (ticksDone(sh)) {
    sh.fin = undefined;
    sh.show = undefined;
    sh.moment = null;
  }
}
const TEN = ticks(10);

export function registerShift(api: ModApi) {
  // The morning sums are a line in the log, not a stage to click through: once everything that happens "over breakfast"
  // has been counted, the new day simply begins (same events in the same order as leaving the stage by hand).
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "summary") return;
      ctx.emit("phase:exit", { phase: "summary" });
      ctx.emit("day:end", { day: ctx.state.time.day });
      ctx.emit("core:setPhase", { phase: "prep", newDay: true });
    },
    -1000,
  );
  api.events.on("shift:pass", (ctx, e) => passShift(ctx, e.payload!.minutes as number));
  const clock = content.balance.clock;
  api.events.on("phase:enter", (ctx, e) => {
    const phase = e.payload!.phase as string;
    const b = bs(ctx.state);
    // the morning is the same moment the night ended at (the day number has just gone up by one): he wakes when he wakes, the clock does not jump back to it
    if (phase === "prep") ctx.state.time.minute = ctx.state.time.day > 1 ? Math.max(wakeMinute(ctx.state), ctx.state.time.minute - 1440) : clock.prep;
    if (phase === "night") b.nightStart = Math.max(ctx.state.time.minute, (bal.opensAt + 1) * 60); // the clock simply goes on from closing time
    if (phase === "summary") ctx.state.time.minute = Math.max(ctx.state.time.minute, 1440 + wakeMinute(ctx.state)); // the sums are done over breakfast: the next morning, on the same clock the night ran on
    if (phase === "shift") {
      const early = b.openEarly?.day === ctx.state.time.day ? b.openEarly.minutes : 0;
      // the afternoon ran past opening time (a scene, a late walk back): the evening starts from where the clock is, not from 17:00 again
      const late = Math.max(0, ctx.state.time.minute - (bal.opensAt * 60 - early));
      ctx.state.time.minute = Math.max(ctx.state.time.minute, bal.opensAt * 60 - early);
      b.shift = { ...(early ? { early } : {}), tick: late, visits: [], income: 0, tips: 0, served: 0, turnedAway: 0, moment: null, interrupt: false, stockWarned: false };
      ctx.state.where[WIFE] = "cafe.bar";
      ctx.emit("shift:start");
    }
    if (phase !== "summary") ctx.log("log.phase", { day: ctx.state.time.day, phase: `base.phase.${phase}` });
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
    if (!b.shift || !p || b.shift.visits.some((v) => v.patron === p.id) || hallVisits(b.shift.visits).length >= bal.seats) return;
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
      const before = waitingOnHim(ctx.state);
      for (let i = 0; i < max && !ticksDone(sh); i++) {
        tick(ctx);
        if (untilEvent && sh.interrupt) break;
        // "an hour" is an hour only while nobody needs his word: a company at the door, her question, a guest with money stop it
        const now = waitingOnHim(ctx.state);
        if (now && now !== before) break;
      }
    },
  });

  // Walking from room to room takes a minute of the evening.
  // Out to town and back takes as long as it does in the afternoon; the evening goes on without him.
  api.events.on("entity:moved", (ctx, e) => {
    const sh = bs(ctx.state).shift;
    if (e.payload!.id !== HUSBAND || ctx.state.time.phase !== "shift" || !sh || ticksDone(sh) || bs(ctx.state).night?.sex) return;
    const from = e.payload!.from as string;
    const to = e.payload!.to as string;
    const H = content.day.herDay;
    const minutes = inTown(from) !== inTown(to) ? H.walkToTown : inTown(to) ? H.walkInTown : 1;
    if (inTown(from) !== inTown(to)) {
      if (inTown(to)) sh.awaySince = sh.tick;
      else sh.awaySince = undefined;
      ctx.log(inTown(to) ? "log.away.leaves" : "log.away.back");
    }
    for (let i = 0; i < minutes && !ticksDone(sh); i++) tick(ctx);
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

  // "Work the floor": one button for an evening of ordinary work. He takes the tables she cannot get to,
  // tidies in between, and now and then does one of the small things a bar is made of.
  const Wk = bal.work;
  api.actions.register({
    id: WORK,
    labelKey: "action.work",
    describe: (a) => (a.payload?.until ? { key: "action.work.until" } : { key: "action.work.minutes", params: { minutes: a.payload!.minutes as number } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      const at = state.where[HUSBAND];
      if (state.time.phase !== "shift" || !sh || ticksDone(sh) || b.caught || b.night?.sex || (at !== HALL && at !== "cafe.bar") || tired(state)) return [];
      return [...Wk.minutes.map((m) => ({ type: WORK, payload: { minutes: m } as Record<string, string | number> })), { type: WORK, payload: { until: "event" } as Record<string, string | number> }];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sh = b.shift!;
      const untilEvent = action.payload?.until === "event";
      const max = untilEvent ? TICKS_PER_SHIFT : ticks(action.payload!.minutes as number);
      sh.interrupt = false;
      const before = waitingOnHim(ctx.state);
      let busy = 0;
      for (let i = 0; i < max && !ticksDone(sh) && !tired(ctx.state); i++) {
        if (busy > 0) busy -= 1;
        else {
          const waiting = sh.visits.filter((v) => wantsOrder(v) && v.waited >= Wk.takeAfter).sort((a, c) => c.waited - a.waited || a.patron.localeCompare(c.patron))[0];
          if (waiting && b.stock > 0) {
            serveOne(ctx, waiting, "husband");
            busy = bal.husbandServeMinutes;
          } else {
            b.clean = Math.min(100, b.clean + Wk.cleanPerMinute);
            if ((sh.tick + 1) % Wk.choreEvery === 0) ctx.log(`log.work.chore.${ctx.rng.int(1, Wk.chores)}`);
          }
        }
        changeHim(ctx, "energy", -Wk.energyPerHour / 60, "work");
        tick(ctx);
        if (untilEvent && sh.interrupt) break;
        const now = waitingOnHim(ctx.state);
        if (now && now !== before) break;
      }
    },
  });

  // Open right now: from midday he can unlock the doors whenever he likes, and the evening starts at once.
  api.actions.register({
    id: OPEN_EARLY,
    labelKey: "action.open_early",
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || !b.day || b.day.busy || b.day.left <= 0 || b.night?.sex || b.caught) return [];
      if (state.time.minute < bal.openNowFrom * 60 || inTown(state.where[HUSBAND])) return [];
      return [{ type: OPEN_EARLY }];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const minutes = b.day!.left;
      b.openEarly = { day: ctx.state.time.day, minutes };
      b.day!.left = 0;
      b.day!.opening = true;
      ctx.log("log.open_early", { time: clockText(ctx.state.time.minute) });
      nextPhase(ctx);
    },
  });
  // The door: he can stop letting new people in, and with the hall empty he can call it a night.
  api.actions.register({
    id: DOORS,
    labelKey: "action.doors",
    describe: (a) => ({ key: `action.doors.${a.payload!.do}` }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      if (state.time.phase !== "shift" || !sh || ticksDone(sh) || b.caught || b.night?.sex) return [];
      const empty = sh.visits.length === 0 && !sh.group && !b.encounter;
      return [{ type: DOORS, payload: { do: sh.doors ? "open" : "shut" } }, ...(sh.doors && empty ? [{ type: DOORS, payload: { do: "close" } }] : [])];
    },
    apply(ctx, action) {
      const sh = bs(ctx.state).shift!;
      const what = action.payload!.do as string;
      if (what === "close") {
        sh.closed = true;
        ctx.log("log.doors.close");
        return;
      }
      sh.doors = what === "shut";
      ctx.log(`log.doors.${what}`);
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
    for (const v of b.shift?.visits ?? []) {
      if (!b.patrons[v.patron]) return `visit of unknown patron ${v.patron}`;
      if (!s.where[v.patron] && v.out === undefined) return `patron ${v.patron} is visiting but is nowhere`;
      if (s.where[v.patron] && v.out !== undefined) return `patron ${v.patron} is out of the building and on the map`;
    }
    for (const id of Object.keys(s.where)) if (/^p\d+$/.test(id) && !present.has(id)) return `patron ${id} is placed but not visiting`;
    if (b.shift && hallVisits(b.shift.visits).length > content.balance.shift.seats) return "more guests than seats";
    return null;
  });
}
