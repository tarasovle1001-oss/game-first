// How much she has had of being asked and pawed at. It builds through the day from guests and from
// her husband alike, takes the edge off every yes, and past a point she simply does not want hands on her.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND } from "../state";
import { CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";

const A = content.manners.talk.annoy;
export const annoyanceOf = (state: GameState) => bs(state).heroine.annoyance ?? 0;
/** "tired" of it: touching is turned down. "done": she snaps. */
export const annoyedLevel = (state: GameState): "calm" | "tired" | "done" => (annoyanceOf(state) >= A.done ? "done" : annoyanceOf(state) >= A.tired ? "tired" : "calm");
export function annoy(ctx: Ctx, amount: number) {
  const h = bs(ctx.state).heroine;
  // a woman sure of herself shrugs more of it off
  const got = amount > 0 ? amount * (1 - (h.traits.confidence - 50) / 200) : amount;
  h.annoyance = clamp((h.annoyance ?? 0) + got);
}

export function registerAnnoy(api: ModApi) {
  api.events.on("encounter:proposed", (ctx, e) => {
    const { act, verdict } = e.payload as { act: string; verdict: string };
    const tier = content.acts.find((a) => a.id === act)?.tier ?? 0;
    if (tier < 2) return;
    annoy(ctx, verdict === "refuse" ? A.guestRefused : verdict === "hesitant" ? A.guestHesitant : A.guestEager);
  });
  api.events.on("encounter:pushed", (ctx, e) => annoy(ctx, e.payload!.far ? A.guestPushedFar : A.guestPushed));
  api.events.on("encounter:came", (ctx) => annoy(ctx, -A.cameRelief));
  api.events.on("husband:refused", (ctx) => annoy(ctx, A.husbandRefused));
  api.events.on("couple:talk", (ctx, e) => {
    const { do: what, ok } = e.payload as { do: string; ok: boolean };
    const o = content.manners.talk.options.find((x) => x.id === what);
    if (o?.group === "touch") annoy(ctx, ok ? A.husbandTouch : A.husbandRefused);
  });
  api.events.on("bare:asked", (ctx, e) => annoy(ctx, e.payload!.ok ? A.husbandAsk : A.husbandRefused));
  api.events.on("shift:tick", (ctx) => {
    if (!bs(ctx.state).encounter) annoy(ctx, -A.coolShift);
  });
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase === "prep") bs(ctx.state).heroine.annoyance = (bs(ctx.state).heroine.annoyance ?? 0) * A.keptOvernight;
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.annoyed",
    labelKey: "factor.consent.annoyed",
    order: 16,
    eval: (state, input) => {
      const act = content.acts.find((a) => a.id === input.act);
      const n = annoyanceOf(state);
      if (!act || n < 5 || (input.partner !== HUSBAND && act.tier < 2)) return null;
      return -n * A.consent;
    },
  });
  api.invariants.add("annoyance", (s) => (annoyanceOf(s) >= 0 && annoyanceOf(s) <= 100 ? null : `annoyance out of range: ${annoyanceOf(s)}`));
}
