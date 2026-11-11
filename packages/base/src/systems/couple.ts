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
