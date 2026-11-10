// Core knows nothing about the game itself: no cafe, no patrons, no heroine.
// It only provides time, places, actions, events, formulas, scenes and saves.
// Everything game-specific is a mod (see packages/base).

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Params = Record<string, string | number>;

export interface LogEntry {
  turn: number;
  day: number;
  phase: string;
  key: string; // translation key
  params?: Params;
}

export interface GameState {
  seed: number;
  rng: number; // generator state, advances with every roll
  turn: number; // number of dispatched actions
  time: { day: number; phase: string };
  where: Record<string, string>; // entity id -> location id
  mods: Record<string, any>; // each mod owns state.mods[modId]
  log: LogEntry[];
}

export interface Action {
  type: string;
  actor?: string;
  payload?: Record<string, Json>;
}

export interface GameEvent {
  type: string;
  payload?: Record<string, Json>;
}

export interface Rng {
  float(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
}

/** Passed to action and event handlers. `state` is an Immer draft: mutate it freely. */
export interface Ctx {
  state: GameState;
  rng: Rng;
  emit(type: string, payload?: Record<string, Json>): void;
  log(key: string, params?: Params): void;
  /** Read-only access to registries and derived data. */
  engine: EngineView;
}

export interface ActionDef {
  id: string;
  labelKey: string;
  /** Concrete actions available right now. Used by UI and bots. Must be pure. */
  enumerate(state: GameState, engine: EngineView): Action[];
  /** Extra guard, checked on dispatch. Defaults to "is in enumerate()". */
  apply(ctx: Ctx, action: Action): void;
}

export interface PhaseDef {
  id: string;
  labelKey: string;
  order: number;
}

export interface LocationDef {
  id: string;
  zone: string;
  nameKey: string;
  links: string[]; // ids reachable from here
  tags?: string[];
}

/** One named row of a formula, visible in the debug panel. */
export interface FactorDef<I = any> {
  id: string;
  labelKey: string;
  order?: number;
  /** Return null to hide the row (not applicable). */
  eval(state: GameState, input: I, engine: EngineView): number | null;
}

export interface FormulaRow {
  id: string;
  labelKey: string;
  value: number;
}

export interface FormulaResult {
  formula: string;
  rows: FormulaRow[];
  total: number;
}

export interface SceneDesc {
  type: string;
  location: string;
  participants: { id: string; role: string }[];
  tags?: Record<string, string>; // outfit, mood, marks...
}

export interface SceneDef {
  id: string;
  priority: number;
  /** Scene is derived from state every time, never stored. */
  match(state: GameState, engine: EngineView): SceneDesc | null;
}

export type EventHandler = (ctx: Ctx, event: GameEvent) => void;
export type Invariant = (state: GameState, engine: EngineView) => string | null;

export interface ModApi {
  modId: string;
  actions: { register(def: ActionDef): void };
  phases: { register(def: PhaseDef): void };
  locations: { register(def: LocationDef): void };
  formulas: { addFactor<I = any>(formula: string, def: FactorDef<I>): void };
  scenes: { register(def: SceneDef): void };
  events: { on(type: string, handler: EventHandler, priority?: number): void };
  invariants: { add(id: string, check: Invariant): void };
}

export interface Mod {
  id: string;
  version: number;
  requires?: string[];
  /** Initial value of state.mods[id]. */
  initState?(): Json;
  /** Upgrade state.mods[id] saved by an older version of this mod. */
  migrate?(slice: any, fromVersion: number): any;
  register(api: ModApi): void;
}

export interface EngineView {
  mods: readonly { id: string; version: number }[];
  phases(): PhaseDef[];
  location(id: string): LocationDef | undefined;
  locations(): LocationDef[];
  actionDef(id: string): ActionDef | undefined;
  listActions(state: GameState): Action[];
  evaluate<I = any>(formula: string, state: GameState, input: I): FormulaResult;
  currentScene(state: GameState): SceneDesc | null;
  checkInvariants(state: GameState): string[];
}

export interface Engine extends EngineView {
  init(seed: number): GameState;
  dispatch(state: GameState, action: Action): GameState;
}
