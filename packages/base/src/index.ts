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
import { registerDress } from "./systems/dress";
import { registerAnnoy } from "./systems/annoy";
import { registerLook } from "./systems/look";
import { registerHerSide } from "./systems/herside";
import { registerLatents } from "./systems/latents";
import { registerSetup } from "./systems/setup";
import { registerExpectations } from "./systems/expectations";
import { registerCouple } from "./systems/couple";
import { registerDay } from "./systems/day";
import { registerHotel } from "./systems/hotel";
import { registerGossip } from "./systems/gossip";
import { registerLoan } from "./systems/loan";
import { registerMemories } from "./systems/memories";
import { registerRhythm } from "./systems/rhythm";
import { registerMind } from "./systems/mind";
import { registerTerms } from "./systems/terms";
import { registerFloor } from "./systems/floor";
import { registerBodyState } from "./systems/bodystate";
import { registerCrowd } from "./systems/crowd";

/** The game itself, written as a mod on the public API of @tc/core. */
export const baseMod: Mod = {
  id: BASE_ID,
  version: 22,
  // older saves: whatever the new version added starts from its default
  migrate: (slice: any) => {
    const fresh = (baseMod.initState as () => any)();
    for (const k of Object.keys(fresh)) if (slice[k] === undefined) slice[k] = fresh[k];
    if (slice.night && slice.night.sex === undefined) slice.night.sex = null;
    if (slice.husband.stretch === undefined) slice.husband.stretch = 0;
    if (slice.husband.energy === undefined) Object.assign(slice.husband, content.day.rhythm.him.start);
    if (slice.heroine.frustration === undefined) slice.heroine.frustration = 0;
    if (slice.heroine.bare === undefined) slice.heroine.bare = "none";
    if (slice.heroine.attrs === undefined) slice.heroine.attrs = { charm: 50, wit: 50, stamina: 50, composure: 50 };
    if (slice.heroine.marriage.trust === undefined) slice.heroine.marriage.trust = content.mind.trust.start;
    if (!slice.owned.includes(slice.heroine.outfit)) slice.owned.push(slice.heroine.outfit);
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
      husband: { size: content.body.husband.size, stamina: content.body.husband.stamina, minutes: content.body.husband.minutes, style: content.body.husband.style, stretch: 0 },
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
      gossip: 0,
      loan: { dueDay: content.balance.loan.firstDueDay, paid: false, missed: 0, visitsLeft: 0, forgiven: 0 },
      approach: null,
      approached: {},
      pushedToday: {},
      remarked: [],
      complaint: null,
      complainedDay: -10,
      orders: [],
      ordersAsked: [],
      memories: [],
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
        canLeave: id === "shift" ? (state) => ticksDone(bs(state).shift) : id === "night" ? (state) => !bs(state).night?.sex && !bs(state).complaint : undefined,
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
    registerDress(api);
    registerAnnoy(api);
    registerLook(api);
    registerLatents(api);
    registerExpectations(api);
    registerCouple(api);
    registerHerSide(api);
    registerDay(api);
    registerHotel(api);
    registerGossip(api);
    registerLoan(api);
    registerMemories(api);
    registerRhythm(api);
    registerMind(api);
    registerTerms(api);
    registerFloor(api);
    registerBodyState(api);
    registerCrowd(api);
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
export { GUEST, HEAR, TALK, TELL, guestInView, together } from "./systems/couple";
export { BUY, DAY_DO, hasUpgrade } from "./systems/day";
export { HOTEL_ROOMS, roomOf } from "./systems/hotel";
export { OUTFIT_BACK } from "./systems/manners";
export { ANSWER } from "./systems/herside";
export { annoyanceOf, annoyedLevel } from "./systems/annoy";
export { describeScene, faceOf } from "./systems/look";
export type { SceneWords } from "./systems/look";
export { PREP_WAIT, DAY_STOP, passPrep } from "./systems/day";
export { TASTES, TASTE_LATENT } from "./systems/setup";
export { STRIP, bareOf, bareMargin, dressOf, eyesOn } from "./systems/dress";
export { HIS_ACTS, hisActOpen } from "./systems/marriage";
export { AFTER, NIGHT_DECLINE, NIGHT_SELF, UPSTAIRS, UPSTAIRS_ACTS } from "./systems/marriage";
export { installment, LOAN_PAY } from "./systems/loan";
export { ORDER } from "./systems/manners";
export { husbandSees, husbandIn, husbandNextTo } from "./systems/places";
export { rentOf } from "./systems/economy";
export { ATTRS, EMOTIONS, attrOf, feelingOf, feelingsOf, latitudeOf, trustOf, wantsOf } from "./systems/mind";
export type { Attr, Emotion } from "./systems/mind";
export { WISH, ALLOW, PERMIT, STANCE, DARE, ABOUT, PROMISE, PRESS, wished } from "./systems/terms";
export { DEAL, GROUP, TABLE, JOIN, LOUNGE } from "./systems/floor";
export { CROWD, crowdOf, menOf } from "./systems/crowd";
export { soreOf, slick, wearOf, foreignMarks, visibleMarks, dressShift } from "./systems/bodystate";
export { SLEEP, NIGHT_WAIT, WASH, SEND_WASH, WASH_TOGETHER, himOf, tired, worryOf, weekdayOf, fameOf, fameTier } from "./systems/rhythm";
export { pleasureFor, sizeClass } from "./systems/body";
