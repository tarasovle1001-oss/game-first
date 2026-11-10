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
export const rushStrategy: Strategy = (actions) =>
  actions.find((a) => a.type === CORE_ADVANCE) ?? actions.find((a) => a.type !== CORE_MOVE) ?? actions[0]!;

/** Plays like a careful owner: buys supplies and pays the debt in prep, never moves. */
export const ownerStrategy: Strategy = (actions) =>
  actions.find((a) => a.type === "base/buy-supplies") ??
  actions.find((a) => a.type === "base/repay-debt") ??
  actions.find((a) => a.type === CORE_ADVANCE) ??
  actions.find((a) => a.type !== CORE_MOVE) ??
  actions[0]!;

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
}

export function runBot(engine: Engine, mods: Mod[], opts: BotOptions): BotReport {
  const errors: string[] = [];
  // The bot has its own generator so its choices never touch the game seed stream.
  const botRng = makeRng({ rng: (opts.seed * 7919 + 13) | 0 });
  const maxTurns = opts.maxTurns ?? opts.days * 400;
  let state = engine.init(opts.seed);
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
