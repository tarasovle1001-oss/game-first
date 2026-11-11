import { CORE_ADVANCE, CORE_MOVE, loadGame, makeRng, saveGame } from "@tc/core";
import type { Action, Engine, GameState, Mod } from "@tc/core";

export type Strategy = (actions: Action[], state: GameState, roll: () => number) => Action;

/** Picks anything, but advances time often enough to finish days. */
export const randomStrategy: Strategy = (actions, _state, roll) => {
  const advance = actions.find((a) => a.type === CORE_ADVANCE);
  if (advance && roll() < 0.25) return advance;
  return actions[Math.floor(roll() * actions.length)]!;
};

/** Only advances time: the fastest smoke test of the day cycle. */
/** The longest plain wait on offer: an hour of ordinary work, fifteen minutes while something is going on in front of him. */
const hourWait = (actions: Action[]) =>
  actions.filter((a) => a.type === "base/wait" && typeof a.payload?.minutes === "number").sort((x, y) => (y.payload!.minutes as number) - (x.payload!.minutes as number))[0];

export const rushStrategy: Strategy = (actions) =>
  actions.find((a) => a.type === CORE_ADVANCE) ?? hourWait(actions) ?? actions.find((a) => a.type !== CORE_MOVE) ?? actions[0]!;

/** Plays like a careful owner: buys supplies and pays the debt in prep, never moves. */
export const ownerStrategy: Strategy = (actions, state) =>
  actions.find((a) => a.type === "base/prep-wait" && a.payload?.until === "done") ?? // sees through what he has started
  actions.find((a) => a.type === "base/loan-pay") ??
  (state.mods.base.stock < 45 ? actions.find((a) => a.type === "base/buy-supplies") : undefined) ??
  (state.mods.base.clean < 60 ? actions.find((a) => a.type === "base/day" && a.payload?.do === "clean") : undefined) ??
  // the side job and the flyers are in town: he walks to the square while the afternoon is young
  actions.find((a) => a.type === "base/day" && a.payload?.do === "side_job") ??
  (state.mods.base.money > 150 ? actions.find((a) => a.type === "base/day" && a.payload?.do === "flyers") : undefined) ??
  (state.time.phase === "prep" && state.mods.base.day.left > 300 && state.where.husband === "cafe.hall" && !state.mods.base.day.done.includes("side_job") ? actions.find((a) => a.type === CORE_MOVE && a.payload?.to === "town.square") : undefined) ??
  (state.mods.base.money > 400 ? actions.find((a) => a.type === "base/repay-debt") : undefined) ??
  (state.mods.base.encounter ? actions.find((a) => a.type === "base/serve") : undefined) ??
  actions.find((a) => a.type === CORE_ADVANCE) ??
  hourWait(actions) ??
  actions.find((a) => a.type !== CORE_MOVE) ??
  actions[0]!;

/** Owner who spends the shift in the kitchen: shows what happens when nobody is watching. */
export const awayStrategy: Strategy = (actions, state) => {
  const at = state.where.husband;
  const moveTo = (to: string) => actions.find((a) => a.type === CORE_MOVE && a.payload?.to === to);
  if (state.time.phase === "shift" && at !== "cafe.kitchen") {
    const step = at === "cafe.hall" ? moveTo("cafe.bar") : at === "cafe.bar" ? moveTo("cafe.kitchen") : at === "cafe.staff" ? moveTo("cafe.kitchen") : moveTo("cafe.hall");
    if (step) return step;
  }
  return ownerStrategy(actions, state, () => 0);
};

/** Kitchen owner who also sleeps with his wife every night. */
export const lovingStrategy: Strategy = (actions, state, roll) => {
  const bed = actions.filter((a) => a.type === "base/bed");
  if (bed.length) {
    // an attentive husband: slows down while she is behind, lets go once she has come
    const sex = (state.mods.base as { night: { sex: { his: number; hers: number; came: number; asks: string | null; out: boolean } } }).night.sex;
    const pick = (d: string) => bed.find((a) => a.payload?.do === d);
    // he listens: gives her what she asks for, wraps it up when she wants it over, and helps himself once she is gone
    if (sex.asks === "finish") return pick("finish") ?? pick("hand") ?? pick("faster")!;
    if (sex.asks && roll() < 0.7) return pick("give") ?? pick("keep")!;
    if (sex.out) return pick("finish") ?? pick("hand") ?? pick("faster")!;
    if (sex.came > 0) return pick("finish") ?? pick("faster")!;
    return (sex.his > sex.hers ? pick("slower") : pick("keep"))!;
  }
  return actions.find((a) => a.type === "base/night-act" && a.payload?.act === "sex") ?? (roll() < 0.3 ? actions.find((a) => a.type === "base/night-self") : undefined) ?? awayStrategy(actions, state, roll);
};

