// Test starts: one button, and a few seconds later the game is at the moment you want to look at.
// A scenario is a new game (fixed seed, a preset) and a list of ordinary moves: walk there, wait, go on to the evening -
// plus a "stage" cheat for what cannot be waited for (a company at the door right now, a worked-up guest at a table).
// Everything is a move, so the state is always a real one, the move record replays it, and the same list runs in the tests.
import { bs } from "@tc/base";
import type { Action, Engine, GameState } from "@tc/core";
import { CORE_ADVANCE, CORE_MOVE } from "@tc/core";

export const CHEAT_STAGE = "cheats/stage";
export const CHEAT_END_SHIFT_ID = "cheats/end-shift";

type Step =
  | { act: Action } // a move that must be on offer (cheats are always accepted)
  | { tryAct: Action } // a move made only if it is on offer right now
  | { phase: "prep" | "shift" | "night" } // play on until this part of the day
  | { wait: number } // minutes, by whichever wait this part of the day has
  | { moveTo: string } // walk there room by room
  | { set: Record<string, number> } // cheats/set on these fields
  | { stage: string; extra?: Record<string, string | number> };

export interface Scenario {
  id: string;
  preset: string;
  mode?: "hidden" | "open";
  seed: number;
  steps: Step[];
  /** What must be true once it has run: the tests check it, the panel shows a warning if not. */
  ready: (s: GameState) => boolean;
}

export const SCENARIOS: Scenario[] = [
  { id: "company_lounge", preset: "ordinary", seed: 101, steps: [{ phase: "shift" }, { stage: "group" }, { wait: 2 }], ready: (s) => bs(s).shift?.group?.pending !== undefined },
  { id: "company_sauna", preset: "curious", seed: 102, steps: [{ stage: "sauna" }, { phase: "shift" }, { stage: "group", extra: { sauna: 1 } }, { wait: 2 }], ready: (s) => bs(s).shift?.group?.sauna === true },
  { id: "company_tray", preset: "curious", seed: 103, steps: [{ phase: "shift" }, { stage: "group" }, { wait: 2 }, { tryAct: { type: "base/group", payload: { do: "accept" } } }, { stage: "tray_now" }, { wait: 1 }], ready: (s) => bs(s).shift?.group?.wants !== undefined },
  { id: "hot_guest", preset: "curious", seed: 104, steps: [{ phase: "shift" }, { set: { "heroine.traits.openness": 55, "heroine.arousal": 45 } }, { stage: "guest_hot" }, { wait: 5 }], ready: (s) => (bs(s).shift?.visits.length ?? 0) > 0 },
  { id: "reluctant_ask", preset: "ordinary", seed: 105, steps: [{ phase: "shift" }, { stage: "guest_hot" }, { stage: "ask_reluctant" }], ready: (s) => bs(s).ask?.tone === "reluctant" },
  { id: "lodger_up", preset: "ordinary", seed: 106, steps: [{ phase: "shift" }, { stage: "lodger_up" }, { stage: "her_to_lodger" }], ready: (s) => bs(s).shift?.attend?.why === "room" },
  { id: "sauna_guest", preset: "curious", seed: 107, steps: [{ stage: "sauna" }, { phase: "shift" }, { stage: "sauna_guest" }, { wait: 1 }], ready: (s) => s.where.wife === "cafe.sauna" },
  { id: "husband_away", preset: "ordinary", seed: 108, steps: [{ moveTo: "town.square" }, { phase: "shift" }, { stage: "guest_hot" }, { wait: 15 }], ready: (s) => s.time.phase === "shift" && !!s.where.husband?.startsWith("town.") },
  { id: "rich_guest", preset: "ordinary", seed: 109, steps: [{ phase: "shift" }, { stage: "rich" }, { wait: 5 }], ready: (s) => Object.values(bs(s).patrons).some((p) => p.rich) },
  { id: "drunk_evening", preset: "ordinary", seed: 110, steps: [{ phase: "shift" }, { stage: "drinker" }, { set: { "heroine.drunk": 35 } }, { stage: "guest_hot" }, { wait: 10 }], ready: (s) => bs(s).heroine.latents.likes_drink === true },
  { id: "her_solo", preset: "ordinary", seed: 111, steps: [{ stage: "toys" }, { stage: "solo_soon" }, { wait: 15 }], ready: (s) => bs(s).day?.her?.task === "solo" },
  { id: "his_solo", preset: "ordinary", seed: 112, steps: [{ stage: "toys" }, { moveTo: "home.bedroom" }, { wait: 5 }], ready: (s) => s.where.husband === "home.bedroom" },
  { id: "night_wants", preset: "ordinary", seed: 113, steps: [{ phase: "night" }, { stage: "her_wants" }], ready: (s) => bs(s).night?.wants === true },
  { id: "femdom", preset: "hungry", seed: 114, mode: "open", steps: [{ stage: "toys" }, { phase: "night" }, { set: { power: 45, "husband.stretch": 20 } }, { stage: "her_wants" }, { tryAct: { type: "base/night-act", payload: { act: "pegging" } } }, { tryAct: { type: "base/night-act", payload: { act: "prostate" } } }], ready: (s) => s.time.phase === "night" },
  { id: "small_hours", preset: "ordinary", seed: 115, steps: [{ stage: "toys" }, { phase: "night" }, { stage: "restless" }], ready: (s) => s.time.phase === "night" },
];

