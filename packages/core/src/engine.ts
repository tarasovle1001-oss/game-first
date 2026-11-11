import { produce } from "immer";
import { makeRng } from "./rng";
import type {
  Action,
  ActionDef,
  Ctx,
  Engine,
  EngineView,
  EventHandler,
  FactorDef,
  FormulaResult,
  GameEvent,
  GameState,
  Invariant,
  LocationDef,
  Mod,
  ModApi,
  PhaseDef,
  SceneDef,
  SceneDesc,
} from "./types";

export const CORE_ADVANCE = "core/advance";
export const CORE_MOVE = "core/move";
const MAX_EVENTS_PER_DISPATCH = 5000;
const LOG_LIMIT = 500;

export class EngineError extends Error {}

function sortMods(mods: Mod[]): Mod[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  if (byId.size !== mods.length) throw new EngineError("duplicate mod id");
  const out: Mod[] = [];
  const seen = new Set<string>();
  const visit = (m: Mod, trail: string[]) => {
    if (seen.has(m.id)) return;
    if (trail.includes(m.id)) throw new EngineError(`mod dependency cycle: ${[...trail, m.id].join(" -> ")}`);
    for (const dep of m.requires ?? []) {
      const d = byId.get(dep);
      if (!d) throw new EngineError(`mod "${m.id}" requires missing mod "${dep}"`);
      visit(d, [...trail, m.id]);
    }
    seen.add(m.id);
    out.push(m);
  };
  for (const m of mods) visit(m, []);
  return out;
}

