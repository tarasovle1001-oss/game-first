import type { Dict, Mod } from "@tc/core";
import { content } from "./content";
import { BASE_ID, bs, emptyLedger } from "./state";
import type { BaseState } from "./state";
import { registerEconomy } from "./systems/economy";
import { newHeroine, registerHeroine } from "./systems/heroine";
import { registerPatrons } from "./systems/patrons";
import { PHASES, registerPlaces, ticksDone } from "./systems/places";
import { registerShift } from "./systems/shift";
import { registerEncounters } from "./systems/encounters";

/** The game itself, written as a mod on the public API of @tc/core. */
export const baseMod: Mod = {
  id: BASE_ID,
  version: 1,
  initState: () => {
    const start = content.balance.start;
    const state: BaseState = {
      daysPlayed: 0,
      money: start.money,
      debt: start.debt,
      reputation: start.reputation,
      stock: start.stock,
      heroine: newHeroine(),
      patrons: {},
      nextPatron: 1,
      shift: null,
      encounter: null,
      proposals: [],
      today: emptyLedger(1),
      history: [],
    };
    return state as any;
  },
  register(api) {
    PHASES.forEach((id, i) =>
      api.phases.register({
        id,
        labelKey: `base.phase.${id}`,
        order: i,
        // the shift cannot be skipped: it runs its ticks first
        canLeave: id === "shift" ? (state) => ticksDone(bs(state).shift) : undefined,
      }),
    );
    registerPlaces(api);
    registerEconomy(api);
    registerHeroine(api);
    registerPatrons(api);
    registerShift(api);
    registerEncounters(api);
  },
};

export const baseLocales: Record<string, Dict> = content.locales;
export { content, patronType, room } from "./content";
export * from "./state";
export type { Content, PatronType, Room, Balance, Act, SceneLayout } from "./content/schema";
export { CONSENT_FORMULA, nextProposal, verdictOf } from "./systems/encounters";
export type { ConsentInput } from "./systems/encounters";
export { PHASES } from "./systems/places";
export { TIP_FORMULA, WAIT, WAIT_MINUTES, visitOf } from "./systems/shift";
export { clockText, TICKS_PER_SHIFT, HALL } from "./systems/places";
export type { TipInput } from "./systems/shift";
export { BUY_SUPPLIES, REPAY_DEBT, addMoney, addReputation } from "./systems/economy";
export { changeHeroine } from "./systems/heroine";
export { renderLog, renderParams, patronName } from "./text";
