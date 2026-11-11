// The debt has a face. Every week a payment is due; pay it, or put it off for a fee.
// Put it off, and the man the money is owed to starts dropping by in the evening. He is patient,
// he has taken a liking to the owner's wife, and he can make numbers in his book smaller.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";
import type { Patron } from "../state";
import { addMoney } from "./economy";
import { actById, CONSENT_FORMULA, isIntimate } from "./encounters";
import type { ConsentInput } from "./encounters";
import { generatePatron } from "./patrons";

export const LOAN_PAY = "base/loan-pay";
const L = content.balance.loan;
/** What is due at the next date: a share of what is owed, never less than the minimum (or the whole debt). */
export const installment = (state: GameState) => Math.min(bs(state).debt, Math.max(L.min, Math.round(bs(state).debt * L.share)));
const lenderOf = (state: GameState): Patron | undefined => Object.values(bs(state).patrons).find((p) => p.lender);

export function registerLoan(api: ModApi) {
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      const b = bs(ctx.state);
      if (e.payload!.phase !== "prep" || b.debt <= 0) return;
      const left = b.loan.dueDay - ctx.state.time.day;
      if (left === 0) ctx.log("log.loan.due", { money: installment(ctx.state) });
      else if (left === 2) ctx.log("log.loan.soon", { money: installment(ctx.state), days: left });
    },
    -20,
  );

  api.actions.register({
    id: LOAN_PAY,
    labelKey: "action.loan.pay",
    describe: (a) => ({ key: "action.loan.pay", params: { money: a.payload!.money as number } }),
    enumerate(state) {
      const b = bs(state);
      const due = installment(state);
      // from two days before the date
      return state.time.phase === "prep" && b.debt > 0 && !b.loan.paid && b.loan.dueDay - state.time.day <= 2 && b.money >= due ? [{ type: LOAN_PAY, payload: { money: due } }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const due = installment(ctx.state);
      addMoney(ctx, -due, "loan");
      b.debt -= due;
      b.loan.paid = true;
      ctx.log("log.loan.paid", { money: due, debt: b.debt });
    },
  });

  // The date itself: doors open, and either it was paid or it was not.
  api.events.on("shift:start", (ctx) => {
    const b = bs(ctx.state);
    if (b.debt <= 0 || ctx.state.time.day < b.loan.dueDay) return;
    b.loan.dueDay += L.everyDays;
    if (b.loan.paid) {
      b.loan.paid = false;
      return;
    }
    const fee = Math.round(installment(ctx.state) * L.lateFee);
    b.debt += fee;
    b.loan.missed += 1;
    b.loan.visitsLeft = L.visitsAfterMiss;
    if (!lenderOf(ctx.state)) {
      const p = generatePatron(ctx);
      Object.assign(p, { lender: true, regular: true, approach: "pay", size: Math.max(p.size, L.lender.size), stamina: Math.max(p.stamina, 2) });
      p.traits.persistence = L.lender.persistence;
      p.traits.generosity = L.lender.generosity;
      p.traits.charm = Math.max(p.traits.charm, 55);
      p.memory.interest = L.lender.interest;
    }
    ctx.log(b.loan.missed === 1 ? "log.loan.missed.first" : "log.loan.missed", { money: fee, name: `@name:${lenderOf(ctx.state)!.name}` });
  });
  // He comes by while there is something to talk about.
  api.events.on("shift:tick", (ctx, e) => {
    const b = bs(ctx.state);
    const p = lenderOf(ctx.state);
    if (!p || b.loan.visitsLeft <= 0 || (e.payload!.tick as number) !== L.lender.arrivesAtTick) return;
    b.loan.visitsLeft -= 1;
    p.memory.interest = clamp(Math.max(p.memory.interest, L.lender.interest));
    ctx.emit("base:invite-arrives", { id: p.id });
  });

  // What he gets from her, he takes off the book.
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, act, verdict } = e.payload as { patron: string; act: string; verdict: string };
    const p = b.patrons[patron];
    const a = actById(act);
    if (!p?.lender || verdict === "refuse" || !isIntimate(a) || b.debt <= 0) return;
    const off = Math.min(b.debt, a.tier * L.forgivePerTier);
    b.debt -= off;
    b.loan.forgiven += off;
    ctx.log("log.loan.forgiven", { name: `@name:${p.name}`, money: off }, b.mode === "open" ? undefined : ["unseen"]);
  });
  // The book does not lie: at night he counts, and the number is smaller than it should be.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase !== "summary" || b.loan.forgiven <= 0) return;
    if (b.mode === "hidden") {
      b.suspicion = clamp(b.suspicion + L.suspicion * content.secrecy.styleFactor[b.husband.style]);
      ctx.log("log.loan.odd", { money: b.loan.forgiven });
    }
    b.loan.forgiven = 0;
  });

  // With him, the debt itself argues for her.
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.debt",
    labelKey: "factor.consent.debt",
    order: 44,
    eval(state, input) {
      const b = bs(state);
      const p = b.patrons[input.partner];
      if (!p?.lender || actById(input.act).tier < 3 || b.debt <= 0) return null;
      return L.consent * Math.min(1.5, b.debt / content.balance.start.debt);
    },
  });

  api.invariants.add("loan", (s) => {
    const b = bs(s);
    if (b.debt < 0) return `negative debt: ${b.debt}`;
    if (Object.values(b.patrons).filter((p) => p.lender).length > 1) return "more than one lender";
    return null;
  });
}
