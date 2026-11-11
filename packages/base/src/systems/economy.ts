import type { Ctx, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, emptyLedger } from "../state";

export const BUY_SUPPLIES = "base/buy-supplies";
export const REPAY_DEBT = "base/repay-debt";
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
    if (b.debt < 0) return `debt is negative: ${b.debt}`;
    if (b.stock < 0) return `stock is negative: ${b.stock}`;
    if (b.reputation < 0 || b.reputation > 100) return `reputation out of range: ${b.reputation}`;
    if (!Number.isInteger(b.money) || !Number.isInteger(b.debt)) return "money and debt must be whole numbers";
    return null;
  });
}
