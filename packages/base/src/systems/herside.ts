// Her side of the marriage: she comes to him. To complain about a guest, for a hug, to tease him, for comfort.
// He answers, or lets the moment pass. And she notices things: what her body has become, how other men
// compare with him, what his body has learned. Some of it she says, some of it she only thinks.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { sizeClass } from "./body";
import { actById } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL } from "./places";

export const ANSWER = "base/answer-her";
const A = content.manners.talk.her;
const BEDROOM = "home.bedroom";
type Kind = "harassed" | "affection" | "tease" | "comfort";
const ANSWERS: Record<Kind, string[]> = {
  harassed: ["protect", "endure", "ask"],
  affection: ["return", "busy"],
  tease: ["let", "later"],
  comfort: ["comfort", "later"],
};

const feel = (ctx: Ctx, desire: number, resent: number) => {
  const m = bs(ctx.state).heroine.marriage;
  m.desire = clamp(m.desire + desire);
  m.resent = clamp(m.resent + resent);
};
/** She is free to walk over to him right now. */
const free = (state: GameState) => {
  const b = bs(state);
  if (b.encounter || b.caught || b.reaction || b.complaint || b.night?.sex || b.approach) return false;
  if (state.time.phase === "night") return state.where[HUSBAND] === BEDROOM && state.where[WIFE] === BEDROOM && !b.night?.scene.startsWith("fd_");
  return state.time.phase === "shift" && !!state.where[HUSBAND]?.startsWith("cafe.");
};
const inPublic = (state: GameState) => state.time.phase === "shift" && state.where[HUSBAND] === HALL && (bs(state).shift?.visits.length ?? 0) > 0;

/** What she would come to him with right now, most pressing first. */
const pick = (ctx: Ctx): { kind: Kind; patron?: string } | null => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const today = ctx.state.time.day;
  const fresh = (kind: Kind) => (b.approached[kind] ?? -10) < today;
  const worst = Object.entries(b.pushedToday).sort((x, y) => y[1] - x[1])[0];
  if (fresh("harassed") && worst && worst[1] >= A.harassedAt && h.traits.honesty >= A.harassedHonesty && h.latents.likes_rough === undefined) return { kind: "harassed", patron: worst[0] };
  if (fresh("comfort") && (h.mood <= A.comfortMood || h.energy <= A.comfortEnergy) && h.marriage.resent < A.maxResent && ctx.rng.chance(A.chance.comfort)) return { kind: "comfort" };
  if (fresh("tease") && h.arousal >= A.teaseArousal && h.marriage.desire >= A.teaseDesire && h.marriage.resent < A.maxResent && ctx.rng.chance(A.chance.tease)) return { kind: "tease" };
  if (fresh("affection") && h.marriage.desire >= A.affectionDesire && h.marriage.resent < A.maxResent && ctx.rng.chance(A.chance.affection)) return { kind: "affection" };
  return null;
};
const approach = (ctx: Ctx) => {
  if (!free(ctx.state)) return;
  const b = bs(ctx.state);
  const what = pick(ctx);
  if (!what) return;
  const pub = inPublic(ctx.state);
  b.approach = { kind: what.kind, patron: what.patron, public: pub };
  b.approached[what.kind] = ctx.state.time.day;
  if (b.shift) b.shift.interrupt = true;
  const name = what.patron ? (b.patrons[what.patron]?.name ?? "") : "";
  ctx.log(`log.approach.${what.kind}${pub && what.kind !== "harassed" ? ".public" : ""}`, { name });
  ctx.emit("her:approached", { kind: what.kind });
};

