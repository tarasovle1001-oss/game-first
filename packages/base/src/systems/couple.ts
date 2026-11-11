// The two of them outside of bed: talking, touching, saying plainly what he does and does not mind,
// and what he can do about a guest who is with her. Everything here is small and once a day:
// a marriage is fed by attention, not by clicking the same button.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { addReputation } from "./economy";
import { actById, CONSENT_FORMULA, endEncounter } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, husbandSees } from "./places";

export const TALK = "base/talk";
export const TELL = "base/tell";
export const GUEST = "base/guest";
export const HEAR = "base/hear-her";
const T = content.manners.talk;
const G = content.manners.guest;
const E = content.consent.expect;

type Fx = Partial<Record<"mood" | "arousal" | "energy" | "drunk" | "desire" | "resent", number>>;
const applyFx = (ctx: Ctx, fx: Fx, reason: string) => {
  const h = bs(ctx.state).heroine;
  for (const [k, v] of Object.entries(fx) as [keyof Fx, number][]) {
    if (k === "desire" || k === "resent") h.marriage[k] = clamp(h.marriage[k] + v);
    else changeHeroine(ctx, k, v, reason);
  }
};
const statOf = (state: GameState, stat: string): number => {
  const h = bs(state).heroine;
  if (stat === "desire" || stat === "resent") return h.marriage[stat];
  if (stat in h.traits) return h.traits[stat as keyof typeof h.traits];
  return (h as unknown as Record<string, number>)[stat] ?? 0;
};

/** They are in the same room and she is free to talk. */
export const together = (state: GameState) => {
  const b = bs(state);
  if (state.time.phase === "summary" || b.caught || b.encounter || b.night?.sex) return false;
  if (state.time.phase === "night" && b.night?.scene.startsWith("fd_")) return false;
  return state.time.phase === "prep" || state.where[HUSBAND] === state.where[WIFE];
};

/** The guest the husband can do something about right now: the one who is with her where he can see. */
export const guestInView = (state: GameState): string | null => {
  const b = bs(state);
  if (state.time.phase !== "shift" || !b.shift || b.caught) return null;
  const id = b.reaction?.patron ?? (b.encounter && husbandSees(state, b.encounter.loc) ? b.encounter.patron : null) ?? (husbandSees(state, HALL) ? b.shift.moment?.patron : null) ?? null;
  return id && b.shift.visits.some((v) => v.patron === id && v.stay > 0) ? id : null;
};

