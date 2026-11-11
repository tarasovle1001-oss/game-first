// The afternoon before opening: a budget of minutes, things to spend it on, the town with its shops,
// one-off upgrades for the cafe, and what she does with her own money while he is not looking.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";
import { fitOf, resolveBody } from "./body";
import { addMoney, addReputation } from "./economy";
import { actById } from "./encounters";
import { changeHeroine } from "./heroine";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

export const DAY_DO = "base/day";
export const BUY = "base/buy";
const D = content.day;
const bal = content.balance;
const opening = bal.shift.opensAt * 60;
const canPay = (state: GameState, cost: number) => bs(state).money >= cost || bs(state).debt < bal.debtLimit;
const has = (state: GameState, id: string) => bs(state).upgrades.includes(id);
export const hasUpgrade = has;

const spend = (ctx: Ctx, minutes: number) => {
  const day = bs(ctx.state).day!;
  day.left = Math.max(0, day.left - minutes);
  ctx.state.time.minute = opening - day.left;
};

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

export function registerDay(api: ModApi) {
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      if (e.payload!.phase !== "prep") return;
      const b = bs(ctx.state);
      b.day = { left: D.minutes, done: [], arrivals: 0 };
      ctx.state.time.minute = opening - D.minutes;
      if (ctx.state.time.day > 1) herMorning(ctx);
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
      if (state.time.phase !== "prep" || !b.day) return [];
      const day = b.day;
      return D.activities
        .filter((a) => !day.done.includes(a.id) && a.minutes <= day.left && (!a.needs || day.done.includes(a.needs)) && !(day.herOut && a.withHer) && (!a.cost || b.money >= a.cost) && !(a.clean && b.clean >= 95))
        .map((a) => ({ type: DAY_DO, payload: { do: a.id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const a = D.activities.find((x) => x.id === action.payload!.do)!;
      b.day!.done.push(a.id);
      spend(ctx, a.minutes);
      if (a.cost) addMoney(ctx, -a.cost, a.id);
      if (a.money) addMoney(ctx, a.money, a.id);
      if (a.clean) b.clean = clamp(b.clean + a.clean);
      if (a.arrivals) b.day!.arrivals += a.arrivals;
      if (a.stock) b.stock += a.stock;
      for (const [k, v] of Object.entries(a.her ?? {})) {
        if (k === "desire" || k === "resent") b.heroine.marriage[k] = clamp(b.heroine.marriage[k] + v);
        else changeHeroine(ctx, k as "mood", v, a.id);
      }
      if (a.gossip) {
        // what he hears depends on how much there is to hear; hearing it is not the same as knowing
        const G = content.secrecy.gossip;
        const level = b.gossip < G.noticeFrom ? "none" : b.gossip < 40 ? "some" : b.gossip < 70 ? "much" : "all";
        ctx.log(`log.day.ask_around.${level}`);
        if (level !== "none" && b.mode === "hidden") b.suspicion = clamp(b.suspicion + (level === "some" ? 4 : level === "much" ? 9 : 15) * content.secrecy.styleFactor[b.husband.style]);
        ctx.emit("day:did", { do: a.id });
        return;
      }
      ctx.log(`log.day.${a.id}`, { money: a.money ?? 0, cost: a.cost ?? 0, stock: b.stock });
      ctx.emit("day:did", { do: a.id });
    },
  });

  // Shops (in town) and upgrades (any afternoon).
  api.actions.register({
    id: BUY,
    labelKey: "action.buy",
    describe: (a) => ({ key: `action.buy.${a.payload!.kind}`, params: { item: `${a.payload!.kind === "upgrade" ? "upgrade" : a.payload!.kind}.${a.payload!.id}`, cost: a.payload!.cost as number } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || !b.day) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [];
      if (b.day.done.includes("town")) {
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
    for (const id of b.owned) if (!content.outfits.some((o) => o.id === id)) return `unknown outfit owned: ${id}`;
    if (!b.owned.includes(b.heroine.outfit)) return `she wears an outfit she does not own: ${b.heroine.outfit}`;
    return null;
  });
}
