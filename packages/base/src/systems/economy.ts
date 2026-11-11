import type { Ctx, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, emptyLedger } from "../state";
import { HALL, husbandSees } from "./places";

export const BUY_SUPPLIES = "base/buy-supplies";
export const REPAY_DEBT = "base/repay-debt";
export const TIP_SHARE = "base/tip-share";
const REPAY_STEP = 100;

/** All money moves go through here so that mods can react to money:changed. */
export function addMoney(ctx: Ctx, amount: number, reason: string) {
  const b = bs(ctx.state);
  b.money = Math.round(b.money + amount);
  if (b.money < 0) {
    // unpaid bills turn into debt: the pressure grows, the game goes on
    b.debt += -b.money;
    b.money = 0;
  }
  ctx.emit("money:changed", { amount, reason });
}

/** Tips left for her, not for the coffee: her share goes to her purse, the rest to the till. Returns the till part. */
export function addHerTips(ctx: Ctx, amount: number): number {
  const b = bs(ctx.state);
  const hers = Math.round(amount * b.purseShare);
  b.purse += hers;
  b.purseToday += hers;
  if (amount - hers > 0) addMoney(ctx, amount - hers, "tips");
  return amount - hers;
}

export function addReputation(ctx: Ctx, amount: number) {
  const b = bs(ctx.state);
  b.reputation = clamp(b.reputation + amount);
}

export function registerEconomy(api: ModApi) {
  const bal = content.balance;

  api.actions.register({
    id: BUY_SUPPLIES,
    labelKey: "action.buy_supplies",
    // no cash is not the end: the supplier gives credit until the debt hits the limit
    enumerate: (state) => {
      const b = bs(state);
      return state.time.phase === "prep" && (b.money >= bal.supplies.packCost || b.debt < bal.debtLimit) ? [{ type: BUY_SUPPLIES }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      if (b.money < bal.supplies.packCost) ctx.log("log.supplies.credit");
      addMoney(ctx, -bal.supplies.packCost, "supplies");
      b.stock += bal.supplies.packServings;
      b.today.supplies += bal.supplies.packCost;
      ctx.log("log.supplies", { cost: bal.supplies.packCost, stock: b.stock });
    },
  });

  api.actions.register({
    id: REPAY_DEBT,
    labelKey: "action.repay_debt",
    enumerate: (state) => {
      const b = bs(state);
      return state.time.phase === "prep" && b.debt > 0 && b.money >= REPAY_STEP ? [{ type: REPAY_DEBT }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const pay = Math.min(REPAY_STEP, b.debt);
      addMoney(ctx, -pay, "debt");
      b.debt -= pay;
      ctx.log("log.repay", { amount: pay, debt: b.debt });
    },
  });

  api.actions.register({
    id: TIP_SHARE,
    labelKey: "action.tip_share",
    describe: (a) => ({ key: "action.tip_share.set", params: { percent: Math.round((a.payload!.share as number) * 100) } }),
    enumerate: (state) =>
      state.time.phase === "prep" ? bal.purse.shares.filter((share) => share !== bs(state).purseShare).map((share) => ({ type: TIP_SHARE, payload: { share } })) : [],
    apply(ctx, action) {
      const share = action.payload!.share as number;
      bs(ctx.state).purseShare = share;
      ctx.log("log.tip_share", { percent: Math.round(share * 100) });
    },
  });

  // Keeping nothing of what she earned sits badly with her; keeping all of it, well.
  api.events.on("shift:end", (ctx) => {
    const b = bs(ctx.state);
    const earned = b.purseShare < 1 ? b.purseToday / Math.max(0.01, b.purseShare) : b.purseToday;
    if (earned > 0 || (b.purseShare === 0 && b.today.tips > 0)) {
      const mood = b.purseShare === 0 ? bal.purse.moodAtNone : b.purseShare === 1 ? bal.purse.moodAtAll : 0;
      if (mood !== 0) b.heroine.mood = clamp(b.heroine.mood + mood);
      if (b.purseShare === 0) b.heroine.marriage.resent = clamp(b.heroine.marriage.resent + 0.5);
    }
    b.purseToday = 0;
  });

  // Something breaks: the coffee machine, the fridge, a pipe. It has to be fixed today.
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep" || ctx.state.time.day < 3) return;
    const t = bal.trouble;
    if (!ctx.rng.chance(t.breakdownChancePerDay)) return;
    const cost = ctx.rng.int(t.breakdownCost[0], t.breakdownCost[1]);
    const what = ctx.rng.pick(["coffee_machine", "fridge", "pipe", "wiring"]);
    addMoney(ctx, -cost, "repair");
    bs(ctx.state).today.supplies += cost; // shows up in the day's costs
    ctx.log(`log.trouble.${what}`, { cost });
    ctx.emit("trouble:breakdown", { what, cost });
  });
  // Nobody at the till: she is in a back room, he cannot see the hall. Someone helps himself.
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh || !b.encounter || b.encounter.loc === HALL || husbandSees(ctx.state, HALL) || sh.income <= 0 || sh.visits.length < 2) return;
    if (!ctx.rng.chance(bal.trouble.tillTheftChancePerTick)) return;
    const taken = Math.min(b.money, Math.round((sh.income * ctx.rng.int(bal.trouble.tillTheftShare[0], bal.trouble.tillTheftShare[1])) / 100));
    if (taken <= 0) return;
    addMoney(ctx, -taken, "theft");
    sh.stolen = (sh.stolen ?? 0) + taken;
    ctx.emit("trouble:theft", { taken });
  });
  // He finds out when he counts the money.
  api.events.on("shift:end", (ctx) => {
    const sh = bs(ctx.state).shift;
    if (sh?.stolen) ctx.log("log.trouble.theft", { taken: sh.stolen });
  });

  // Day summary: rent and interest land when the summary phase starts.
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "summary") return;
    const b = bs(ctx.state);
    const interest = Math.round(b.debt * bal.debtInterestPerDay);
    b.debt += interest;
    b.today.interest = interest;
    b.today.rent = bal.rentPerDay;
    addMoney(ctx, -bal.rentPerDay, "rent");
    const t = b.today;
    ctx.log("log.summary", {
      income: t.income,
      tips: t.tips,
      rent: t.rent,
      interest: t.interest,
      net: t.income + t.tips - t.rent - t.supplies,
    });
  });

  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    b.history.push(b.today);
    if (b.history.length > 30) b.history.shift();
    b.daysPlayed += 1;
    b.today = emptyLedger(ctx.state.time.day + 1);
  });

  api.invariants.add("economy-bounds", (s) => {
    const b = bs(s);
    if (b.money < 0) return `money is negative: ${b.money}`;
    if (b.purse < 0 || !Number.isInteger(b.purse)) return `purse is broken: ${b.purse}`;
    if (b.debt < 0) return `debt is negative: ${b.debt}`;
    if (b.stock < 0) return `stock is negative: ${b.stock}`;
    if (b.reputation < 0 || b.reputation > 100) return `reputation out of range: ${b.reputation}`;
    if (!Number.isInteger(b.money) || !Number.isInteger(b.debt)) return "money and debt must be whole numbers";
    return null;
  });
}