/** Plays a scenario out. Returns the state and every move it took, so the game can keep them in its move record. */
export function runScenario(engine: Engine, sc: Scenario, own: { preset?: string; mode?: string } = {}): { state: GameState; actions: Action[]; setup: Record<string, unknown>; seed: number; ok: boolean; problem?: string } {
  const mode = own.mode ?? sc.mode;
  const setup = { preset: own.preset ?? sc.preset, ...(mode ? { mode } : {}) };
  let s = engine.init(sc.seed, { base: setup as never });
  const actions: Action[] = [];
  const has = (a: Action) => engine.listActions(s).some((x) => x.type === a.type && JSON.stringify(x.payload ?? {}) === JSON.stringify(a.payload ?? {}));
  const go = (a: Action) => {
    s = engine.dispatch(s, a);
    actions.push(a);
  };
  const waitOnce = (minutes: number) => {
    const list = engine.listActions(s);
    const phase = s.time.phase;
    const w = phase === "prep" ? list.find((a) => a.type === "base/prep-wait" && a.payload?.minutes === minutes) : phase === "shift" ? { type: "base/wait", payload: { minutes } } : phase === "night" ? list.find((a) => a.type === "base/night-wait" && a.payload?.minutes === minutes) : undefined;
    if (w && (phase !== "shift" || engine.actionDef("base/wait")?.accepts?.(s, w, engine))) go(w);
    else {
      const any = list.find((a) => /wait/.test(a.type));
      if (any) go(any);
    }
  };
  try {
    for (const step of sc.steps) {
      if ("act" in step) go(step.act);
      else if ("tryAct" in step) {
        if (has(step.tryAct)) go(step.tryAct);
      } else if ("set" in step) for (const [path, value] of Object.entries(step.set)) go({ type: "cheats/set", payload: { path, value } });
      else if ("stage" in step) go({ type: CHEAT_STAGE, payload: { what: step.stage, ...(step.extra ?? {}) } });
      else if ("wait" in step) {
        // in pieces the wait buttons have (1, 5, 15): an exact number of minutes
        let left = step.wait;
        for (const m of [15, 5, 1]) while (left >= m) {
          const before = s.time.minute;
          waitOnce(m);
          left -= m;
          if (s.time.minute === before) left = 0;
        }
      } else if ("moveTo" in step) {
        // breadth-first over the room links, then one move per room
        const prev = new Map<string, string>();
        const start = s.where.husband!;
        const queue = [start];
        while (queue.length) {
          const at = queue.shift()!;
          if (at === step.moveTo) break;
          for (const next of engine.location(at)?.links ?? []) if (!prev.has(next) && next !== start) (prev.set(next, at), queue.push(next));
        }
        const path: string[] = [];
        for (let at = step.moveTo; at !== start; at = prev.get(at)!) {
          if (!prev.has(at)) throw new Error(`no way to ${step.moveTo}`);
          path.unshift(at);
        }
        for (const to of path) go({ type: CORE_MOVE, actor: "husband", payload: { to } });
      } else if ("phase" in step) {
        for (let i = 0; i < 400 && s.time.phase !== step.phase; i++) {
          const list = engine.listActions(s);
          const adv = list.find((a) => a.type === CORE_ADVANCE);
          if (s.time.phase === "shift" && !adv) go({ type: CHEAT_END_SHIFT_ID });
          else if (adv) go(adv);
          else if (list.some((a) => a.type === "base/bed")) go(list.find((a) => a.type === "base/bed" && a.payload?.do === "stop") ?? list.find((a) => a.type === "base/bed")!);
          else go(list.find((a) => /wait/.test(a.type)) ?? list[0]!);
        }
      }
    }
  } catch (e) {
    return { state: s, actions, setup, seed: sc.seed, ok: false, problem: (e as Error).message };
  }
  const bad = engine.checkInvariants(s);
  return { state: s, actions, setup, seed: sc.seed, ok: bad.length === 0 && sc.ready(s), ...(bad.length ? { problem: bad.join("; ") } : !sc.ready(s) ? { problem: "the moment did not come" } : {}) };
}

