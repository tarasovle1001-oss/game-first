// Who she is in bed with her husband: how she speaks to him (by her power over him), why she reaches for him tonight,
// and what he owes her. The scene itself is in marriage.ts; this is the part that decides.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";

const Hn = content.intimacy.her;

/** 0..3: she asks, suggests, says, orders. From her power over him. */
export const toneOf = (state: GameState) => Hn.tones.filter((from) => bs(state).power >= from).length;

/** The cruel streak sleeps until she has some hold on him: a shy wife with no say does not sneer at him on day three because of a trait she has not grown into. */
export const cruelNow = (b: { power: number; heroine: { latents: Record<string, true> } }) => b.heroine.latents.cruel_streak !== undefined && b.power >= Hn.cruelFrom;

/** One more thing he owes her. Said aloud once she has any say; before that it is only a thought. */
export function owe(ctx: Ctx, why: "early" | "wanting" | "pestering" | "declined" | "refused" | "more" | "soft") {
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
    const { outcome, came, alone } = e.payload as { outcome: string; came: boolean; alone?: boolean };
    if (alone) return; // he saw to himself after her "no": that was her choice
    const P = Hn.powerFrom;
    if (outcome === "too_soon" || outcome === "premature") {
      b.power = clamp(b.power + P.early);
      owe(ctx, "early");
    } else if (!came && ["left_wanting", "faked", "finished_herself", "by_hand", "went_soft"].includes(outcome)) {
      b.power = clamp(b.power + P.leftWanting);
      if (outcome !== "faked") {
        const had = b.owes ?? 0;
        owe(ctx, outcome === "went_soft" ? "soft" : "wanting");
        if ((b.owes ?? 0) > had) b.owedNight = ctx.state.time.day;
      }
    } else if (came && b.owedNight === ctx.state.time.day && (b.owes ?? 0) > 0) {
      // he did not leave it at that: what was charged an hour ago is taken back
      b.owes = b.owes! - 1;
      b.owedNight = undefined;
      ctx.log("log.owes.made_up", { n: b.owes }, b.power >= Hn.owes.punishPower ? undefined : ["unseen", "thought"]);
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
