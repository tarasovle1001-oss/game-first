import { detail } from "./glance";
import { sizeClass } from "./body";
import type { Ctx, ModApi } from "@tc/core";
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
    detail(ctx, { id: "toy_drawer", who: WIFE, tags: { tsize: String(sizeClass(next.size)) }, secret: b.mode === "hidden" });
    ctx.emit("solo:bought", { toy: next.id, price: next.price });
  });

  // In the afternoon she shuts herself in for a while: the decision is taken in the morning, the time is hers.
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep") return;
    const b = bs(ctx.state);
    const h = b.heroine;
    b.solo = undefined;
    if (b.soloDay === ctx.state.time.day || !b.day) return;
    // wanting drives her to it; with a toy in the drawer she also simply takes it out now and then, by how much she needs
    const drive = So.idleBase + h.traits.libido * So.idlePerLibido + h.frustration * So.idlePerFrustration;
    if (h.frustration < So.at && !(owned(b).length > 0 ? ctx.rng.chance(drive) : ctx.rng.chance(drive * So.fingersShare))) return;
    // some time in the afternoon, when she has a moment
    b.solo = { at: ctx.rng.int(30, Math.max(31, b.day.left - So.minutes[1])), zone: "vagina" };
  });
  api.events.on("prep:tick", (ctx) => {
    const b = bs(ctx.state);
    const day = b.day;
    if (!b.solo || b.solo.started !== undefined || !day || day.left > b.solo.at) return;
    if (!day.her || ["away", "with_you", "shopping", "quiet", "wash"].includes(day.her.task) || day.herOut || b.night) return;
    if (ctx.state.where[HUSBAND] === BED) return; // not with him in the room
    const h = b.heroine;
    // the back way is for a woman who likes it, or whom a husband has taught to
    const anal = (h.tastes.acts.anal ?? 0) > 0 || h.body.anus.stretch >= 15 ? ctx.rng.chance(So.analChance) : false;
    b.solo.zone = anal ? "anus" : "vagina";
    b.solo.started = ctx.state.time.minute;
    b.soloDay = ctx.state.time.day;
    const minutes = ctx.rng.int(So.minutes[0], So.minutes[1]);
    day.her = { task: "solo", left: minutes };
    ctx.state.where[WIFE] = BED;
    const heard = husbandNextTo(ctx.state, BED);
    ctx.log(heard ? "log.solo.goes.heard" : "log.solo.goes", undefined, heard || b.mode !== "hidden" ? undefined : ["unseen"]);
  });
  // He opens the bedroom door on her.
  api.events.on("entity:moved", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.id !== HUSBAND || e.payload!.to !== BED || b.day?.her?.task !== "solo" || !b.solo) return;
    const h = b.heroine;
    const easy = b.mode === "open" || h.traits.openness >= So.watchOpenness || (h.marriage.desire >= 60 && h.arousal >= 60);
    if (easy) {
      // she does not stop: he may stay and look
      b.solo.watched = true;
      changeHeroine(ctx, "arousal", 6, "watched");
      ctx.log("log.solo.walkin.stays");
      return;
    }
    // "I'm changing!": she stops, he is out of the door, and she is cross with him for a while
    ctx.state.where[HUSBAND] = e.payload!.from as string;
    h.marriage.resent = clamp(h.marriage.resent + So.interrupted.resent);
    changeHeroine(ctx, "mood", So.interrupted.mood, "interrupted");
    ctx.log("log.solo.walkin.out");
    finishSolo(ctx, true);
  });
  api.events.on("solo:end", (ctx) => finishSolo(ctx, false));
  // five o'clock comes in the middle of it: she finishes quickly and comes down
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "prep" && bs(ctx.state).day?.her?.task === "solo") finishSolo(ctx, false);
  }, 60);

  /** What a session does for her: by how long she had, and whether he burst in. */
  const finishSolo = (ctx: Ctx, cut: boolean) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const so = b.solo;
    if (!so || so.started === undefined || so.done) return;
    so.done = true;
    if (b.day?.her?.task === "solo") b.day.her.left = 0;
    const zone = so.zone as "vagina" | "anus";
    const anal = zone === "anus";
    const toy = owned(b).filter((t) => t.size <= fitOf(ctx.state, zone) + S.toyStretchAbove).sort((x, y) => y.size - x.size)[0];
    const heard = so.watched || ctx.state.where[HUSBAND] === BED || husbandNextTo(ctx.state, BED);
    const tags = heard || b.mode !== "hidden" ? undefined : ["unseen"];
    if (cut) {
      // nothing came of it: she is more wound up than before
      h.frustration = clamp(h.frustration + 3);
      changeHeroine(ctx, "arousal", 8, "interrupted");
      ctx.emit("solo:did", { zone, cut: true });
      return;
    }
    if (!toy) {
      // only her fingers: it takes the edge off and changes nothing in her
      h.frustration = clamp(h.frustration - So.relief / 2);
      h.orgasms += 1;
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
    ctx.log(`log.solo.${zone}${heard ? ".heard" : ""}`, { toy: `toy.${toy.id}` }, tags);
    detail(ctx, { id: anal ? "toy_a" : "toy_v", who: WIFE, tags: { tsize: String(sizeClass(toy.size)), gape: String(Math.min(3, Math.floor(h.body[anal ? "anus" : "vagina"].stretch / 25))) }, secret: !heard });
    detail(ctx, { id: "xray_toy", who: WIFE, tags: { tsize: String(sizeClass(toy.size)), at: anal ? "a" : "v" }, secret: !heard });
    ctx.emit("solo:did", { zone, toy: toy.id, size: toy.size, heard });
  };
}