/** One thing she has noticed and not yet said: about her body, about him next to other men, about his body. */
const remark = (ctx: Ctx) => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const aloud = b.mode === "open" || h.traits.honesty >= A.remarkHonesty;
  const cruel = b.mode === "open" && (b.power >= 30 || h.latents.cruel_streak !== undefined);
  const say = (id: string, key: string, spoken = aloud) => {
    b.remarked.push(id);
    ctx.log(spoken ? key : `${key}.thought`, undefined, spoken ? undefined : ["unseen"]);
    ctx.emit("her:remarked", { id, spoken });
    return true;
  };
  // what she is next to what she was
  const stretchStep = A.stretchSteps.filter((s) => h.body.vagina.peak >= s).at(-1);
  if (stretchStep !== undefined && !b.remarked.includes(`stretch.${stretchStep}`)) return say(`stretch.${stretchStep}`, `log.her.stretch.${stretchStep}`);
  // him next to the others
  const gap = b.sizeToday ? sizeClass(b.sizeToday) - sizeClass(b.husband.size) : 0;
  if (gap >= 1 && !b.remarked.includes(`compare.${Math.min(3, gap)}`)) {
    const g = Math.min(3, gap);
    // while it is a secret she can only think it; once it is not, she says it, kindly or not
    return say(`compare.${g}`, `log.her.compare.${g}${cruel ? ".cruel" : ""}`, b.mode === "open");
  }
  // what his body has learned
  const hisStep = A.hisSteps.filter((s) => b.husband.stretch >= s).at(-1);
  if (hisStep !== undefined && !b.remarked.includes(`his.${hisStep}`)) return say(`his.${hisStep}`, `log.her.his.${hisStep}${cruel ? ".cruel" : ""}`, true);
  // what the gym has done for him: this one she likes
  const fitStep = content.day.gym.herDesireSteps.filter((s) => (b.husband.fitness ?? 0) >= s).at(-1);
  if (fitStep !== undefined && !b.remarked.includes(`fit.${fitStep}`)) {
    h.marriage.desire = clamp(h.marriage.desire + content.day.gym.herDesire);
    return say(`fit.${fitStep}`, `log.her.fit.${fitStep}${cruel ? ".cruel" : ""}`, true);
  }
  return false;
};

