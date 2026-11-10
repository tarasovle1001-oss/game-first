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
  heroine: Heroine;
  patrons: Record<string, Patron>;
  nextPatron: number;
  shift: Shift | null;
  encounter: Encounter | null;
  proposals: ProposalRecord[]; // newest last, short history
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
