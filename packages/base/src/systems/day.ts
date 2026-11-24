// The afternoon before opening: a budget of minutes, things to spend it on, the town with its shops,
// one-off upgrades for the cafe, and what she does with her own money while he is not looking.
import { glance } from "./glance";
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, sizeClass } from "./body";
import { resolveSized } from "./taking";
import { addMoney, addReputation } from "./economy";
import { actById, CONSENT_FORMULA, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";
import { canDo, himOf } from "./rhythm";

export const DAY_DO = "base/day";
export const BUY = "base/buy";
export const GIVE = "base/give";
export const SHOP_TOGETHER = "base/shop-together";
export const PREP_WAIT = "base/prep-wait";
export const DAY_STOP = "base/day-stop";
const D = content.day;
const bal = content.balance;
const opening = bal.shift.opensAt * 60;
const canPay = (state: GameState, cost: number) => bs(state).money >= cost || bs(state).debt < bal.debtLimit;
const has = (state: GameState, id: string) => bs(state).upgrades.includes(id);
export const hasUpgrade = has;

import { inTown, nextPhase, TICKS_PER_SHIFT } from "./places";
/** Where an activity can be done: "cafe" = anywhere at home, otherwise one place in town. */
const isAt = (state: GameState, at: string | undefined) => {
  const here = state.where[HUSBAND];
  return !at || (at === "cafe" ? !inTown(here) : here === at);
};
type Activity = (typeof D.activities)[number];

/** What an activity does for her, by the share of it that was actually done. */
function herShare(ctx: Ctx, a: Activity, share: number) {
  const b = bs(ctx.state);
  for (const [k, v] of Object.entries(a.her ?? {})) {
    if (k === "desire" || k === "resent") b.heroine.marriage[k] = clamp(b.heroine.marriage[k] + v * share);
    else changeHeroine(ctx, k as "mood", v * share, a.id);
  }
}
/** What an afternoon activity does once the time for it has been put in. */
function finish(ctx: Ctx, a: Activity) {
  const b = bs(ctx.state);
  const spent = b.day!.busy?.spent ?? a.minutes;
  b.day!.busy = undefined;
  if (a.gradual) {
    // done a minute at a time: there is nothing left to hand out at the end, and it can be taken up again
    ctx.log(`log.day.${a.id}`, { money: 0, cost: 0, stock: b.stock });
    herShare(ctx, a, spent / a.minutes);
    ctx.emit("day:did", { do: a.id, share: spent / a.minutes });
    return;
  }
  b.day!.done.push(a.id);
  if (a.money) addMoney(ctx, a.money, a.id);
  if (a.clean) b.clean = clamp(b.clean + a.clean);
  if (a.arrivals) b.day!.arrivals += a.arrivals;
  if (a.stock) b.stock += a.stock;
  herShare(ctx, a, 1);
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
    const told = ctx.state.where[HUSBAND] === ctx.state.where[WIFE];
    ctx.state.where[WIFE] = "town.far";
    ctx.log(told ? "log.her.trip" : "log.her.trip.note", { where: `loc.${day.cover}` });
    return;
  }
  // once a day she may have an errand of her own in town: the shops, the market, the gym. This one is what it looks like
  if (day.her && !day.tripped && day.left > D.herDay.tripMinutes[1] + 60 && (b.wantsToy || ctx.rng.chance(D.herDay.tripChance))) {
    day.tripped = true;
    const to = b.wantsToy ? SEXSHOP : ctx.rng.pick(D.herDay.trips); // with something to buy she goes on purpose
    day.her = { task: "away", left: ctx.rng.int(D.herDay.tripMinutes[0], D.herDay.tripMinutes[1]) };
    // she says it to his face only if he is there to hear it; otherwise he finds a note
    const told = ctx.state.where[HUSBAND] === ctx.state.where[WIFE];
    ctx.state.where[WIFE] = to;
    day.browse = to === "town.shops" || to === SEXSHOP;
    // where she says she is going: while she hides things, that shop is simply "the shops"
    const says = to === SEXSHOP && b.mode === "hidden" ? "town.shops" : to;
    ctx.log(told ? "log.her.trip" : "log.her.trip.note", { where: `loc.${says}` });
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
    if (day.browse) browse(ctx);
    day.browse = false;
    ctx.log("log.her.back");
  }
  if (day.her?.task === "shopping") ctx.log("log.her.shop_done");
  if (day.her?.task === "solo") ctx.emit("solo:end");
  if (day.her?.task === "quiet") changeHeroine(ctx, "energy", D.rhythm.quiet.her, "quiet hour");
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
    ctx.state.time.minute = Math.max(ctx.state.time.minute, opening - day.left); // never back: see shift.ts
    // run dry, either of them simply lies down for an hour
    if (!day.busy && himOf(ctx.state).energy <= 0 && !b.night && !inTown(ctx.state.where[HUSBAND])) {
      day.busy = { id: "nap", left: Math.min(D.rhythm.collapse.minutes, day.left) }; // run into the ground he sleeps for hours, not for one
      ctx.log("log.quiet.him");
    }
    if (b.heroine.energy <= 0 && !b.night && !day.herOut && !["quiet", "away"].includes(day.her?.task ?? "")) {
      day.her = { task: "quiet", left: D.rhythm.quiet.minutes };
      ctx.state.where[WIFE] = "home.bedroom";
      ctx.log("log.quiet.her");
    }
    if (day.busy) {
      const a = D.activities.find((x) => x.id === day.busy!.id)!;
      day.busy.left -= 1;
      if (a.gradual) {
        // every minute of it counts at once: stop when you like, what is done is done
        day.busy.spent = (day.busy.spent ?? 0) + 1;
        if (a.clean) b.clean = clamp(b.clean + a.clean / a.minutes);
        if (a.clean && b.clean >= 100) day.busy.left = 0; // nothing left to clean
      }
      if (day.busy.left <= 0) finish(ctx, a);
    }
    if (day.her && day.her.task !== "with_you") {
      day.her.left -= 1;
      if (day.her.left <= 0) herDone(ctx);
    } else if (day.her?.task === "with_you" && !day.busy) herNext(ctx);
    // five o'clock: the doors open whether he is back or not. She stands behind the bar; he may still be in town
    if (day.left <= 0 && !day.opening && !b.night?.sex) {
      day.opening = true;
      nextPhase(ctx);
    }
    if (day.left % 10 === 0) {
      const h = b.heroine;
      h.annoyance = Math.max(0, (h.annoyance ?? 0) - content.manners.talk.annoy.coolPrep);
      ctx.emit("prep:tick", { left: day.left });
    }
  }
}

