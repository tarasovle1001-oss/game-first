import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, useBody } from "./body";
import { actById } from "./encounters";
import { changeHeroine } from "./heroine";
import { husbandNextTo } from "./places";

const S = content.day.shop;
const So = S.solo;
const BED = "home.bedroom";

/**
 * Her own drawer. A woman who is left wanting and will not go to another man still has somewhere to take it:
 * she buys a toy out of her own tips, uses it before the doors open, and when she has outgrown it she buys the next one.
 * This is how her body changes in a faithful game, and what her purse is for.
 */
export function registerSolo(api: ModApi) {
  const owned = (b: ReturnType<typeof bs>) => S.toys.filter((t) => b.toys.includes(t.id)).sort((x, y) => x.size - y.size);

  // Morning: is it time for a bigger one, and can she pay for it herself?
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep") return;
    const b = bs(ctx.state);
    const h = b.heroine;
    const mine = owned(b);
    const biggest = mine[mine.length - 1]?.size ?? 0;
    const fit = Math.max(fitOf(ctx.state, "vagina"), biggest ? 0 : So.firstSize);
    // none yet and she is wanting; or what she has no longer does anything for her
    const wants = biggest === 0 ? h.frustration >= So.buyAt : fit >= biggest - So.outgrown && h.frustration >= So.buyAt / 2;
    if (!wants) return;
    const next = S.toys.filter((t) => !b.toys.includes(t.id) && t.size > biggest && t.size >= So.firstSize && t.size <= fit + S.toyStretchAbove).sort((x, y) => x.size - y.size)[0];
    if (!next || b.purse < next.price) return;
    b.purse -= next.price;
    b.toys.push(next.id);
    b.herToys = [...(b.herToys ?? []), next.id];
    ctx.log("log.solo.bought", { toy: `toy.${next.id}`, price: next.price }, b.mode === "hidden" ? ["unseen"] : undefined);
    ctx.emit("solo:bought", { toy: next.id, price: next.price });
  });

  // Before the doors open she shuts herself in for a while.
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "shift") return;
    const b = bs(ctx.state);
    const h = b.heroine;
    if (h.frustration < So.at || b.soloDay === ctx.state.time.day) return;
    // the back way is for a woman who likes it, or whom a husband has taught to
    const anal = (h.tastes.acts.anal ?? 0) > 0 || h.body.anus.stretch >= 15 ? ctx.rng.chance(So.analChance) : false;
    const zone = anal ? "anus" : "vagina";
    const toy = owned(b).filter((t) => t.size <= fitOf(ctx.state, zone) + S.toyStretchAbove).sort((x, y) => y.size - x.size)[0];
    b.soloDay = ctx.state.time.day;
    const heard = ctx.state.where[HUSBAND] === BED || husbandNextTo(ctx.state, BED);
    const tags = heard || b.mode !== "hidden" ? undefined : ["unseen"];
    if (!toy) {
      // only her fingers: it takes the edge off and changes nothing in her
      h.frustration = clamp(h.frustration - So.relief / 2);
      changeHeroine(ctx, "arousal", -h.arousal * 0.5, "alone");
      ctx.log(heard ? "log.solo.fingers.heard" : "log.solo.fingers", undefined, tags);
      ctx.emit("solo:did", { zone });
      return;
    }
    useBody(ctx, actById(anal ? "anal" : "sex"), toy.size);
    h.frustration = clamp(h.frustration - So.relief);
    h.orgasms += 1;
    h.satisfied = S.toySatisfied;
    changeHeroine(ctx, "arousal", -h.arousal * 0.8, "alone");
    changeHeroine(ctx, "energy", -3, "alone");
    h.sizeTaste = clamp(h.sizeTaste + Math.max(0, toy.size - b.husband.size) * 0.4);
    b.lastToy = { id: toy.id, size: toy.size, zone, day: ctx.state.time.day };
    ctx.state.where[WIFE] = ctx.state.where[WIFE] ?? BED;
    ctx.log(`log.solo.${zone}${heard ? ".heard" : ""}`, { toy: `toy.${toy.id}` }, tags);
    ctx.emit("solo:did", { zone, toy: toy.id, size: toy.size, heard });
  });
}