export function registerHerSide(api: ModApi) {
  api.events.on("encounter:pushed", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, far } = e.payload as { patron: string; far: boolean };
    b.pushedToday[patron] = (b.pushedToday[patron] ?? 0) + (far ? 2 : 1);
  });
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, act } = e.payload as { patron: string; act: string };
    const zones = actById(act).zones;
    const p = b.patrons[patron];
    if (p && (zones.includes("vagina") || zones.includes("anus"))) b.sizeToday = Math.max(b.sizeToday ?? 0, p.size);
  });
  api.events.on("shift:tick", (ctx) => approach(ctx), -50);
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      const phase = e.payload!.phase as string;
      const b = bs(ctx.state);
      if (phase === "prep") {
        b.pushedToday = {};
        b.sizeToday = 0;
      }
      if (phase !== "night") return;
      if (!b.complaint && b.night && !b.night.scene.startsWith("fd_") && ctx.state.where[HUSBAND] === BEDROOM && ctx.state.where[WIFE] === BEDROOM) {
        if (!remark(ctx)) approach(ctx);
      }
    },
    -40,
  );
  // the moment passes if he says nothing
  api.events.on("phase:exit", (ctx) => {
    const b = bs(ctx.state);
    if (!b.approach) return;
    feel(ctx, 0, A.ignoredResent);
    ctx.log(`log.approach.ignored.${b.approach.kind}`);
    b.approach = null;
  });
  api.events.on("encounter:started", (ctx) => {
    const b = bs(ctx.state);
    if (b.approach) b.approach = null; // a guest got to her first
  });

  api.actions.register({
    id: ANSWER,
    labelKey: "action.answer",
    describe: (a) => ({ key: `action.answer.${a.payload!.kind}.${a.payload!.say}` }),
    enumerate(state) {
      const ap = bs(state).approach;
      return ap ? ANSWERS[ap.kind as Kind].map((say) => ({ type: ANSWER, payload: { kind: ap.kind, say } })) : [];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const ap = b.approach!;
      const say = action.payload!.say as string;
      b.approach = null;
      const key = `log.answer.${ap.kind}.${say}`;
      if (ap.kind === "harassed") {
        const v = b.shift?.visits.find((x) => x.patron === ap.patron);
        const p = ap.patron ? b.patrons[ap.patron] : undefined;
        const name = p?.name ?? "";
        if (say === "protect") {
          if (v) v.blocked = true; // he has a word with the man: nothing more from him tonight
          if (p) p.memory.interest = clamp(p.memory.interest - A.protect.interest);
          feel(ctx, A.protect.desire, -A.protect.resent);
          changeHeroine(ctx, "mood", 4, "protected");
          if (b.mode === "open") b.power = clamp(b.power - 1);
          ctx.log(key, { name });
        } else if (say === "endure") {
          const takes = h.latents.submissive !== undefined || h.latents.money_hungry !== undefined;
          feel(ctx, takes ? 0 : -1, takes ? 0 : A.endure.resent);
          changeHeroine(ctx, "mood", takes ? 0 : -4, "told to put up with it");
          // she hears what he is really saying: it is allowed
          for (const a of content.acts) if (a.tier >= 2 && a.tier <= 4) b.expect[a.id] = Math.min(100, (b.expect[a.id] ?? 0) + A.endure.expect);
          b.told.push({ day: ctx.state.time.day, key: "told.endure" });
          if (b.told.length > 10) b.told.shift();
          ctx.log(takes ? `${key}.takes` : key, { name });
        } else {
          // "and you, did you like it?"
          const admits = h.arousal >= A.ask.arousal && h.traits.honesty >= 50;
          if (admits) {
            h.traits.openness = clamp(h.traits.openness + A.ask.openness);
            changeHeroine(ctx, "arousal", 4, "said it aloud");
          } else feel(ctx, 0, A.ask.resent);
          ctx.log(admits ? `${key}.admits` : key, { name });
        }
      } else if (ap.kind === "affection" || ap.kind === "tease") {
        if (say === "return" || say === "let") {
          feel(ctx, ap.kind === "tease" ? 1 : 1.5, -0.5);
          changeHeroine(ctx, "mood", 3, "husband");
          changeHeroine(ctx, "arousal", ap.kind === "tease" ? 6 : 2, "husband");
          ctx.log(ap.public ? `${key}.public` : key);
          // guests who see a wife in love with her husband cool off a little
          if (ap.public && b.shift) for (const v of b.shift.visits) if (b.patrons[v.patron]) b.patrons[v.patron]!.memory.interest = clamp(b.patrons[v.patron]!.memory.interest - A.publicCools);
          // a husband who has gone without long enough does not survive her hand
          const TC = content.manners.talk.touchCum;
          if (b.denied >= TC.fromDenied && b.husband.spentDay !== ctx.state.time.day && ctx.rng.chance(Math.min(TC.max, (TC.base + b.denied * TC.perDenied) * (ap.kind === "tease" ? 2 : 1)))) {
            b.husband.spentDay = ctx.state.time.day;
            b.denied = 0;
            const amused = h.traits.confidence >= 55 || b.mode === "open";
            if (b.mode === "open") b.power = clamp(b.power + 2);
            feel(ctx, amused ? -1 : -0.5, 0);
            ctx.log(amused ? "log.husband.came_touch.amused" : "log.husband.came_touch");
            ctx.emit("husband:came_touch", { from: ap.kind });
          } else if (ap.kind === "tease" && b.night === null) b.promised = ctx.state.time.day; // she will want him tonight
        } else {
          feel(ctx, -0.5, A.declinedResent);
          changeHeroine(ctx, "mood", -2, "brushed off");
          if (ap.kind === "tease") h.frustration = clamp(h.frustration + 3);
          ctx.log(key);
        }
      } else {
        if (say === "comfort") {
          feel(ctx, 1, -A.comfort.resent);
          changeHeroine(ctx, "mood", A.comfort.mood, "comforted");
          changeHeroine(ctx, "energy", 3, "comforted");
        } else {
          feel(ctx, -0.5, A.declinedResent);
          changeHeroine(ctx, "mood", -2, "brushed off");
        }
        ctx.log(key);
      }
      ctx.emit("her:answered", { kind: ap.kind, say });
    },
  });
  api.invariants.add("approach", (s) => {
    const ap = bs(s).approach;
    return !ap || ap.kind in ANSWERS ? null : `unknown approach: ${ap.kind}`;
  });
}