/**
 * She has been round the shops on her own. Mostly she only looks: at a dress a step bolder than hers, at the window of
 * the shop with the toys. What catches her eye depends on what is on her mind; now and then she comes back with a box.
 */
const SEXSHOP = "town.sexshop";
/** From what openness a thing is hers to want: a see-through one is first of all for the night. */
const wantsFrom = (o: (typeof content.outfits)[number]) => Math.min(o.openness, o.sheer?.night ?? o.openness);
/** The toy she would pick next: a step up from what she has and takes, within what she could work up to. */
function nextToy(state: GameState) {
  const b = bs(state);
  const fit = fitOf(state, "vagina");
  const biggest = Math.max(0, ...D.shop.toys.filter((t) => b.toys.includes(t.id)).map((t) => t.size));
  return D.shop.toys
    .slice()
    .sort((x, y) => x.size - y.size)
    .find((t) => !b.toys.includes(t.id) && t.size > Math.max(biggest, fit - 1) && t.size >= D.shop.solo.firstSize && t.size <= fit + D.shop.toyStretchAbove);
}
/** She stands at the shelf with one in her hands, weighing it: the picture of that moment. */
function holdsToy(ctx: Ctx, size: number) {
  glance(ctx, "her_shop_toy", SEXSHOP, [{ id: WIFE, role: "wife" }], { tsize: String(sizeClass(size)) });
}
function browse(ctx: Ctx) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const B = D.shop.browse;
  const hidden = b.mode !== "open";
  const tags = hidden ? ["unseen"] : undefined;
  const fit = fitOf(ctx.state, "vagina");
  const want = h.wantSize ?? 0;
  // the shop with the toys draws her by how much size is on her mind, how badly she is left wanting, and what she failed to take
  const pull = B.toysBase + h.sizeTaste * B.perTaste + h.frustration * B.perFrustration + (want > fit ? B.failed : 0);
  if (b.wantsToy || ctx.rng.chance(Math.min(B.toysMax, pull))) {
    const biggest = Math.max(0, ...D.shop.toys.filter((t) => b.toys.includes(t.id)).map((t) => t.size));
    const next = D.shop.toys
      .slice()
      .sort((x, y) => x.size - y.size)
      .find((t) => !b.toys.includes(t.id) && t.size > Math.max(biggest, fit - 1) && t.size >= D.shop.solo.firstSize && t.size <= fit + D.shop.toyStretchAbove);
    ctx.log(`log.her.browse.toys.${ctx.rng.int(1, 3)}`, undefined, tags);
    if (!next) return ctx.log(`log.her.browse.toys.bigger.${ctx.rng.int(1, 2)}`, undefined, ["unseen", "thought"]);
    const keen = b.wantsToy || want > fit || h.frustration >= D.shop.solo.buyAt / 2 || h.sizeTaste >= B.buyTaste;
    if (!keen) return ctx.log(`log.her.browse.toys.notyet.${ctx.rng.int(1, 2)}`, undefined, ["unseen", "thought"]);
    if (b.purse < next.price) return ctx.log("log.her.browse.toys.dear", { toy: `toy.${next.id}`, price: next.price }, ["unseen", "thought"]);
    b.purse -= next.price;
    b.toys.push(next.id);
    b.herToys = [...(b.herToys ?? []), next.id];
    ctx.log(hidden ? "log.her.buys.toy.hidden" : "log.her.buys.toy", { toy: `toy.${next.id}` }, tags);
    ctx.emit("her:bought", { kind: "toy", id: next.id });
    return;
  }
  const outfit = content.outfits
    .slice()
    .sort((x, y) => x.order - y.order)
    .find((o) => !b.owned.includes(o.id));
  if (outfit && ctx.rng.chance(B.outfit)) return ctx.log(`log.her.browse.outfit.${ctx.rng.int(1, 3)}`, { outfit: `outfit.${outfit.id}` }, tags);
  ctx.log(`log.her.browse.plain.${ctx.rng.int(1, 3)}`, undefined, tags);
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
    .find((o) => !b.owned.includes(o.id) && h.traits.openness >= wantsFrom(o) - D.shop.herOutfitMargin);
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
  // curious about the back way and nothing small enough for it in the drawer: this time a small one for there
  // (the ladder there starts much lower; once it opens, the toys she has for the front follow it up)
  const backFit = fitOf(ctx.state, "anus") + D.shop.toyStretchAbove;
  const backBest = Math.max(0, ...D.shop.toys.filter((t) => b.toys.includes(t.id) && t.size <= backFit).map((t) => t.size));
  const forBack =
    b.toys.length > 0 && (h.prefs?.anal ?? 50) >= D.shop.solo.analCuriousFrom && backBest < fitOf(ctx.state, "anus") + 2
      ? D.shop.toys.filter((t) => !b.toys.includes(t.id) && t.size > backBest && t.size <= backFit && b.purse >= t.price).sort((x, y) => y.size - x.size)[0]
      : undefined;
  const toy =
    forBack ??
    D.shop.toys
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
    const out = resolveSized(ctx, actById("sex"), { size: lover.size, minutes: 40 });
    lover.memory.acts.sex = (lover.memory.acts.sex ?? 0) + 1;
    lover.memory.affinity = clamp(lover.memory.affinity + (out.came ? 6 : 2), -100, 100);
    if (out.came) lover.memory.orgasms += 1;
    b.day!.herOut = true;
    b.day!.left = Math.max(0, b.day!.left - A.minutes); // she is back late: the afternoon is shorter for both
    ctx.state.time.minute = Math.max(ctx.state.time.minute, opening - b.day!.left);
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
    // as big as she can hope to take: a step above her own
    const out = resolveSized(ctx, actById("sex"), { size: Math.min(g.size, Math.round(fitOf(ctx.state, "vagina") + 4)), minutes: g.minutes });
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
  const options = content.acts.filter((a) => a.tier === tier && !a.only && a.id !== "drink" && !a.at);
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
    const out = resolveSized(ctx, act, { size: known.size, minutes: act.minutes }, known.name);
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

