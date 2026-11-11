import type { GameState } from "@tc/core";

export const BASE_ID = "base";
export const WIFE = "wife";
export const HUSBAND = "husband";

export interface Heroine {
  // fast state, 0..100
  energy: number;
  mood: number;
  arousal: number;
  drunk: number;
  // character, 0..100, changes slowly
  traits: { openness: number; confidence: number; fidelity: number; honesty: number; libido: number };
  // body: how much each zone has been stretched (0..100) and the highest it has ever been
  body: Record<Zone, { stretch: number; peak: number }>;
  skills: Record<string, number>; // act id -> 0..100
  satisfied: number; // 0..100, "just had her fill", cools down
  sizeTaste: number; // 0..100, how much size matters to her
  orgasms: number;
  marriage: { desire: number; resent: number }; // what she feels for her husband, 0..100
  outfit: string;
  tastes: { acts: Record<string, number>; types: Record<string, number> }; // what she has come to like
  latents: Record<string, true>; // hidden sides she has; absent = she does not have it
}

export type Directive = "reserved" | "natural" | "friendly";

export type Zone = "vagina" | "anus" | "mouth";
export type Mode = "hidden" | "open"; // NTR: she hides it; NTS: he knows

export interface Husband {
  size: number; // cm
  stamina: number;
  minutes: number; // how long he lasts
  style: "naive" | "jealous" | "encouraging";
}

export interface PatronMemory {
  visits: number;
  lastDay: number;
  served: number;
  tipsTotal: number;
  affinity: number; // what she thinks of him, -100..100
  interest: number; // how much he wants her, 0..100
  tier: number; // how far she has gone with him on the ladder, -1 = nothing yet
  acts: Record<string, number>; // act id -> times
  refusals: number;
  hasNumber: boolean; // they exchanged numbers
  sizeKnown: boolean; // she has seen what he has
  orgasms: number; // times he made her come
}

export interface Patron {
  id: string;
  type: string;
  name: number; // index into content.names
  age: number;
  build: string;
  size: number; // cm
  stamina: number;
  traits: { persistence: number; charm: number; honesty: number; jealousy: number; generosity: number };
  approach: "court" | "drink" | "pay" | "push";
  regular: boolean;
  memory: PatronMemory;
}

export interface Visit {
  patron: string;
  stay: number; // ticks left
  served: number;
  waited: number; // ticks he has been waiting for an order
  sinceOrder: number; // ticks since his last order
  tier: number; // how far he got tonight, -1 = nothing yet
  blocked: boolean; // he stopped trying for tonight
  pressure: number; // times he insisted after a "no"
  retry: string | null; // act he is going to ask for again
  rounds: number; // intimate acts he has had tonight
}

/** The two of them in bed, turn by turn. */
export interface BedScene {
  act: string;
  his: number; // 0..100
  hers: number; // 0..100
  came: number; // times she has come in this scene
  turns: number;
  top: boolean; // her top is open
  skirt: boolean; // her skirt is pushed up
  pleasure: number; // what the current act gives her, 0..100
}

export type Verdict = "eager" | "hesitant" | "refuse";

/** Something is happening between her and a guest right now. The scene is derived from it. */
export interface Encounter {
  patron: string;
  act: string;
  loc: string;
  verdict: Verdict;
  endsTick: number;
}

/** Kept for the debug panel: why she answered the way she did. */
export interface ProposalRecord {
  day: number;
  tick: number;
  patron: string;
  act: string;
  loc: string;
  verdict: Verdict;
  seen: boolean; // the husband was close enough to notice
  rolled?: number; // chance of a yes when she hesitated (absent when there was no roll)
  total: number;
  rows: { id: string; labelKey: string; value: number }[];
}

export interface Shift {
  tick: number;
  visits: Visit[];
  income: number;
  tips: number;
  served: number;
  turnedAway: number;
  moment: { patron: string; act: string } | null; // last light act of this tick
  interrupt: boolean; // something worth stopping "wait until" for has happened
  stockWarned: boolean;
  stolen?: number; // taken from the unwatched till tonight
}

export interface Ledger {
  day: number;
  income: number;
  tips: number;
  rent: number;
  interest: number;
  supplies: number;
  served: number;
  turnedAway: number;
}

export interface BaseState {
  daysPlayed: number;
  money: number;
  debt: number;
  reputation: number; // 0..100
  stock: number; // servings left
  purse: number; // her own money
  purseShare: number; // share of her tips she keeps, 0..1
  purseToday: number;
  heroine: Heroine;
  patrons: Record<string, Patron>;
  nextPatron: number;
  shift: Shift | null;
  encounter: Encounter | null;
  proposals: ProposalRecord[]; // newest last, short history
  husband: Husband;
  mode: Mode;
  suspicion: number; // 0..100, only matters while hidden
  power: number; // her power over him, 0..100, grows once it is open
  denied: number; // nights in a row he got nothing
  secretKnows: boolean; // he found out and she does not know that he knows
  caught: { patron: string; act: string } | null; // he has just walked in on them and has to choose
  secretActsToday: number;
  night: { scene: string; asked: boolean; sex: BedScene | null } | null; // what is going on in the bedroom tonight
  phone: import("./systems/phone").PhoneState;
  directive: Directive; // how he asked her to behave tonight
  expect: Record<string, number>; // act id -> what she thinks he allows, -100..100; absent = no idea
  told: { day: number; key: string; params?: Record<string, string | number> }[]; // what he has said or shown, newest last
  reaction: { patron: string; act: string; reacted: boolean } | null; // something is happening in front of him right now
  outfitAsked: boolean;
  today: Ledger;
  history: Ledger[]; // last days, newest last
}

export const bs = (state: GameState): BaseState => state.mods[BASE_ID] as BaseState;
export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
export const emptyLedger = (day: number): Ledger => ({
  day,
  income: 0,
  tips: 0,
  rent: 0,
  interest: 0,
  supplies: 0,
  served: 0,
  turnedAway: 0,
});