/** Kitchen owner who checks the back room when she disappears, and stays to watch. */
export const snoopStrategy: Strategy = (actions, state, roll) => {
  const watch = actions.find((a) => a.type === "base/caught-watch");
  if (watch) return watch;
  const enc = state.mods.base.encounter;
  const tenMinutes = (actions.some((a) => a.type === "base/wait") ? { type: "base/wait", payload: { minutes: 10 } } : undefined);
  const advance = actions.find((a) => a.type === CORE_ADVANCE);
  if (state.time.phase === "shift" && !tenMinutes && advance) return advance; // closing time
  if (enc && enc.loc !== "cafe.hall") {
    if (state.where.husband === enc.loc && tenMinutes) return tenMinutes; // already there: stay and watch
    const step = actions.find((a) => a.type === CORE_MOVE && a.payload?.to === enc.loc);
    if (step) return step;
  }
  const confront = actions.find((a) => a.type === "base/confront");
  if (confront) return confront;
  const tenMin = (actions.some((a) => a.type === "base/wait") ? { type: "base/wait", payload: { minutes: 10 } } : undefined);
  if (state.time.phase === "shift" && state.where.husband === "cafe.kitchen" && tenMin) return tenMin;
  return awayStrategy(actions, state, roll);
};

export interface BotReport {
  seed: number;
  strategy: string;
  days: number;
  turns: number;
  errors: string[];
  finalState: GameState;
}

export interface BotOptions {
  seed: number;
  days: number;
  strategy: Strategy;
  strategyName: string;
  maxTurns?: number;
  /** Save and reload every N turns and require an identical state. 0 = off. */
  saveEvery?: number;
  /** New-game choices, passed to engine.init. */
  setup?: Record<string, any>;
}

export function runBot(engine: Engine, mods: Mod[], opts: BotOptions): BotReport {
  const errors: string[] = [];
  // The bot has its own generator so its choices never touch the game seed stream.
  const botRng = makeRng({ rng: (opts.seed * 7919 + 13) | 0 });
  const maxTurns = opts.maxTurns ?? opts.days * 400;
  let state = engine.init(opts.seed, opts.setup);
  const fail = (msg: string) => errors.push(`day ${state.time.day} ${state.time.phase} turn ${state.turn}: ${msg}`);

  engine.checkInvariants(state).forEach(fail);
  while (state.time.day <= opts.days && state.turn < maxTurns && errors.length === 0) {
    const actions = engine.listActions(state);
    if (actions.length === 0) {
      fail("no actions available (dead end)");
      break;
    }
    const action = opts.strategy(actions, state, botRng.float);
    try {
      state = engine.dispatch(state, action);
    } catch (e) {
      fail(`dispatch ${JSON.stringify(action)} threw: ${(e as Error).message}`);
      break;
    }
    engine.checkInvariants(state).forEach(fail);
    try {
      engine.currentScene(state);
    } catch (e) {
      fail(`currentScene threw: ${(e as Error).message}`);
    }
    if (opts.saveEvery && state.turn % opts.saveEvery === 0) {
      const loaded = loadGame(saveGame(state, engine), mods).state;
      if (JSON.stringify(loaded) !== JSON.stringify(state)) fail("save/load changed the state");
      state = loaded;
    }
  }
  if (errors.length === 0 && state.time.day <= opts.days) fail(`did not reach day ${opts.days + 1} in ${maxTurns} turns`);
  return { seed: opts.seed, strategy: opts.strategyName, days: opts.days, turns: state.turn, errors, finalState: state };
}