/** She gets the thing in her hands: only now does she have something to say about it. */
function present(ctx: Ctx, kind: "outfit" | "toy", id: string, inShop: boolean) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const S = D.herDay.shopping;
  if (kind === "outfit") {
    const o = content.outfits.find((x) => x.id === id)!;
    b.owned.push(o.id);
    // a present she is not ready for is still a present, but it stays in the wardrobe; trying it on herself helps
    const ready = h.traits.openness + content.manners.askOutfitBonus + (inShop ? S.tryOn : 0) >= wantsFrom(o);
    changeHeroine(ctx, "mood", ready ? 4 : 1, "present");
    ctx.log(`log.${inShop ? "buy" : "give"}.outfit${ready ? "" : ".shy"}`, { outfit: `outfit.${o.id}` });
  } else {
    const t = D.shop.toys.find((x) => x.id === id)!;
    b.toys.push(t.id);
    const ok = h.traits.openness >= 40;
    if (ok) changeHeroine(ctx, "arousal", 5, "present");
    else changeHeroine(ctx, "mood", -2, "present");
    // a toy bigger than him says something about him, and she hears it
    if (t.size > b.husband.size + 2) b.power = clamp(b.power + 2);
    ctx.log(`log.${inShop ? "buy" : "give"}.toy${ok ? "" : ".shy"}`, { toy: `toy.${t.id}` });
  }
  ctx.emit("presented", { kind, id });
}

