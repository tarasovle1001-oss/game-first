// The afternoon before opening: a budget of minutes, things to spend it on, the town with its shops,
// one-off upgrades for the cafe, and what she does with her own money while he is not looking.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, resolveBody } from "./body";
import { addMoney, addReputation } from "./economy";
import { actById, CONSENT_FORMULA, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

export const DAY_DO = "base/day";
export const BUY = "base/buy";
export const PREP_WAIT = "base/prep-wait";
export const DAY_STOP = "base/day-stop";
const D = content.day;
const bal = content.balance;
const opening = bal.shift.opensAt * 60;
const canPay = (state: GameState, cost: number) => bs(state).money >= cost || bs(state).debt < bal.debtLimit;
const has = (state: GameState, id: string) => bs(state).upgrades.includes(id);
export const hasUpgrade = has;

const inTown = (loc: string | undefined) => !!loc?.startsWith("town.");
/** Where an activity can be done: "cafe" = anywhere at home, otherwise one place in town. */
const isAt = (state: GameState, at: string | undefined) => {
  const here = state.where[HUSBAND];
  return !at || (at === "cafe" ? !inTown(here) : here === at);
};
type Activity = (typeof D.activities)[number];

/** What an afternoon activity does once the time for it has been put in. */
function finish(ctx: Ctx, a: Activity) {
  const b = bs(ctx.state);
  b.day!.done.push(a.id);
  b.day!.busy = undefined;
  if (a.money) addMoney(ctx, a.money, a.id);
  if (a.clean) b.clean = clamp(b.clean + a.clean);
  if (a.arrivals) b.day!.arrivals += a.arrivals;
  if (a.stock) b.stock += a.stock;
  for (const [k, v] of Object.entries(a.her ?? {})) {
    if (k === "desire" || k === "resent") b.heroine.marriage[k] = clamp(b.heroine.marriage[k] + v);
    else changeHeroine(ctx, k as "mood", v, a.id);
  }
  if (a.gym) gym(ctx, a.gym === "together");
  else if (a.gossip) {
    // what he hears depends on how much there is to hear; hearing it is not the same as knowing
    const G = content.secrecy.gossip;
    const level = b.gossip < G.noticeFrom ? "none" : b.gossip < 40 ? "some" : b.gossip < 70 ? "much" : "all";
    ctx.log(`log.day.ask_around.${level}`);
    if (level !== "none" && b.mode === "hidden") b.suspicion = clamp(b.suspicion + (level === "some" ? 4 : level === "much" ? 9 : 15) * content.secrecy.styleFactor[b.husband.style]);
  } else ctx.log(`log.day.${a.id}`, { money: a.money ?? 0, cost: a.cost ?? 0, stock: b.stock });
  ctx.emit("day:did", { do: a.id });
}

/** What she does with her own afternoon, one thing after another. */
function herNext(ctx: Ctx) {
  const b = bs(ctx.state);
  const day = b.day!;
  if (day.herOut) {
    // out on her own until late in the afternoon. She says where she is going; it is not where she is
    day.her = { task: "away", left: Math.min(day.left, D.herDay.awayMinutes) };
    day.cover = ctx.rng.pick(D.herDay.trips);
    ctx.state.where[WIFE] = "town.far";
    ctx.log("log.her.trip", { where: `loc.${day.cover}` });
    return;
  }
  // once a day she may have an errand of her own in town: the shops, the market, the gym. This one is what it looks like
  if (day.her && !day.tripped && day.left > D.herDay.tripMinutes[1] + 60 && ctx.rng.chance(D.herDay.tripChance)) {
    day.tripped = true;
    const to = ctx.rng.pick(D.herDay.trips);
    day.her = { task: "away", left: ctx.rng.int(D.herDay.tripMinutes[0], D.herDay.tripMinutes[1]) };
    ctx.state.where[WIFE] = to;
    ctx.log("log.her.trip", { where: `loc.${to}` });
    return;
  }
  const options = D.herDay.tasks.filter((t) => t.id !== day.her?.task);
  // the day starts behind the bar, then one thing after another
  const t = day.her ? ctx.rng.pick(options) : D.herDay.tasks.find((x) => x.id === "bar")!;
  day.her = { task: t.id, left: ctx.rng.int(t.minutes[0], t.minutes[1]) };
  ctx.state.where[WIFE] = t.loc;
}
function herDone(ctx: Ctx) {
  const b = bs(ctx.state);
  const day = b.day!;
  const t = D.herDay.tasks.find((x) => x.id === day.her?.task);
  if (day.her?.task === "away") {
    day.herOut = false; // she is back
    ctx.log("log.her.back");
  }
  if (t?.clean) b.clean = clamp(b.clean + t.clean);
  for (const [k, v] of Object.entries(t?.her ?? {})) changeHeroine(ctx, k as "mood", v, t!.id);
  herNext(ctx);
}

/** The afternoon moves a minute at a time: his work gets done, she goes about hers. */
export function passPrep(ctx: Ctx, minutes: number) {
  const b = bs(ctx.state);
  const day = b.day;
  if (!day || ctx.state.time.phase !== "prep") return;
  for (let i = 0; i < minutes && day.left > 0; i++) {
    day.left -= 1;
    ctx.state.time.minute = opening - day.left;
    if (day.busy) {
      day.busy.left -= 1;
      if (day.busy.left <= 0) finish(ctx, D.activities.find((x) => x.id === day.busy!.id)!);
    }
    if (day.her && day.her.task !== "with_you") {
      day.her.left -= 1;
      if (day.her.left <= 0) herDone(ctx);
    } else if (day.her?.task === "with_you" && !day.busy) herNext(ctx);
    if (day.left % 10 === 0) {
      const h = b.heroine;
      h.annoyance = Math.max(0, (h.annoyance ?? 0) - content.manners.talk.annoy.coolPrep);
      ctx.emit("prep:tick", { left: day.left });
    }
  }
}

/** What she buys or does with her own purse, at most one thing a day. */
function herMorning(ctx: Ctx) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const hidden = b.mode !== "open";
  // 1. something to wear, once she is nearly bold enough for it
  const outfit = content.outfits
    .slice()
    .sort((x, y) => x.order - y.order)
    .find((o) => !b.owned.includes(o.id) && h.traits.openness >= o.openness - D.shop.herOutfitMargin);
  if (outfit && b.purse >= outfit.price) {
    b.purse -= outfit.price;
    b.owned.push(outfit.id);
    ctx.log("log.her.buys.outfit", { outfit: `outfit.${outfit.id}` });
    ctx.emit("her:bought", { kind: "outfit", id: outfit.id });
    return;
  }
  // 2. a toy, when her husband is not enough: never much bigger than she can take, always bigger than the last one
  const biggest = Math.max(0, ...D.shop.toys.filter((t) => b.toys.includes(t.id)).map((t) => t.size));
  const fit = fitOf(ctx.state, "vagina");
  const toy = D.shop.toys
    .slice()
    .sort((x, y) => y.size - x.size)
    .find((t) => !b.toys.includes(t.id) && t.size > biggest && t.size <= fit + D.shop.toyStretchAbove && b.purse >= t.price);
  if (toy && (h.marriage.resent >= 20 || h.sizeTaste >= 25 || h.traits.libido >= 65)) {
    b.purse -= toy.price;
    b.toys.push(toy.id);
    ctx.log(hidden ? "log.her.buys.toy.hidden" : "log.her.buys.toy", { toy: `toy.${toy.id}` }, hidden ? ["unseen"] : undefined);
    ctx.emit("her:bought", { kind: "toy", id: toy.id });
    return;
  }
  // 3. an afternoon "with a friend": a lover who has her number does not have to wait for the evening
  const A = D.shop.affair;
  const lover = Object.values(b.patrons)
    .filter((p) => p.memory.hasNumber && p.memory.tier >= 7 && p.memory.affinity >= A.affinity)
    .sort((x, y) => y.memory.affinity - x.memory.affinity || x.id.localeCompare(y.id))[0];
  if (lover && h.traits.fidelity < A.fidelityBelow && ctx.rng.chance(A.chance)) {
    const out = resolveBody(ctx, actById("sex"), { size: lover.size, minutes: 40 });
    lover.memory.acts.sex = (lover.memory.acts.sex ?? 0) + 1;
    lover.memory.affinity = clamp(lover.memory.affinity + (out.came ? 6 : 2), -100, 100);
    if (out.came) lover.memory.orgasms += 1;
    b.day!.herOut = true;
    b.day!.left = Math.max(0, b.day!.left - A.minutes); // she is back late: the afternoon is shorter for both
    ctx.state.time.minute = opening - b.day!.left;
    if (hidden) {
      b.secretActsToday += 1;
      b.suspicion = clamp(b.suspicion + A.suspicion * content.secrecy.styleFactor[b.husband.style]);
      ctx.log("log.her.out");
      ctx.log("log.her.out.truth", { name: `@name:${lover.name}` }, ["unseen"]);
    } else {
      b.power = clamp(b.power + content.secrecy.powerPerTold);
      ctx.log("log.her.out.open", { name: `@name:${lover.name}` });
    }
    ctx.emit("her:afternoon", { patron: lover.id, came: out.came });
    return;
  }
  // 4. a man for hire, the biggest money can buy
  const g = D.shop.gigolo;
  if (b.purse >= g.price && h.traits.fidelity < g.fidelityBelow && h.sizeTaste >= g.sizeTasteFrom && ctx.rng.chance(g.chance)) {
    b.purse -= g.price;
    const out = resolveBody(ctx, actById("sex"), { size: g.size, minutes: g.minutes });
    h.marriage.desire = clamp(h.marriage.desire - 2);
    if (hidden) {
      b.secretActsToday += 1;
      b.suspicion = clamp(b.suspicion + g.suspicion * content.secrecy.styleFactor[b.husband.style]);
    } else b.power = clamp(b.power + content.secrecy.powerPerTold);
    ctx.log(hidden ? "log.her.gigolo.hidden" : "log.her.gigolo", undefined, hidden ? ["unseen"] : undefined);
    if (hidden) ctx.log("log.her.gigolo.late");
    ctx.emit("her:gigolo", { came: out.came });
  }
}

