// A size above what her body is used to. Whether it goes in is a try (body.ts: tryTake); this file is what happens around
// it: what is said and thought, and what they do instead when it does not go in.
import type { Ctx } from "@tc/core";
import { actOff } from "./kinks";
import { actById, content } from "../content";
import type { Act } from "../content/schema";
import { bs } from "../state";
import { entersZone, resolveBody, sizeStage, stepsAbove, tryTake } from "./body";
import type { ActOutcome } from "./body";
import type { Take } from "./body";
import { think } from "./mind";
import { sawSize } from "./body";

const T = content.body.take;

/** What they do when it does not go in: of the ways round it, the one she is best at. */
export function insteadOf(ctx: Ctx): Act {
  const h = bs(ctx.state).heroine;
  const allowed = T.instead.filter((a) => !actOff(ctx.state, a));
  const best = [...(allowed.length ? allowed : T.instead)].sort((a, b) => (h.skills[b] ?? 0) + (h.tastes.acts[b] ?? 0) - ((h.skills[a] ?? 0) + (h.tastes.acts[a] ?? 0)))[0]!;
  return actById(best);
}

/**
 * A man of this size wants an act. Returns the act that actually happens: the same one when it fits or the try works,
 * otherwise a way round it. Says how it went (`name`: who he is; `tags`: e.g. unseen) and what she thinks.
 * `warm`: what was done to that place earlier in the scene.
 */
export function settleSize(ctx: Ctx, act: Act, size: number, name: number | string, opts: { warm?: number; tags?: string[]; quiet?: boolean; noInstead?: boolean } = {}): { act: Act; take: Take } {
  const zone = entersZone(act);
  if (!zone) return { act, take: "fits" };
  const h = bs(ctx.state).heroine;
  const day = ctx.state.time.day;
  // what went in today goes in today: the same man in another pose is not a new try, and "more than ever" is said once
  if (h.tookToday?.day === day && (h.tookToday[zone] ?? 0) >= size) return { act, take: "fits" };
  const steps = stepsAbove(ctx.state, zone, size);
  const take = tryTake(ctx, zone, size, opts.warm ?? 0);
  if (take === "fits") return { act, take };
  const who = { name: `@name:${name}`, act: `act.${act.id}`, steps };
  ctx.emit("body:take", { zone, take, size, stage: sizeStage(size), steps });
  if (take === "took") {
    h.tookToday = { ...(h.tookToday?.day === day ? h.tookToday : { day }), [zone]: Math.max(h.tookToday?.day === day ? (h.tookToday[zone] ?? 0) : 0, size) };
    if (!opts.quiet) ctx.log(`log.take.took.${ctx.rng.int(1, 3)}`, who, opts.tags);
    think(ctx, steps >= 2 ? "thought.take.took.far" : "thought.take.took", true);
    return { act, take };
  }
  const other = insteadOf(ctx);
  h.wantSize = Math.max(h.wantSize ?? 0, size); // something to work toward: the drawer, the shop
  if (!opts.quiet) {
    ctx.log(`log.take.${take}.${ctx.rng.int(1, 3)}`, who, opts.tags);
    // who names the way round it: a woman sure of herself or keen on him says it first
    const hers = ctx.rng.chance(Math.min(0.9, Math.max(0.1, (h.traits.confidence + h.sizeTaste) / 200)));
    if (!opts.noInstead) ctx.log(`log.take.instead.${hers ? "her" : "him"}`, { ...who, other: `act.${other.id}` }, opts.tags);
  }
  think(ctx, `thought.take.${take}`, true);
  return { act: other, take };
}

/** Away from the screen (a lover in town, a room upstairs): the same try, told only by what she thinks; then the act that did happen. */
export function resolveSized(ctx: Ctx, act: Act, partner: { size: number; minutes: number }, name: number | string = ""): ActOutcome & { act: Act } {
  const done = settleSize(ctx, act, partner.size, name, { quiet: true }).act;
  return { ...resolveBody(ctx, done, partner), act: done };
}

/** A man shows her what he has (or she finds out some other way). What she thinks depends on how it compares with her husband and with her bar. */
export function sizeShown(ctx: Ctx, size: number) {
  const b = bs(ctx.state);
  const h = b.heroine;
  const before = h.seenSize ?? b.husband.size;
  const first = h.seenSize === undefined; // until now her husband was all she knew
  sawSize(ctx, size);
  const up = sizeStage(size) - sizeStage(b.husband.size);
  if (up <= 0) return think(ctx, "thought.size.small", true);
  if (first) return think(ctx, "thought.size.first", true);
  think(ctx, size > before ? "thought.size.record" : stepsAbove(ctx.state, "vagina", size) >= 3 ? "thought.size.toobig" : "thought.size.seen", true);
}