export function createEngine(modList: Mod[]): Engine {
  const mods = sortMods(modList);
  const actions = new Map<string, ActionDef>();
  const phases = new Map<string, PhaseDef>();
  const locations = new Map<string, LocationDef>();
  const factors = new Map<string, FactorDef[]>();
  const scenes: SceneDef[] = [];
  const handlers = new Map<string, { handler: EventHandler; priority: number; seq: number }[]>();
  const invariants: { id: string; check: Invariant }[] = [];
  let seq = 0;

  const unique = <T>(map: Map<string, T>, kind: string, id: string, def: T) => {
    if (map.has(id)) throw new EngineError(`${kind} "${id}" registered twice`);
    map.set(id, def);
  };

  const apiFor = (modId: string): ModApi => ({
    modId,
    actions: { register: (def) => unique(actions, "action", def.id, def) },
    phases: { register: (def) => unique(phases, "phase", def.id, def) },
    locations: { register: (def) => unique(locations, "location", def.id, def) },
    formulas: {
      addFactor(formula, def) {
        const list = factors.get(formula) ?? [];
        if (list.some((f) => f.id === def.id)) throw new EngineError(`factor "${def.id}" registered twice in "${formula}"`);
        list.push(def);
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        factors.set(formula, list);
      },
    },
    scenes: {
      register(def) {
        if (scenes.some((s) => s.id === def.id)) throw new EngineError(`scene "${def.id}" registered twice`);
        scenes.push(def);
        scenes.sort((a, b) => b.priority - a.priority);
      },
    },
    events: {
      on(type, handler, priority = 0) {
        const list = handlers.get(type) ?? [];
        list.push({ handler, priority, seq: seq++ });
        list.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
        handlers.set(type, list);
      },
    },
    invariants: { add: (id, check) => void invariants.push({ id: `${modId}:${id}`, check }) },
  });

  const sortedPhases = () => [...phases.values()].sort((a, b) => a.order - b.order);

  const view: EngineView = {
    mods: mods.map((m) => ({ id: m.id, version: m.version })),
    phases: sortedPhases,
    location: (id) => locations.get(id),
    locations: () => [...locations.values()],
    actionDef: (id) => actions.get(id),
    listActions(state) {
      const out: Action[] = [];
      for (const def of actions.values()) out.push(...def.enumerate(state, view));
      return out;
    },
    evaluate(formula, state, input): FormulaResult {
      const rows = [];
      let total = 0;
      for (const f of factors.get(formula) ?? []) {
        const value = f.eval(state, input, view);
        if (value === null) continue;
        if (!Number.isFinite(value)) throw new EngineError(`factor "${f.id}" in "${formula}" returned ${value}`);
        rows.push({ id: f.id, labelKey: f.labelKey, value });
        total += value;
      }
      return { formula, rows, total };
    },
    currentScene(state): SceneDesc | null {
      for (const s of scenes) {
        const desc = s.match(state, view);
        if (desc) return desc;
      }
      return null;
    },
    checkInvariants(state) {
      const out: string[] = [];
      for (const inv of invariants) {
        const msg = inv.check(state, view);
        if (msg) out.push(`${inv.id}: ${msg}`);
      }
      return out;
    },
  };

  // --- core actions and invariants, registered through the same API as mods ---
  const core = apiFor("core");
  core.actions.register({
    id: CORE_ADVANCE,
    labelKey: "core.action.advance",
    enumerate(state) {
      const phase = phases.get(state.time.phase);
      return phase?.canLeave && !phase.canLeave(state, view) ? [] : [{ type: CORE_ADVANCE }];
    },
    apply(ctx) {
      const list = sortedPhases();
      const i = list.findIndex((p) => p.id === ctx.state.time.phase);
      const from = ctx.state.time.phase;
      ctx.emit("phase:exit", { phase: from });
      const last = i === list.length - 1;
      if (last) ctx.emit("day:end", { day: ctx.state.time.day });
      ctx.emit("core:setPhase", { phase: list[last ? 0 : i + 1]!.id, newDay: last });
    },
  });
  // Phase switch is itself an event so that exit handlers run before the clock moves.
  core.events.on(
    "core:setPhase",
    (ctx, e) => {
      const { phase, newDay } = e.payload as { phase: string; newDay: boolean };
      if (newDay) {
        ctx.state.time.day += 1;
        ctx.emit("day:start", { day: ctx.state.time.day });
      }
      ctx.state.time.phase = phase;
      ctx.emit("phase:enter", { phase });
    },
    1000,
  );
  core.actions.register({
    id: CORE_MOVE,
    labelKey: "core.action.move",
    describe: (action) => ({ key: "core.action.move", params: { to: `loc.${action.payload!.to}` } }),
    enumerate(state) {
      const out: Action[] = [];
      for (const [actor, at] of Object.entries(state.where)) {
        if (!state.mods.core.controllable.includes(actor)) continue;
        for (const to of locations.get(at)?.links ?? []) out.push({ type: CORE_MOVE, actor, payload: { to } });
      }
      return out;
    },
    apply(ctx, action) {
      const actor = action.actor!;
      const from = ctx.state.where[actor]!;
      const to = action.payload!.to as string;
      ctx.state.where[actor] = to;
      ctx.emit("entity:moved", { id: actor, from, to });
    },
  });
  core.invariants.add("phase-known", (s) => (phases.has(s.time.phase) ? null : `unknown phase "${s.time.phase}"`));
  core.invariants.add("where-known", (s) => {
    for (const [id, loc] of Object.entries(s.where)) if (!locations.has(loc)) return `"${id}" is in unknown location "${loc}"`;
    return null;
  });
  core.invariants.add("numbers-finite", (s) => findBadNumber(s, "state"));

  for (const m of mods) m.register(apiFor(m.id));

  for (const loc of locations.values())
    for (const link of loc.links) if (!locations.has(link)) throw new EngineError(`location "${loc.id}" links to unknown "${link}"`);

  const sameAction = (a: Action, b: Action) =>
    a.type === b.type && a.actor === b.actor && JSON.stringify(a.payload ?? {}) === JSON.stringify(b.payload ?? {});

  return {
    ...view,
    init(seed, setup) {
      const list = sortedPhases();
      if (list.length === 0) throw new EngineError("no phases registered");
      const draft: GameState = {
        seed,
        rng: seed | 0,
        turn: 0,
        time: { day: 1, phase: list[0]!.id, minute: 0 },
        where: {},
        mods: { core: { controllable: [] } },
        log: [],
      };
      for (const m of mods) draft.mods[m.id] = m.initState ? m.initState() : {};
      // game:init lets mods place entities and roll starting values
      return run(draft, (ctx) => {
        ctx.emit("game:init", setup ? { setup } : undefined);
        ctx.emit("day:start", { day: 1 });
        ctx.emit("phase:enter", { phase: list[0]!.id });
      });
    },
    dispatch(state, action) {
      const def = actions.get(action.type);
      if (!def) throw new EngineError(`unknown action "${action.type}"`);
      const allowed = def.accepts ? def.accepts(state, action, view) : def.enumerate(state, view).some((a) => sameAction(a, action));
      if (!allowed)
        throw new EngineError(`action not available: ${JSON.stringify(action)}`);
      return run(state, (ctx) => {
        ctx.state.turn += 1;
        def.apply(ctx, action);
      });
    },
  };

  function run(state: GameState, body: (ctx: Ctx) => void): GameState {
    return produce(state, (draft) => {
      const queue: GameEvent[] = [];
      let processed = 0;
      const drain = () => {
        while (queue.length > 0) {
          if (++processed > MAX_EVENTS_PER_DISPATCH) throw new EngineError("event loop: too many events in one dispatch");
          const event = queue.shift()!;
          for (const h of handlers.get(event.type) ?? []) h.handler(ctx, event);
        }
      };
      const ctx: Ctx = {
        state: draft as GameState,
        rng: makeRng(draft),
        engine: view,
        emit: (type, payload) => void queue.push({ type, payload }),
        flush: () => drain(),
        log(key, params, tags) {
          draft.log.push({ turn: draft.turn, day: draft.time.day, phase: draft.time.phase, minute: draft.time.minute, key, params, ...(tags ? { tags } : {}) });
          if (draft.log.length > LOG_LIMIT) draft.log.splice(0, draft.log.length - LOG_LIMIT);
        },
      };
      body(ctx);
      drain();
    });
  }
}

function findBadNumber(value: unknown, path: string): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? null : `${path} = ${value}`;
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const bad = findBadNumber(v, `${path}.${k}`);
      if (bad) return bad;
    }
  }
  return null;
}
