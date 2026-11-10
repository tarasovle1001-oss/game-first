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
  waited: number; // ticks without service
}

export interface Shift {
  tick: number;
  visits: Visit[];
  income: number;
  tips: number;
  served: number;
  turnedAway: number;
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
