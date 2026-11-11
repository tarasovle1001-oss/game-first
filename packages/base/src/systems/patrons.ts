import type { Ctx, ModApi } from "@tc/core";
import { content, patronType } from "../content";
import { bs } from "../state";
import type { Patron } from "../state";

const POOL_LIMIT = 40;
const FORGET_AFTER_DAYS = 14;

/** A first name nobody she knows carries yet; falls back to any name when all are taken. */
function freeName(ctx: Ctx): number {
  const used = new Set(Object.values(bs(ctx.state).patrons).map((p) => p.name));
  const free = content.names.map((_, i) => i).filter((i) => !used.has(i));
  return free.length > 0 ? ctx.rng.pick(free) : ctx.rng.int(0, content.names.length - 1);
}

/** A new person walks in: everything is rolled once from his type and then stays. */
export function generatePatron(ctx: Ctx): Patron {
  const b = bs(ctx.state);
  const type = ctx.rng.weighted(content.patronTypes.map((t) => ({ item: t, weight: t.weight })));
  const roll = ([min, max]: [number, number]) => ctx.rng.int(min, max);
  const approach = ctx.rng.weighted(
    (Object.entries(type.approach) as [Patron["approach"], number][]).map(([item, weight]) => ({ item, weight })),
  );
  const patron: Patron = {
    id: `p${b.nextPatron++}`,
    type: type.id,
    name: freeName(ctx),
    age: roll(type.age),
    build: ctx.rng.pick(type.builds),
    size: roll(type.size),
    stamina: roll(type.stamina),
    traits: {
      persistence: roll(type.traits.persistence),
      charm: roll(type.traits.charm),
      honesty: roll(type.traits.honesty),
      jealousy: roll(type.traits.jealousy),
      generosity: roll(type.traits.generosity),
    },
    approach,
    regular: false,
    memory: { visits: 0, lastDay: 0, served: 0, tipsTotal: 0, affinity: 0, interest: ctx.rng.int(5, 35), tier: -1, acts: {}, refusals: 0, hasNumber: false, sizeKnown: false, orgasms: 0 },
  };
  b.patrons[patron.id] = patron;
  return patron;
}

/** Someone who has been here before and is not in the room tonight. Null if nobody fits. */
export function pickReturning(ctx: Ctx, presentIds: string[]): Patron | null {
  const b = bs(ctx.state);
  const day = ctx.state.time.day;
  const pool = Object.values(b.patrons).filter((p) => p.memory.visits > 0 && p.memory.lastDay < day && !presentIds.includes(p.id));
  if (pool.length === 0) return null;
  // regulars and men who like her come back more often
  return ctx.rng.weighted(pool.map((p) => ({ item: p, weight: 1 + (p.regular ? 3 : 0) + p.memory.interest / 25 + Math.max(0, p.memory.affinity) / 25 })));
}

export function registerPatrons(api: ModApi) {
  // Forget one-time visitors, keep regulars and anyone with history that matters.
  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    const day = ctx.state.time.day;
    const all = Object.values(b.patrons);
    const keep = (p: Patron) => p.regular || day - p.memory.lastDay <= FORGET_AFTER_DAYS;
    let removable = all.filter((p) => !keep(p));
    if (all.length - removable.length > POOL_LIMIT) {
      const extra = all
        .filter((p) => keep(p) && !p.regular)
        .sort((a, c) => a.memory.lastDay - c.memory.lastDay || a.id.localeCompare(c.id))
        .slice(0, all.length - removable.length - POOL_LIMIT);
      removable = removable.concat(extra);
    }
    for (const p of removable) {
      delete b.patrons[p.id];
      ctx.emit("patron:forgotten", { id: p.id });
    }
  });

  api.invariants.add("patron-data", (s) => {
    for (const p of Object.values(bs(s).patrons)) {
      if (p.age < 18) return `${p.id} is under 18`;
      if (!content.patronTypes.some((t) => t.id === p.type)) return `${p.id} has unknown type "${p.type}"`;
      if (p.memory.interest < 0 || p.memory.interest > 100) return `${p.id} interest out of range`;
      if (p.memory.affinity < -100 || p.memory.affinity > 100) return `${p.id} affinity out of range`;
    }
    return null;
  });
}

export { patronType };