/** An hour and a half at the gym in town. He trains; if she came along, the women's changing room is out of his sight. */
function gym(ctx: Ctx, together: boolean) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const G = D.gym;
  const base = content.body.husband.minutes;
  b.husband.fitness = clamp((b.husband.fitness ?? 0) + G.fitness);
  b.husband.minutes = Math.min(Math.max(b.husband.minutes, base + G.minutesMax), b.husband.minutes + G.minutesPerSession);
  ctx.log(together ? "log.gym.together" : "log.gym.alone");
  // the men's changing room: nobody hides anything there
  if (ctx.rng.chance(G.lockerChance)) ctx.log(`log.gym.locker.${b.husband.size < 14 ? "small" : "plain"}.${ctx.rng.int(1, 3)}`);
  if (!together) return;
  // her side of the wall: a man she knows from the cafe trains here too
  const known = Object.values(b.patrons)
    .filter((p) => p.regular && p.memory.affinity >= G.meetAffinity)
    .sort((x, y) => y.memory.interest - x.memory.interest || x.id.localeCompare(y.id))[0];
  if (!known || !ctx.rng.chance(G.meetChance)) return;
  const tier = Math.max(1, Math.min(known.memory.tier + 1, G.maxTier));
  const options = content.acts.filter((a) => a.tier === tier && !a.only && a.id !== "drink");
  if (options.length === 0) return;
  const act = ctx.rng.pick(options);
  const input: ConsentInput = { act: act.id, partner: known.id, loc: "town.gym", offer: 0, pressure: 0 };
  const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
  const verdict = verdictOf(res.total);
  const open = b.mode === "open";
  const name = `@name:${known.name}`;
  b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: known.id, act: act.id, loc: "town.gym", verdict, seen: open, total: res.total, rows: res.rows });
  if (b.proposals.length > 12) b.proposals.shift();
  if (verdict === "refuse") {
    known.memory.refusals += 1;
    ctx.log("log.gym.met.no", { name }, open ? undefined : ["unseen"]);
    return;
  }
  known.memory.tier = Math.max(known.memory.tier, act.tier);
  known.memory.acts[act.id] = (known.memory.acts[act.id] ?? 0) + 1;
  known.memory.interest = clamp(known.memory.interest + act.effects.interest + 4);
  known.memory.affinity = clamp(known.memory.affinity + act.effects.affinity + 2, -100, 100);
  changeHeroine(ctx, "arousal", act.effects.arousal, act.id);
  const intimate = act.place === "private";
  if (intimate) {
    const out = resolveBody(ctx, act, { size: known.size, minutes: act.minutes });
    known.memory.sizeKnown = true;
    if (out.came) known.memory.orgasms += 1;
    b.sizeToday = Math.max(b.sizeToday ?? 0, known.size);
  }
  if (open) {
    ctx.log(intimate ? "log.gym.met.open.long" : "log.gym.met.open", { name, act: `act.${act.id}` });
    if (intimate) b.power = clamp(b.power + 2);
  } else {
    if (intimate) {
      b.secretActsToday += 1;
      b.suspicion = clamp(b.suspicion + G.lateSuspicion * content.secrecy.styleFactor[b.husband.style]);
      ctx.log("log.gym.late"); // what he sees: she took a long time in the showers
    }
    ctx.log(intimate ? "log.gym.met.truth.long" : "log.gym.met.truth", { name, act: `act.${act.id}` }, ["unseen"]);
  }
  ctx.emit("gym:met", { patron: known.id, act: act.id, intimate });
}

