// Who she is in bed with her husband: how she speaks to him (by her power over him), why she reaches for him tonight,
// and what he owes her. The scene itself is in marriage.ts; this is the part that decides.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";

const Hn = content.intimacy.her;

/** 0..3: she asks, suggests, says, orders. From her power over him. */
export const toneOf = (state: GameState) => Hn.tones.filter((from) => bs(state).power >= from).length;

/** One more thing he owes her. Said aloud once she has any say; before that it is only a thought. */
export function owe(ctx: Ctx, why: "early" | "wanting" | "pestering" | "declined" | "refused") {
  const b = bs(ctx.state);
  if ((b.owes ?? 0) >= Hn.owes.max) return;
  b.owes = (b.owes ?? 0) + 1;
  b.owedDay = ctx.state.time.day;
  const aloud = b.power >= Hn.owes.punishPower;
  ctx.log(`log.owes.${why}${aloud ? "" : ".thought"}`, { n: b.owes }, aloud ? undefined : ["unseen", "thought"]);
  ctx.emit("her:owed", { why, n: b.owes });
}

/** Why she reaches for him tonight, once she does. */
export function whyTonight(ctx: Ctx): "need" | "guest" | "punish" | "reward" | "play" {
  const b = bs(ctx.state);
  const h = b.heroine;
  const W = Hn.why;
  if ((b.owes ?? 0) > 0 && b.power >= Hn.owes.punishPower) return "punish";
  if (b.mode === "open" && h.lastBig?.day === ctx.state.time.day && h.arousal >= W.guestArousal) return "guest";
  if (b.power >= W.playPower && ctx.rng.chance(W.playChance)) return "play";
  if ((b.owes ?? 0) === 0 && b.power >= W.rewardPower && h.mood >= W.rewardMood && h.marriage.desire >= W.rewardDesire) return "reward";
  return "need";
}

export function registerHerNight(api: ModApi) {
  // his failures are counted, and each gives her a little more say - in any mode
  api.events.on("bed:ended", (ctx, e) => {
    const b = bs(ctx.state);
    const { outcome, came } = e.payload as { outcome: string; came: boolean };
    const P = Hn.powerFrom;
    if (outcome === "too_soon" || outcome === "premature") {
      b.power = clamp(b.power + P.early);
      owe(ctx, "early");
    } else if (!came && ["left_wanting", "faked", "finished_herself", "by_hand", "went_soft"].includes(outcome)) {
      b.power = clamp(b.power + P.leftWanting);
      if (outcome !== "faked") owe(ctx, "wanting");
    }
  });
  api.events.on("husband:refused", (ctx) => {
    const b = bs(ctx.state);
    if ((b.night?.asks ?? 0) === Hn.owes.pester) {
      b.power = clamp(b.power + Hn.powerFrom.pestering);
      owe(ctx, "pestering");
    }
  });
  api.events.on("her:turned_down", (ctx) => {
    const b = bs(ctx.state);
    b.power = clamp(b.power + Hn.powerFrom.declined);
    owe(ctx, "declined");
  });
  // a good day and nothing new against him: she lets one go, and her grip loosens a little
  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    const O = Hn.owes;
    // a day with a man bigger than her husband: she comes home knowing a little better what he is not
    if (b.heroine.lastBig?.day === ctx.state.time.day) b.power = clamp(b.power + Hn.powerFrom.guest);
    if ((b.owes ?? 0) <= 0 || b.owedDay === ctx.state.time.day || b.heroine.mood < O.forgiveMood || !ctx.rng.chance(O.forgiveChance)) return;
    b.owes = (b.owes ?? 0) - 1;
    b.power = clamp(b.power - O.forgivePower);
    ctx.log("log.owes.forgiven", { n: b.owes });
  });
  // the morning after her tone has moved up a step: it shows in small things
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep") return;
    const b = bs(ctx.state);
    const tone = toneOf(ctx.state);
    if (tone > (b.toneSaid ?? 0)) {
      b.toneSaid = tone;
      ctx.log(`log.morning.tone.${tone}`);
    }
  });
}