export function registerCouple(api: ModApi) {
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase === "prep") {
      b.talked = [];
      b.dayTop = null;
    }
  });
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { act, witnessed, tier, patron } = e.payload as { act: string; witnessed: boolean; tier: number; patron: string };
    if (!b.dayTop || tier > actById(b.dayTop.act).tier) b.dayTop = { act, patron, seen: witnessed };
  });

  // When enough has piled up she says so, at night, before anything else can happen.
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      const b = bs(ctx.state);
      const h = b.heroine;
      if (e.payload!.phase !== "night" || !b.night || b.night.scene.startsWith("fd_")) return;
      if (h.marriage.resent < T.complainAt || ctx.state.time.day - b.complainedDay < T.complainEveryDays) return;
      const last = b.told.at(-1)?.key ?? "";
      // what it is about: the most concrete thing first
      const topic = b.purseShare === 0 && b.purse === 0 ? "money" : b.denied >= 3 ? "neglect" : last === "told.stop" || last === "told.say.forbid" || last === "told.outfit.back" ? "control" : last === "told.encourage" || last === "told.say.allow" ? "pushed" : h.sizeTaste >= 40 || h.orgasms === 0 ? "bed" : "tired";
      b.complaint = topic;
      b.complainedDay = ctx.state.time.day;
      b.night.wants = false;
      b.night.asked = true; // nothing else tonight until he has answered
      b.night.scene = "talk";
      ctx.log(`log.complaint.${topic}`);
    },
    -30,
  );
  api.actions.register({
    id: HEAR,
    labelKey: "action.hear",
    describe: (a) => ({ key: `action.hear.${a.payload!.how}` }),
    enumerate: (state) => (state.time.phase === "night" && bs(state).complaint ? ["hear", "probe", "push_back"].map((how) => ({ type: HEAR, payload: { how } })) : []),
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const topic = b.complaint!;
      const how = action.payload!.how as string;
      b.complaint = null;
      if (how === "hear") {
        // he gives way: it costs him something real where there is something to give
        applyFx(ctx, { resent: -T.hear.resent, mood: 4, desire: 1 }, "heard");
        if (topic === "money") b.purseShare = Math.max(b.purseShare, 0.5);
        if (topic === "control") for (const a of content.acts) if ((b.expect[a.id] ?? 0) < 0 && a.tier <= 2) delete b.expect[a.id];
        b.power = clamp(b.power + (b.mode === "open" ? 2 : 0));
        ctx.log(`log.hear.hear.${topic === "money" ? "money" : "any"}`);
      } else if (how === "probe") {
        applyFx(ctx, { resent: -T.probe.resent, mood: 2 }, "asked");
        // she says a little more than she meant to, as far as she is honest
        const honest = h.traits.honesty >= 50;
        ctx.log(honest ? `log.hear.probe.${h.marriage.desire < 40 ? "cold" : h.sizeTaste >= 40 ? "size" : b.dayTop && actById(b.dayTop.act).tier >= 3 && !b.dayTop.seen ? "guest" : "plain"}` : "log.hear.probe.closed");
        if (honest && b.dayTop && actById(b.dayTop.act).tier >= 3 && !b.dayTop.seen && b.mode === "hidden") b.suspicion = clamp(b.suspicion + 5);
      } else {
        const yields = h.latents.submissive !== undefined || h.traits.confidence < 35;
        applyFx(ctx, yields ? { resent: -1, mood: -3 } : { resent: T.pushBack.resent, mood: -5, desire: -2 }, "pushed back");
        if (b.mode === "open" && !yields) b.power = clamp(b.power + 3);
        ctx.log(`log.hear.push_back.${yields ? "yields" : "no"}`);
      }
      b.night!.scene = "sleeping";
      b.night!.asked = how === "push_back"; // after a quarrel nobody reaches for anybody
      ctx.emit("couple:heard", { topic, how });
    },
  });

  api.actions.register({
    id: TALK,
    labelKey: "action.talk",
    describe: (a) => ({ key: `action.talk.${a.payload!.do}` }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state)) return [];
      const out = T.options.filter((o) => !b.talked.includes(o.id) && (!o.phases || o.phases.includes(state.time.phase)) && (!o.stock || b.stock >= o.stock)).map((o) => ({ type: TALK, payload: { do: o.id, group: o.group } }));
      if (!b.talked.includes("where_we_stand")) out.push({ type: TALK, payload: { do: "where_we_stand", group: "chat" } });
      if (state.time.phase === "night" && !b.talked.includes("how_tonight")) out.push({ type: TALK, payload: { do: "how_tonight", group: "chat" } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const what = action.payload!.do as string;
      b.talked.push(what);
      if (what === "where_we_stand") {
        // an honest reading of the marriage, in her words
        const m = h.marriage;
        const key = m.resent >= 50 ? "bitter" : m.desire >= 70 && m.resent < 20 ? "warm" : m.desire < 35 ? "cold" : m.resent >= 25 ? "strained" : "fine";
        ctx.log(`log.talk.stand.${key}`);
        if (b.mode === "open") ctx.log(`log.talk.stand.open.${b.power >= 50 ? "hers" : "shared"}`);
        return;
      }
      if (what === "how_tonight") {
        // what she tells about the evening depends on what happened, what he saw, and how honest she is
        const top = b.dayTop;
        const tier = top ? actById(top.act).tier : 0;
        if (!top || tier < 2) ctx.log("log.talk.tonight.quiet");
        else if (top.seen || b.mode === "open") {
          ctx.log("log.talk.tonight.told", { name: `@name:${b.patrons[top.patron]?.name ?? ""}`, act: `act.${top.act}` });
          changeHeroine(ctx, "arousal", b.mode === "open" ? 4 : 0, "telling");
        } else if (h.traits.honesty >= T.confessAtHonesty && tier <= T.confessUpToTier) {
          // she owns up to the lighter things herself
          ctx.log("log.talk.tonight.confess", { name: `@name:${b.patrons[top.patron]?.name ?? ""}`, act: `act.${top.act}` });
          b.expect[top.act] = b.expect[top.act] ?? 0; // now it is on the table: his answer is next
          h.marriage.resent = clamp(h.marriage.resent - 1);
        } else {
          ctx.log("log.talk.tonight.quiet");
          ctx.log("log.talk.tonight.lie", { act: `act.${top.act}` }, ["unseen"]);
          h.traits.honesty = clamp(h.traits.honesty - 0.5);
        }
        return;
      }
      const o = T.options.find((x) => x.id === what)!;
      if (o.stock) b.stock -= o.stock;
      const publicNow = ctx.state.time.phase === "shift" && ctx.state.where[WIFE] === HALL && (b.shift?.visits.length ?? 0) > 0;
      const need = o.needs ? o.needs.min + (publicNow ? (o.needs.publicExtra ?? 0) : 0) : 0;
      const ok = !o.needs || statOf(ctx.state, o.needs.stat) >= need;
      applyFx(ctx, ok ? o.effects : (o.fail ?? {}), "husband");
      ctx.log(`log.talk.${o.id}${ok ? "" : ".no"}`);
      ctx.emit("couple:talk", { do: o.id, ok });
    },
  });

  // Saying it in words: "go on" or "don't", one kind of thing at a time.
  api.actions.register({
    id: TELL,
    labelKey: "action.tell",
    describe: (a) => ({ key: `action.tell.${a.payload!.say}`, params: { what: `tell.${a.payload!.group}` } }),
    enumerate(state) {
      if (!together(state) || state.time.phase === "shift") return [];
      return T.groups.flatMap((g) => (["allow", "forbid"] as const).map((say) => ({ type: TELL, payload: { group: g.id, say } })));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const g = T.groups.find((x) => x.id === action.payload!.group)!;
      const say = action.payload!.say as "allow" | "forbid";
      const acts = content.acts.filter((a) => a.tier >= g.tiers[0] && a.tier <= g.tiers[1]);
      const was = acts.reduce((s, a) => s + (b.expect[a.id] ?? 0), 0) / Math.max(1, acts.length);
      for (const a of acts) b.expect[a.id] = say === "allow" ? E.approve : E.forbid;
      b.told.push({ day: ctx.state.time.day, key: `told.say.${say}`, params: { what: `tell.${g.id}` } });
      if (b.told.length > 10) b.told.shift();
      const changed = say === "allow" ? was < E.approve - 1 : was > E.forbid + 1;
      if (changed) {
        if (say === "allow") {
          // a faithful wife hears "I do not mind" as "I do not care"; an open one hears a door opening
          const shock = g.tiers[0] >= T.shockFromTier && h.traits.fidelity >= T.shockAtFidelity;
          if (shock) applyFx(ctx, { mood: -3, resent: 2 }, "told");
          else changeHeroine(ctx, "arousal", 3 + g.tiers[0] * 0.5, "told");
          ctx.log(`log.tell.allow${shock ? ".shock" : ""}`, { what: `tell.${g.id}` });
        } else {
          // taking away what she already has costs more than refusing what she never had
          const had = Object.entries(h.skills).some(([id, v]) => v > 0 && acts.some((a) => a.id === id));
          const grudge = had ? (100 - h.traits.fidelity) / 20 : 0;
          h.marriage.resent = clamp(h.marriage.resent + grudge);
          ctx.log(`log.tell.forbid${grudge >= 2 ? ".grudge" : ""}`, { what: `tell.${g.id}` });
        }
      }
      ctx.emit("couple:tell", { group: g.id, say });
    },
  });

  // A guest is with her and the husband can see it.
  api.actions.register({
    id: GUEST,
    labelKey: "action.guest",
    describe: (a) => ({ key: `action.guest.${a.payload!.do}`, params: { name: `@name:${a.payload!.name}` } }),
    enumerate(state) {
      const b = bs(state);
      const id = guestInView(state);
      if (!id) return [];
      const visit = b.shift!.visits.find((v) => v.patron === id)!;
      const name = b.patrons[id]!.name;
      const dos = ["throw_out"];
      if (!b.caught && (b.reaction || b.encounter) && actById((b.reaction?.act ?? b.encounter?.act)!).tier <= G.joinUpToTier) dos.unshift("join");
      if (b.stock >= 1) dos.unshift("round");
      if (!visit.pushed) dos.unshift("encourage");
      return dos.map((d) => ({ type: GUEST, payload: { do: d, patron: id, name } }));
    },
    accepts: (state, a) => a.payload?.patron === guestInView(state),
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const p = b.patrons[action.payload!.patron as string]!;
      const visit = b.shift!.visits.find((v) => v.patron === p.id)!;
      const name = `@name:${p.name}`;
      switch (action.payload!.do) {
        case "join": {
          // walk over and make it three: nothing is said, everything is understood
          const actId = (b.reaction?.act ?? b.encounter?.act)!;
          if (b.encounter?.patron === p.id) endEncounter(ctx, true);
          b.expect[actId] = Math.max(-100, (b.expect[actId] ?? 0) - G.joinExpect);
          p.memory.interest = clamp(p.memory.interest - 3);
          if (b.reaction) b.reaction.reacted = true;
          b.reaction = null;
          ctx.log("log.guest.join", { name });
          break;
        }
        case "round":
          b.stock -= 1;
          p.memory.interest = clamp(p.memory.interest + G.round.interest);
          visit.stay += G.round.stay;
          changeHeroine(ctx, "drunk", G.round.drunk, "round");
          ctx.log("log.guest.round", { name });
          break;
        case "encourage": {
          visit.pushed = true;
          const upTo = Math.max(2, visit.tier + G.encourage.tiersAhead);
          for (const a of content.acts) if (a.tier <= upTo) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, G.encourage.expect);
          b.told.push({ day: ctx.state.time.day, key: "told.encourage", params: { name } });
          if (b.told.length > 10) b.told.shift();
          const shock = h.traits.fidelity >= T.shockAtFidelity;
          if (shock) applyFx(ctx, { mood: -3, resent: 2 }, "pushed");
          else changeHeroine(ctx, "arousal", 5, "pushed");
          ctx.log(`log.guest.encourage${shock ? ".shock" : ""}`, { name });
          break;
        }
        case "throw_out": {
          const pressed = visit.pressure > 0;
          if (b.encounter?.patron === p.id) endEncounter(ctx, true);
          if (ctx.state.where[WIFE] !== HALL && b.shift) ctx.state.where[WIFE] = HALL;
          visit.blocked = true;
          visit.stay = 0;
          p.memory.affinity = clamp(p.memory.affinity - G.throwOut.affinity, -100, 100);
          p.memory.interest = clamp(p.memory.interest - G.throwOut.affinity);
          addReputation(ctx, -G.throwOut.reputation);
          if (pressed) applyFx(ctx, { mood: 4, resent: -1, desire: 1 }, "defended");
          else applyFx(ctx, { mood: -3, resent: (100 - h.traits.fidelity) / 30 }, "thrown out");
          if (b.reaction?.patron === p.id) {
            const act = actById(b.reaction.act);
            for (const a of content.acts) if (a.tier >= act.tier) b.expect[a.id] = Math.min(b.expect[a.id] ?? 0, a.id === act.id ? E.forbid : E.forbidHigher);
            b.reaction = null;
          }
          ctx.log(`log.guest.throw_out${pressed ? ".thanks" : ""}`, { name });
          break;
        }
      }
      ctx.emit("couple:guest", { do: action.payload!.do as string, patron: p.id });
    },
  });

  // His push toward this man counts for as long as the man is here.
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.pushed",
    labelKey: "factor.consent.pushed",
    order: 41.7,
    eval(state, input) {
      if (input.partner === HUSBAND) return null;
      const visit = bs(state).shift?.visits.find((v) => v.patron === input.partner);
      return visit?.pushed && actById(input.act).tier >= 2 ? G.encourage.consent : null;
    },
  });

  api.invariants.add("couple", (s) => {
    const b = bs(s);
    if (new Set(b.talked).size !== b.talked.length) return "the same talk twice in one day";
    return null;
  });
}