export function registerDay(api: ModApi) {
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep") return;
      const b = bs(ctx.state);
      b.day = { left: D.minutes, done: [], arrivals: 0 };
      ctx.state.time.minute = opening - D.minutes;
      if (ctx.state.time.day > 1) herMorning(ctx);
      herNext(ctx);
    },
    -10, // after the clock is set for the phase
  );
  api.events.on("shift:end", (ctx) => {
    const b = bs(ctx.state);
    if (b.clean < D.clean.dirtyBelow) {
      addReputation(ctx, -D.clean.dirtyReputation);
      ctx.log("log.day.dirty");
    }
  });

  api.actions.register({
    id: DAY_DO,
    labelKey: "action.day",
    describe: (a) => {
      const act = D.activities.find((x) => x.id === a.payload!.do)!;
      return { key: `action.day.${act.id}`, params: { minutes: act.minutes, cost: act.cost ?? 0, money: act.money ?? 0 } };
    },
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || !b.day || b.day.busy) return [];
      const day = b.day;
      // doing something together needs her within reach: at home with him, or not out on her own
      const herFree = (a: Activity) => !a.withHer || (!day.herOut && day.her?.task !== "away");
      return D.activities
        .filter((a) => !day.done.includes(a.id) && a.minutes <= day.left && isAt(state, a.at) && herFree(a) && (!a.cost || b.money >= a.cost) && !(a.clean && b.clean >= 95))
        .map((a) => ({ type: DAY_DO, payload: { do: a.id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const a = D.activities.find((x) => x.id === action.payload!.do)!;
      if (a.cost) addMoney(ctx, -a.cost, a.id);
      b.day!.busy = { id: a.id, left: a.minutes };
      if (a.withHer) {
        // she comes along and stays with him for as long as it takes
        ctx.state.where[WIFE] = ctx.state.where[HUSBAND]!;
        b.day!.her = { task: "with_you", left: a.minutes };
      }
      ctx.log("log.day.start", { what: `day.${a.id}`, minutes: a.minutes });
      ctx.emit("day:started", { do: a.id });
    },
  });
  // Dropping it half way: the time is gone, and so is the money.
  api.actions.register({
    id: DAY_STOP,
    labelKey: "action.day.stop",
    enumerate: (state) => (state.time.phase === "prep" && bs(state).day?.busy ? [{ type: DAY_STOP }] : []),
    apply(ctx) {
      const day = bs(ctx.state).day!;
      ctx.log("log.day.stop", { what: `day.${day.busy!.id}` });
      day.busy = undefined;
    },
  });
  // The afternoon is waited through like the evening: a stretch at a time, or until what he is doing is done.
  api.actions.register({
    id: PREP_WAIT,
    labelKey: "action.wait",
    describe: (a) => (a.payload?.until ? { key: "action.wait.done" } : { key: "action.wait.minutes", params: { minutes: a.payload!.minutes as number } }),
    enumerate(state) {
      const day = bs(state).day;
      if (state.time.phase !== "prep" || !day || day.left <= 0) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [5, 15, 60].filter((m) => m <= Math.max(5, day.left)).map((m) => ({ type: PREP_WAIT, payload: { minutes: m } }));
      if (day.busy) out.push({ type: PREP_WAIT, payload: { until: "done" } });
      return out;
    },
    accepts: (state, a) => state.time.phase === "prep" && !!bs(state).day && (a.payload?.until === "done" ? !!bs(state).day!.busy : Number.isInteger(a.payload?.minutes) && (a.payload!.minutes as number) > 0),
    apply(ctx, action) {
      const day = bs(ctx.state).day!;
      passPrep(ctx, action.payload?.until ? (day.busy?.left ?? 0) : (action.payload!.minutes as number));
    },
  });
  // Walking takes time too; walking off in the middle of something drops it.
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id !== HUSBAND || ctx.state.time.phase !== "prep") return;
    const day = bs(ctx.state).day;
    if (!day) return;
    if (day.busy) {
      ctx.log("log.day.stop", { what: `day.${day.busy.id}` });
      day.busy = undefined;
    }
    // she said she would be here, and she is not
    if (day.herOut && day.cover === e.payload!.to && !day.coverSeen && bs(ctx.state).mode === "hidden") {
      day.coverSeen = true;
      bs(ctx.state).suspicion = clamp(bs(ctx.state).suspicion + D.herDay.notThereSuspicion * content.secrecy.styleFactor[bs(ctx.state).husband.style]);
      ctx.log("log.her.not_there", { where: `loc.${day.cover}` });
    }
    const far = inTown(e.payload!.from as string) !== inTown(e.payload!.to as string);
    passPrep(ctx, far ? D.herDay.walkToTown : inTown(e.payload!.to as string) ? D.herDay.walkInTown : 1);
  });
  // The town is a place for the afternoon; he is back behind the door by opening time.
  api.locations.guard((state, actor, _from, to) => actor !== HUSBAND || !inTown(to) || (state.time.phase === "prep" && (bs(state).day?.left ?? 0) > D.herDay.walkToTown * 2));
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "shift") return;
      if (inTown(ctx.state.where[HUSBAND])) ctx.state.where[HUSBAND] = "cafe.hall";
      if (inTown(ctx.state.where[WIFE])) ctx.state.where[WIFE] = "cafe.bar";
      if (bs(ctx.state).day) bs(ctx.state).day!.busy = undefined;
    },
    50,
  );

  // Shops (in town) and upgrades (any afternoon).
  api.actions.register({
    id: BUY,
    labelKey: "action.buy",
    describe: (a) => ({ key: `action.buy.${a.payload!.kind}`, params: { item: `${a.payload!.kind === "upgrade" ? "upgrade" : a.payload!.kind}.${a.payload!.id}`, cost: a.payload!.cost as number } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || !b.day) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [];
      if (b.day.busy) return [];
      if (state.where[HUSBAND] === "town.shops") {
        for (const o of content.outfits) if (!b.owned.includes(o.id) && b.money >= o.price) out.push({ type: BUY, payload: { kind: "outfit", id: o.id, cost: o.price } });
        for (const t of D.shop.toys) if (!b.toys.includes(t.id) && b.money >= t.price) out.push({ type: BUY, payload: { kind: "toy", id: t.id, cost: t.price } });
      }
      for (const u of D.upgrades) if (!b.upgrades.includes(u.id) && canPay(state, u.cost)) out.push({ type: BUY, payload: { kind: "upgrade", id: u.id, cost: u.cost } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const { kind, id } = action.payload as { kind: string; id: string };
      if (kind === "outfit") {
        const o = content.outfits.find((x) => x.id === id)!;
        addMoney(ctx, -o.price, "outfit");
        b.owned.push(o.id);
        // a present she is not ready for is still a present, but it stays in the wardrobe
        const ready = h.traits.openness + content.manners.askOutfitBonus >= o.openness;
        changeHeroine(ctx, "mood", ready ? 4 : 1, "present");
        ctx.log(ready ? "log.buy.outfit" : "log.buy.outfit.shy", { outfit: `outfit.${o.id}` });
      } else if (kind === "toy") {
        const t = D.shop.toys.find((x) => x.id === id)!;
        addMoney(ctx, -t.price, "toy");
        b.toys.push(t.id);
        const ok = h.traits.openness >= 40;
        if (ok) changeHeroine(ctx, "arousal", 5, "present");
        else changeHeroine(ctx, "mood", -2, "present");
        // a toy bigger than him says something about him, and she hears it
        if (t.size > b.husband.size + 2) b.power = clamp(b.power + 2);
        ctx.log(ok ? "log.buy.toy" : "log.buy.toy.shy", { toy: `toy.${t.id}` });
      } else {
        const u = D.upgrades.find((x) => x.id === id)!;
        if (b.money < u.cost) ctx.log("log.supplies.credit");
        addMoney(ctx, -u.cost, "upgrade");
        b.upgrades.push(u.id);
        b.today.supplies += u.cost;
        if (u.bill) b.billBonus += u.bill;
        if (u.reputation) addReputation(ctx, u.reputation);
        ctx.log(`log.buy.upgrade.${u.id}`);
      }
      ctx.emit("bought", { kind, id });
    },
  });

  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.clean",
    labelKey: "factor.tip.clean",
    order: 32,
    eval: (state, { bill }) => Math.round(((bill * D.clean.tipShare * (bs(state).clean - 50)) / 50 / 4) * 10) / 10 || null,
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.interior",
    labelKey: "factor.tip.interior",
    order: 33,
    eval: (state, { bill }) => {
      const share = D.upgrades.filter((u) => u.tip && has(state, u.id)).reduce((s, u) => s + u.tip!, 0);
      return share ? (bill * share) / 4 : null;
    },
  });

  api.invariants.add("day", (s) => {
    const b = bs(s);
    if (b.clean < 0 || b.clean > 100) return `cleanliness out of range: ${b.clean}`;
    if (b.purse < 0) return `her purse is negative: ${b.purse}`;
    if (b.day && (b.day.left < 0 || b.day.left > D.minutes)) return `afternoon minutes out of range: ${b.day.left}`;
    if (b.day?.busy && !D.activities.some((a) => a.id === b.day!.busy!.id)) return `unknown activity in progress: ${b.day.busy.id}`;
    for (const id of b.owned) if (!content.outfits.some((o) => o.id === id)) return `unknown outfit owned: ${id}`;
    if (!b.owned.includes(b.heroine.outfit)) return `she wears an outfit she does not own: ${b.heroine.outfit}`;
    return null;
  });
}
