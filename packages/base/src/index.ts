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
import { registerBody } from "./systems/body";
import { registerMarriage } from "./systems/marriage";
import { registerSecrecy } from "./systems/secrecy";
import { newPhone, registerPhone } from "./systems/phone";
import { registerManners } from "./systems/manners";
import { registerLatents } from "./systems/latents";
import { registerSetup } from "./systems/setup";
import { registerExpectations } from "./systems/expectations";
import { registerCouple } from "./systems/couple";
import { registerDay } from "./systems/day";
import { registerHotel } from "./systems/hotel";

/** The game itself, written as a mod on the public API of @tc/core. */
export const baseMod: Mod = {
  id: BASE_ID,
  version: 5,
  // older saves: whatever the new version added starts from its default
  migrate: (slice: any) => {
    const fresh = (baseMod.initState as () => any)();
    for (const k of Object.keys(fresh)) if (slice[k] === undefined) slice[k] = fresh[k];
    if (slice.night && slice.night.sex === undefined) slice.night.sex = null;
    return slice;
  },
  initState: () => {
    const start = content.balance.start;
    const state: BaseState = {
      daysPlayed: 0,
      money: start.money,
      debt: start.debt,
      reputation: start.reputation,
      stock: start.stock,
      purse: 0,
      purseShare: content.balance.purse.start,
      purseToday: 0,
      heroine: newHeroine(),
      patrons: {},
      nextPatron: 1,
      shift: null,
      encounter: null,
      proposals: [],
      husband: { size: content.body.husband.size, stamina: content.body.husband.stamina, minutes: content.body.husband.minutes, style: content.body.husband.style },
      mode: "hidden",
      suspicion: 0,
      power: 0,
      denied: 0,
      secretKnows: false,
      caught: null,
      secretActsToday: 0,
      night: null,
      phone: newPhone(),
      directive: "natural",
      expect: {},
      told: [],
      reaction: null,
      day: null,
      clean: content.day.cleanStart,
      owned: content.outfits.filter((o) => o.price === 0).map((o) => o.id),
      toys: [],
      upgrades: [],
      billBonus: 0,
      lodgers: {},
      changed: null,
      talked: [],
      dayTop: null,
      outfitAsked: false,
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
        canLeave: id === "shift" ? (state) => ticksDone(bs(state).shift) : id === "night" ? (state) => !bs(state).night?.sex : undefined,
      }),
    );
    registerPlaces(api);
    registerEconomy(api);
    registerHeroine(api);
    registerPatrons(api);
    registerShift(api);
    registerEncounters(api);
    registerBody(api);
    registerMarriage(api);
    registerSecrecy(api);
    registerPhone(api);
    registerManners(api);
    registerLatents(api);
    registerExpectations(api);
    registerCouple(api);
    registerDay(api);
    registerHotel(api);
    registerSetup(api);
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
export { fitOf, pleasureFromSize } from "./systems/body";
export { BED, BED_ACTS, NIGHT_ACT, NIGHT_ACTS } from "./systems/marriage";
export { CAUGHT_STOP, CAUGHT_WATCH, CONFRONT } from "./systems/secrecy";
export { CALL_WIFE, PHONE_PEEK, sendMessage } from "./systems/phone";
export type { Message, PhoneState } from "./systems/phone";
export { ASK_OUTFIT, SET_DIRECTIVE } from "./systems/manners";
export { TIP_SHARE } from "./systems/economy";
export type { BaseSetup } from "./systems/setup";
export { REACT_APPROVE, REACT_STOP, expectOf, expectLevel } from "./systems/expectations";
export { GUEST, TALK, TELL, guestInView, together } from "./systems/couple";
export { BUY, DAY_DO, hasUpgrade } from "./systems/day";
export { HOTEL_ROOMS, roomOf } from "./systems/hotel";
export { OUTFIT_BACK } from "./systems/manners";