export function registerDay(api: ModApi) {
  // What he bought without her waits in a bag until they are in one room.
  api.actions.register({
    id: GIVE,
    labelKey: "action.give",
    describe: (a) => ({ key: "action.give.item", params: { item: `${a.payload!.kind}.${a.payload!.id}` } }),
    enumerate(state) {
      const b = bs(state);
      if (!b.bag?.length || state.time.phase === "summary" || b.encounter || b.caught || b.reaction || b.night?.sex || b.day?.busy) return [];
      if (state.where[HUSBAND] !== state.where[WIFE]) return [];
      return b.bag.map((x) => ({ type: GIVE, payload: { kind: x.kind, id: x.id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const { kind, id } = action.payload as { kind: "outfit" | "toy"; id: string };
      b.bag = (b.bag ?? []).filter((x) => x.id !== id);
      present(ctx, kind, id, false);
    },
  });
  // "Come to the shops with me": she walks there with him and stays a while, so what he buys she sees and tries on.
  api.actions.register({
    id: SHOP_TOGETHER,
    labelKey: "action.shop_together",
    enumerate(state) {
      const b = bs(state);
      const day = b.day;
      const S = D.herDay.shopping;
      if (state.time.phase !== "prep" || !day || day.busy || day.herOut || day.her?.task === "away" || day.her?.task === "shopping" || b.night) return [];
      if (state.where[HUSBAND] !== state.where[WIFE] || inTown(state.where[HUSBAND])) return [];
      return day.left >= D.herDay.walkToTown * 2 + S.minutes / 2 ? [{ type: SHOP_TOGETHER }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const S = D.herDay.shopping;
      ctx.log("log.shop_together");
      passPrep(ctx, D.herDay.walkToTown + D.herDay.walkInTown);
      ctx.state.where[HUSBAND] = "town.shops";
      ctx.state.where[WIFE] = "town.shops";
      b.day!.her = { task: "shopping", left: S.minutes };
      changeHeroine(ctx, "mood", S.mood, "out together");
      ctx.emit("day:shopping");
    },
  });

  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep") return;
      const b = bs(ctx.state);
      // the first day starts at noon; after that the day is as long as he made it by getting up
      // (the clock was set for the morning a moment ago: the afternoon is what is left of it until opening)
      const left = ctx.state.time.day > 1 ? Math.max(60, opening - ctx.state.time.minute) : D.minutes;
      b.day = { left, done: [], arrivals: 0 };
      ctx.state.time.minute = Math.max(ctx.state.time.day > 1 ? ctx.state.time.minute : 0, opening - left);
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
      if (state.time.phase !== "prep" || !b.day || b.day.busy || b.night?.sex) return [];
      const day = b.day;
      // doing something together needs her within reach: at home with him, or not out on her own
      const herFree = (a: Activity) => !a.withHer || (!day.herOut && day.her?.task !== "away");
      return D.activities
        .filter((a) => (a.gradual ? day.left > 0 : !day.done.includes(a.id) && a.minutes <= day.left) && isAt(state, a.at) && herFree(a) && canDo(state, a.energy) && (!a.cost || b.money >= a.cost) && !(a.clean && b.clean >= 95))
        .map((a) => ({ type: DAY_DO, payload: { do: a.id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const a = D.activities.find((x) => x.id === action.payload!.do)!;
      if (a.cost) addMoney(ctx, -a.cost, a.id);
      // cleaning takes as long as there is dirt: an almost clean hall is a few minutes, not the full hour
      const need = a.gradual && a.clean ? Math.max(1, Math.ceil(((100 - b.clean) / a.clean) * a.minutes)) : a.minutes;
      b.day!.busy = { id: a.id, left: Math.min(a.minutes, need, b.day!.left) };
      if (a.withHer) {
        // she comes along and stays with him for as long as it takes
        ctx.state.where[WIFE] = ctx.state.where[HUSBAND]!;
        b.day!.her = { task: "with_you", left: a.minutes };
        // out in town together: the picture is of the two of them, hand in hand
        if ((ctx.state.where[HUSBAND] ?? "").startsWith("town.")) glance(ctx, "him_hug", ctx.state.where[HUSBAND], [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }]);
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
      const a = D.activities.find((x) => x.id === day.busy!.id)!;
      const spent = day.busy!.spent ?? 0;
      ctx.log(a.gradual ? "log.day.stop.gradual" : "log.day.stop", { what: `day.${a.id}`, minutes: spent });
      day.busy = undefined;
      if (a.gradual && spent > 0) {
        herShare(ctx, a, spent / a.minutes);
        ctx.emit("day:did", { do: a.id, share: spent / a.minutes });
      }
    },
  });
  // The afternoon is waited through like the evening: a stretch at a time, or until what he is doing is done.
  api.actions.register({
    id: PREP_WAIT,
    labelKey: "action.wait",
    describe: (a) => (a.payload?.until ? { key: "action.wait.done" } : { key: "action.wait.minutes", params: { minutes: a.payload!.minutes as number } }),
    enumerate(state) {
      const day = bs(state).day;
      if (state.time.phase !== "prep" || !day || day.left <= 0 || bs(state).night?.sex) return [];
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
      // walking off in the middle of something they were doing together is not the same as going to open up
      const withHer = D.activities.find((x) => x.id === day.busy!.id)?.withHer && day.her?.task === "with_you";
      ctx.log("log.day.stop", { what: `day.${day.busy.id}` });
      day.busy = undefined;
      if (withHer) {
        changeHeroine(ctx, "mood", D.leftHer.mood, "left alone");
        bs(ctx.state).heroine.marriage.resent = clamp(bs(ctx.state).heroine.marriage.resent + D.leftHer.resent);
        ctx.log("log.day.left_her");
      }
    }
    // he walks into that shop and she is there, at the shelf: she had not said where exactly she was going
    if (e.payload!.to === SEXSHOP && ctx.state.where[WIFE] === SEXSHOP && day.her?.task === "away" && !day.metAtShop) {
      day.metAtShop = true;
      const h = bs(ctx.state).heroine;
      const toy = nextToy(ctx.state);
      ctx.log(h.traits.openness >= D.herDay.shopping.boldOpenness ? "log.sexshop.meets.bold" : "log.sexshop.meets.shy");
      if (bs(ctx.state).mode === "hidden") bs(ctx.state).suspicion = clamp(bs(ctx.state).suspicion + 3);
      if (toy) holdsToy(ctx, toy.size);
    }
    // out shopping together and he turns into that door: she comes in with him, or stands outside until he asks twice
    if (e.payload!.to === SEXSHOP && day.her?.task === "shopping" && ctx.state.where[WIFE] === "town.shops") {
      const h = bs(ctx.state).heroine;
      ctx.state.where[WIFE] = SEXSHOP;
      const bold = h.traits.openness >= D.herDay.shopping.boldOpenness;
      ctx.log(bold ? "log.sexshop.together.bold" : "log.sexshop.together.shy");
      changeHeroine(ctx, "arousal", bold ? 4 : 2, "the shop");
      const toy = nextToy(ctx.state);
      if (toy) holdsToy(ctx, toy.size);
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
  // he does not set out for town with no time to get back - but once there he can always walk on and walk home (the clock simply stops at opening time)
  // During the evening he can go out too, leaving the bar to her, only not in its last hour and a half.
  api.locations.guard((state, actor, from, to) => {
    if (actor !== HUSBAND || !inTown(to) || inTown(from)) return true;
    if (state.time.phase === "prep") return (bs(state).day?.left ?? 0) > D.herDay.walkToTown * 2;
    const sh = bs(state).shift;
    return state.time.phase === "shift" && !!sh && !bs(state).caught && !bs(state).night?.sex && sh.tick < TICKS_PER_SHIFT + (sh.early ?? 0) - bal.shift.awayLastMinutes;
  });
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "shift") return;
      // he may still be out: the evening starts without him, and she is behind the bar
      const b = bs(ctx.state);
      if (inTown(ctx.state.where[HUSBAND])) {
        b.shift!.awaySince = 0;
        ctx.log("log.away.opens");
      }
      if (inTown(ctx.state.where[WIFE])) ctx.state.where[WIFE] = "cafe.bar";
      if (b.day) b.day.busy = undefined;
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
      if ((state.time.phase !== "prep" && !(state.time.phase === "shift" && inTown(state.where[HUSBAND]))) || !b.day || b.night?.sex) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [];
      if (b.day.busy) return [];
      if (state.where[HUSBAND] === "town.shops") {
        const bag = (b.bag ?? []).map((x) => x.id);
        for (const o of content.outfits) if (!o.shop && !b.owned.includes(o.id) && !bag.includes(o.id) && b.money >= o.price) out.push({ type: BUY, payload: { kind: "outfit", id: o.id, cost: o.price } });
      }
      if (state.where[HUSBAND] === SEXSHOP) {
        const bag = (b.bag ?? []).map((x) => x.id);
        for (const t of D.shop.toys) if (!b.toys.includes(t.id) && !bag.includes(t.id) && b.money >= t.price) out.push({ type: BUY, payload: { kind: "toy", id: t.id, cost: t.price } });
        for (const n of content.outfits) if (n.shop === "adult" && !b.owned.includes(n.id) && !bag.includes(n.id) && b.money >= n.price) out.push({ type: BUY, payload: { kind: "outfit", id: n.id, cost: n.price } });
      }
      if (inTown(state.where[HUSBAND])) for (const u of D.upgrades) if (!b.upgrades.includes(u.id) && canPay(state, u.cost)) out.push({ type: BUY, payload: { kind: "upgrade", id: u.id, cost: u.cost } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const { kind, id } = action.payload as { kind: string; id: string };
      if (kind === "outfit" || kind === "toy") {
        const price = kind === "outfit" ? content.outfits.find((x) => x.id === id)!.price : D.shop.toys.find((x) => x.id === id)!.price;
        addMoney(ctx, -price, kind);
        // she is there to see it and try it on, or it goes home in a bag until he gives it to her
        if (ctx.state.where[WIFE] === ctx.state.where[HUSBAND]) {
          present(ctx, kind, id, true);
          if (kind === "toy") holdsToy(ctx, D.shop.toys.find((x) => x.id === id)!.size); // she turns the box over in her hands
        }
        else {
          (b.bag = b.bag ?? []).push({ kind, id });
          ctx.log(`log.buy.${kind}.bag`, { [kind]: `${kind}.${id}` });
        }
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
    if (b.day && (b.day.left < 0 || b.day.left > opening)) return `afternoon minutes out of range: ${b.day.left}`;
    if (b.day?.busy && !D.activities.some((a) => a.id === b.day!.busy!.id)) return `unknown activity in progress: ${b.day.busy.id}`;
    for (const id of b.owned) if (!content.outfits.some((o) => o.id === id)) return `unknown outfit owned: ${id}`;
    if (!b.owned.includes(b.heroine.outfit)) return `she wears an outfit she does not own: ${b.heroine.outfit}`;
    return null;
  });
}
