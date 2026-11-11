// What goes on in her head. Feelings build from what happens and fade with time; trust in her husband is its
// own thing, apart from wanting him; she is made of a few plain attributes; and every so often a feeling
// surfaces as a thought. All of it is derived from events other systems already emit.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { EMOTIONS } from "../content/schema";
import type { Emotion } from "../content/schema";
import { bs, clamp, HUSBAND } from "../state";
import { CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

const M = content.mind;
const G = M.gain as Record<string, Partial<Record<Emotion, number>> | number>;
export const ATTRS = ["charm", "wit", "stamina", "composure"] as const;
export type Attr = (typeof ATTRS)[number];
export { EMOTIONS };
export type { Emotion };

export const feelingOf = (state: GameState, e: Emotion) => bs(state).heroine.feel?.[e] ?? 0;
export const trustOf = (state: GameState) => bs(state).heroine.marriage.trust ?? M.trust.start;
export const attrOf = (state: GameState, a: Attr) => bs(state).heroine.attrs?.[a] ?? 50;
/** The feelings worth showing, strongest first. */
export const feelingsOf = (state: GameState): [Emotion, number][] =>
  EMOTIONS.map((e) => [e, feelingOf(state, e)] as [Emotion, number])
    .filter(([, v]) => v >= M.showFrom)
    .sort((a, b) => b[1] - a[1]);

const SOFT: Emotion[] = ["fear", "shame"]; // a composed woman takes less of these in
/** One feeling moves. A big enough surge may come up as a thought. */
export function feel(ctx: Ctx, e: Emotion, amount: number, scale = 1) {
  const h = bs(ctx.state).heroine;
  let got = amount * scale;
  if (got > 0 && SOFT.includes(e)) got *= 1 - (attrOf(ctx.state, "composure") - 50) * M.attributes.composure.feel;
  if (!got) return;
  h.feel = h.feel ?? {};
  const before = h.feel[e] ?? 0;
  h.feel[e] = clamp(before + got);
  if (h.feel[e] === 0) delete h.feel[e];
  if (got >= M.thoughts.from) think(ctx, `thought.${e}`);
}
const feelAll = (ctx: Ctx, key: string, scale = 1) => {
  const bag = G[key];
  if (!bag || typeof bag === "number") return;
  for (const [e, v] of Object.entries(bag) as [Emotion, number][]) feel(ctx, e, v, v > 0 ? scale : 1);
};
export function trust(ctx: Ctx, key: string) {
  const m = bs(ctx.state).heroine.marriage;
  const d = M.trust.change[key];
  if (d) m.trust = clamp((m.trust ?? M.trust.start) + d);
}

const THOUGHT_LINES = 3;
/** Something she thinks and does not say. Seen only in transparent mode; not more often than every so often. */
export function think(ctx: Ctx, key: string, force = false) {
  const b = bs(ctx.state);
  const now = ctx.state.time.day * 1440 + ctx.state.time.minute;
  if (!force && b.thoughtAt !== undefined && now >= b.thoughtAt && now - b.thoughtAt < M.thoughts.gap) return;
  b.thoughtAt = now;
  ctx.log(`${key}.${ctx.rng.int(1, THOUGHT_LINES)}`, undefined, ["unseen", "thought"]);
}

/** What she is after right now, each 0..100. Derived, never stored. */
export function wantsOf(state: GameState): Record<"release" | "him" | "rest" | "attention" | "thrill", number> {
  const h = bs(state).heroine;
  const f = (e: Emotion) => feelingOf(state, e);
  return {
    release: clamp(h.arousal * 0.6 + h.frustration * 0.6 - h.satisfied * 0.5),
    him: clamp(h.marriage.desire * 0.7 + f("longing") * 0.4 + f("tenderness") * 0.3 - h.marriage.resent * 0.5 - f("anger") * 0.4 - f("contempt") * 0.4),
    rest: clamp(100 - h.energy),
    attention: clamp(35 + h.marriage.resent * 0.7 + f("longing") * 0.3 - f("tenderness") * 0.7),
    thrill: clamp(h.traits.openness * 0.5 + (100 - h.traits.fidelity) * 0.4 + h.arousal * 0.2 - f("guilt") * 0.5 - f("fear") * 0.5),
  };
}
/** How much rope she thinks he has given her, 0..100: the average of what she believes he allows. */
export function latitudeOf(state: GameState): number {
  const vals = Object.values(bs(state).expect);
  return vals.length === 0 ? 50 : clamp(50 + vals.reduce((s, v) => s + v, 0) / vals.length / 2);
}

type Diary = NonNullable<ReturnType<typeof bs>["diary"]>;
const page = (ctx: Ctx): Diary[number] => {
  const b = bs(ctx.state);
  b.diary = b.diary ?? [];
  let p = b.diary.find((d) => d.day === ctx.state.time.day);
  if (!p) {
    p = { day: ctx.state.time.day, with: {}, seen: {}, came: 0 };
    b.diary.push(p);
    if (b.diary.length > 7) b.diary.shift();
  }
  return p;
};
/** One more line in the day's record, and in the running totals. */
function note(ctx: Ctx, who: string, act: string, seen: boolean) {
  const b = bs(ctx.state);
  const p = page(ctx);
  p.with[who] = p.with[who] ?? {};
  p.with[who]![act] = (p.with[who]![act] ?? 0) + 1;
  if (seen) p.seen[who] = true;
  // the running count is about what went somewhere: small talk and a drink are not "times"
  if ((content.acts.find((x) => x.id === act)?.tier ?? 0) < 2) return;
  b.tally = b.tally ?? { acts: {}, partners: {}, came: 0 };
  b.tally.acts[act] = (b.tally.acts[act] ?? 0) + 1;
  b.tally.partners[who] = (b.tally.partners[who] ?? 0) + 1;
}

export function registerMind(api: ModApi) {
  api.events.on("game:init", (ctx, e) => {
    const h = bs(ctx.state).heroine;
    const s = M.attributes.spread;
    h.attrs = Object.fromEntries(ATTRS.map((a) => [a, clamp(50 + ctx.rng.int(-s, s))])) as Record<Attr, number>;
    h.marriage.trust = M.trust.start;
    h.feel = {};
    const set = ((e.payload?.setup as Record<string, unknown> | undefined)?.base as { attrs?: Partial<Record<Attr, number>> } | undefined)?.attrs;
    for (const a of ATTRS) if (typeof set?.[a] === "number") h.attrs[a] = clamp(set[a]!);
    h.snap = { day: 1, traits: { ...h.traits } };
  }, -90);

  // --- feelings fade ---------------------------------------------------------------------------
  const fade = (ctx: Ctx, tens: number) => {
    const h = bs(ctx.state).heroine;
    for (const e of EMOTIONS) {
      const v = h.feel?.[e];
      if (!v) continue;
      const left = v - M.emotions[e]!.fade * tens;
      if (left <= 0) delete h.feel![e];
      else h.feel![e] = left;
    }
  };
  api.events.on("shift:tick", (ctx) => fade(ctx, 1));
  api.events.on("prep:tick", (ctx) => fade(ctx, 1));
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep" || ctx.state.time.day === 1) return;
    const b = bs(ctx.state);
    const h = b.heroine;
    for (const k of EMOTIONS) {
      if (!h.feel?.[k]) continue;
      const left = Math.round(h.feel[k]! * M.emotions[k]!.night * 10) / 10;
      if (left < 1) delete h.feel[k];
      else h.feel[k] = left;
    }
    feel(ctx, "longing", h.frustration * (G.frustrationToLonging as number));
    // once a week: where she was, to see where she is going
    if (!h.snap || ctx.state.time.day - h.snap.day >= 7) h.snap = { day: ctx.state.time.day, traits: { ...h.traits } };
    // she wakes up and sums up yesterday for herself
    const y = b.diary?.find((d) => d.day === ctx.state.time.day - 1);
    const guests = y ? Object.keys(y.with).filter((w) => w !== HUSBAND && Object.keys(y.with[w]!).some((a) => (content.acts.find((x) => x.id === a)?.tier ?? 0) >= 3)) : [];
    const his = y?.with[HUSBAND];
    const kind = guests.length > 0 && his ? "both" : guests.length > 0 ? (feelingOf(ctx.state, "guilt") >= 20 ? "guest_guilty" : "guest") : his ? ((y?.cameHim ?? 0) > 0 ? "husband_good" : "husband_bad") : "quiet";
    think(ctx, `thought.morning.${kind}`, true);
  }, -30);

  // --- what feeds them -----------------------------------------------------------------------------
  const fidelity = (state: GameState) => bs(state).heroine.traits.fidelity / 100;
  api.events.on("encounter:pushed", (ctx, e) => feelAll(ctx, e.payload!.far ? "pushedFar" : "pushed", 1.3 - bs(ctx.state).heroine.traits.confidence / 100));
  api.events.on("encounter:refused", (ctx) => feelAll(ctx, "refusedGuest", fidelity(ctx.state) * 1.5));
  api.events.on("encounter:started", (ctx, e) => {
    const { patron, act, witnessed, verdict, tier, loc } = e.payload as { patron: string; act: string; witnessed: boolean; verdict: string; tier: number; loc: string };
    const b = bs(ctx.state);
    const h = b.heroine;
    note(ctx, patron, act, witnessed || b.mode === "open");
    if (tier >= 3 && b.mode === "hidden") feel(ctx, "guilt", (G.secretAct as Record<string, number>).guilt! * tier, fidelity(ctx.state));
    const watched = loc === "cafe.hall" && (b.shift?.visits.length ?? 0) > 1;
    if (tier >= 2 && (watched || witnessed) && h.traits.openness < 60 && !h.latents.exhibitionist) feel(ctx, "shame", (G.seenAct as Record<string, number>).shame! * (60 - h.traits.openness));
    if (verdict === "eager" && tier >= 2) feelAll(ctx, "eager");
  });
  api.events.on("encounter:came", (ctx) => {
    feel(ctx, "delight", (G.cameGuest as Record<string, number>).delight!);
    if (bs(ctx.state).mode === "hidden") feel(ctx, "guilt", (G.cameGuest as Record<string, number>).guilt!, fidelity(ctx.state));
    page(ctx).came += 1;
    if (bs(ctx.state).tally) bs(ctx.state).tally!.came += 1;
  });
  api.events.on("bed:started", (ctx, e) => note(ctx, HUSBAND, e.payload!.act as string, true));
  api.events.on("bed:ended", (ctx, e) => {
    const { outcome, came } = e.payload as { outcome: string; came: boolean };
    const h = bs(ctx.state).heroine;
    if (came) {
      feelAll(ctx, "cameHusband");
      const p = page(ctx);
      p.came += 1;
      p.cameHim = (p.cameHim ?? 0) + 1;
      if (bs(ctx.state).tally) bs(ctx.state).tally!.came += 1;
      return;
    }
    const small = 1 + h.sizeTaste / 40;
    if (outcome === "left_wanting" || outcome === "premature" || outcome === "too_soon") {
      feel(ctx, "longing", (G.leftWanting as Record<string, number>).longing!);
      feel(ctx, "contempt", (G.leftWanting as Record<string, number>).contempt!, h.marriage.resent >= 20 || bs(ctx.state).power >= 30 ? small : 0.4);
    } else if (outcome === "went_soft") {
      feel(ctx, "longing", (G.wentSoft as Record<string, number>).longing!);
      feel(ctx, "contempt", (G.wentSoft as Record<string, number>).contempt!, h.marriage.resent >= 20 ? small : 0.4);
    } else if (outcome === "faked") feelAll(ctx, "faked");
  });
  api.events.on("couple:talk", (ctx, e) => {
    const { do: what, ok } = e.payload as { do: string; ok: boolean };
    const o = content.manners.talk.options.find((x) => x.id === what);
    if (ok && o) feelAll(ctx, o.group === "touch" ? "kindTouch" : "kindWord");
  });
  api.events.on("couple:heard", (ctx, e) => {
    const how = e.payload!.how as string;
    if (how === "hear" || how === "promise") feelAll(ctx, "heard");
    if (how === "push_back") feelAll(ctx, "pushedBack");
    trust(ctx, how === "hear" || how === "promise" ? "heard" : how === "probe" ? "probed" : "pushedBack");
  });
  api.events.on("reaction", (ctx, e) => {
    if (e.payload!.how !== "stop") return;
    const last = bs(ctx.state).proposals.at(-1);
    const wanted = !!last && last.patron === e.payload!.patron && last.verdict === "eager";
    feelAll(ctx, wanted ? "stoppedHerFun" : "protected");
    trust(ctx, wanted ? "stoppedHerFun" : "protected");
  });
  api.events.on("couple:guest", (ctx, e) => {
    const what = e.payload!.do as string;
    const h = bs(ctx.state).heroine;
    if (what === "encourage" && (h.annoyance ?? 0) >= content.manners.talk.annoy.tired) trust(ctx, "pushedToGuest");
  });
  api.events.on("caught:resolved", (ctx, e) => {
    const c = e.payload!.choice as string;
    if (c === "stop") {
      feelAll(ctx, "caughtStop");
      trust(ctx, "caughtStop");
    } else if (c === "watch" && bs(ctx.state).heroine.traits.openness < 60) feelAll(ctx, "caughtWatch");
  });
  api.events.on("her:woken", (ctx) => {
    feelAll(ctx, "woken");
    trust(ctx, "woken");
  });
  api.events.on("bath:walkin", (ctx, e) => {
    if (e.payload!.ok) return;
    feelAll(ctx, "walkedIn");
    trust(ctx, "walkedIn");
  });
  api.events.on("bare:asked", (ctx, e) => {
    if (!e.payload!.ok) return;
    const h = bs(ctx.state).heroine;
    const publicNow = ctx.state.time.phase === "shift" && (bs(ctx.state).shift?.visits.length ?? 0) > 0;
    if (h.latents.exhibitionist || h.traits.openness >= 70) feelAll(ctx, "bareBold");
    else if (publicNow) feelAll(ctx, "bareShy");
  });
  api.events.on("her:turned_down", (ctx) => {
    feelAll(ctx, "turnedDown");
    trust(ctx, "turnedDown");
  });
  for (const ev of ["her:afternoon", "her:gigolo", "night:slipped_out"])
    api.events.on(ev, (ctx, e) => {
      const b = bs(ctx.state);
      if (b.mode === "hidden") feel(ctx, "guilt", (G.affair as Record<string, number>).guilt!, fidelity(ctx.state) * 1.5);
      if (e.payload?.came) feel(ctx, "delight", (G.affair as Record<string, number>).delight!);
      note(ctx, (e.payload?.patron as string) ?? "stranger", "sex", b.mode === "open");
    });
  api.events.on("day:did", (ctx, e) => {
    const what = e.payload!.do as string;
    if (what === "date") {
      feelAll(ctx, "date");
      trust(ctx, "date");
    } else if (what === "her_chores" || what === "sit_together") {
      feelAll(ctx, "chores");
      trust(ctx, "chores");
    }
  });

  // --- why a number moved: the last few reasons, kept next to it --------------------------------
  api.events.on("heroine:changed", (ctx, e) => {
    const { key, amount, reason } = e.payload as { key: string; amount: number; reason: string };
    if (Math.abs(amount) < 1) return;
    const h = bs(ctx.state).heroine;
    h.why = h.why ?? {};
    const list = (h.why[key] = h.why[key] ?? []);
    const last = list.at(-1);
    if (last && last.r === reason && Math.sign(last.a) === Math.sign(amount)) last.a = Math.round((last.a + amount) * 10) / 10;
    else list.push({ r: reason, a: Math.round(amount * 10) / 10 });
    if (list.length > 3) list.shift();
  });

  // --- what it all does to her answers ----------------------------------------------------------
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.feelings",
    labelKey: "factor.consent.feelings",
    order: 17,
    eval: (state, { partner, act }) => {
      const tier = content.acts.find((a) => a.id === act)?.tier ?? 0;
      if (partner !== HUSBAND && tier < 2) return null;
      const w = partner === HUSBAND ? M.consent.husband : M.consent.guest;
      const total = (Object.entries(w) as [Emotion, number][]).reduce((s, [e, k]) => s + feelingOf(state, e) * k, 0);
      return Math.abs(total) < 0.5 ? null : Math.round(total * 10) / 10;
    },
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.trust",
    labelKey: "factor.consent.trust",
    order: 18,
    eval: (state, { partner }) => {
      if (partner !== HUSBAND) return null;
      const v = (trustOf(state) - 50) * M.trust.consent;
      return Math.abs(v) < 0.5 ? null : Math.round(v * 10) / 10;
    },
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.charm",
    labelKey: "factor.tip.charm",
    order: 34,
    eval: (state, { bill }) => Math.round(((bill * M.attributes.charm.tipShare * (attrOf(state, "charm") - 50)) / 50) * 10) / 10 || null,
  });

  api.invariants.add("mind", (s) => {
    const h = bs(s).heroine;
    for (const [k, v] of Object.entries(h.feel ?? {})) if (!(v > 0 && v <= 100)) return `feeling out of range: ${k}=${v}`;
    for (const [k, v] of Object.entries(h.attrs ?? {})) if (!(v >= 0 && v <= 100)) return `attribute out of range: ${k}=${v}`;
    const t = trustOf(s);
    return t >= 0 && t <= 100 ? null : `trust out of range: ${t}`;
  });
}
