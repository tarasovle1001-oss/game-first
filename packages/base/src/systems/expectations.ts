// What she thinks her husband allows. He never has to say a word: watching and doing nothing is an answer too.
// Every act carries a number from -100 ("he made it clear he does not want this") to +100 ("he said yes").
// In the open she goes by it. Behind his back it binds her only as far as she is honest.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { actById, CONSENT_FORMULA, endEncounter, isIntimate, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHim } from "./rhythm";
import { changeHeroine } from "./heroine";
import { HALL, husbandSees } from "./places";

export const REACT_STOP = "base/react-stop";
export const REACT_APPROVE = "base/react-approve";
/** Everything else he can do while it is happening in front of him: payload.how. */
export const REACT = "base/react";
const E = content.consent.expect;
const TOLD_LIMIT = 10;

/** What she believes about one act. Unknown acts lean on what she knows about milder ones. */
export function expectOf(state: GameState, actId: string): number {
  const b = bs(state);
  const own = b.expect[actId];
  if (own !== undefined) return own;
  const tier = actById(actId).tier;
  // a "no" to something milder covers this too; a "yes" to something milder only hints
  const milder = content.acts.filter((a) => a.tier < tier && b.expect[a.id] !== undefined).map((a) => b.expect[a.id]!);
  const no = Math.min(0, ...milder);
  if (no < 0) return Math.min(E.unknown, no);
  const yes = Math.max(0, ...milder);
  return E.unknown + yes * 0.25;
}

/** How sure she is, for the UI: "knows" / "suspects" / "vague", and which way. */
export function expectLevel(value: number): { side: "allow" | "deny"; sure: "vague" | "suspects" | "knows" } {
  const a = Math.abs(value);
  return { side: value >= 0 ? "allow" : "deny", sure: a >= 70 ? "knows" : a >= 40 ? "suspects" : "vague" };
}

const tell = (ctx: Ctx, key: string, params?: Record<string, string | number>) => {
  const b = bs(ctx.state);
  b.told.push({ day: ctx.state.time.day, key, ...(params ? { params } : {}) });
  if (b.told.length > TOLD_LIMIT) b.told.shift();
};
export const nudge = (ctx: Ctx, actId: string, by: number, cap = 100) => {
  const b = bs(ctx.state);
  const now = b.expect[actId] ?? expectOf(ctx.state, actId);
  b.expect[actId] = clamp(by > 0 ? Math.max(now, Math.min(cap, now + by)) : now + by, -100, 100);
};

export function registerExpectations(api: ModApi) {
  // Something starts in front of him: from this moment he is answering, whatever he does.
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, act, witnessed, tier } = e.payload as { patron: string; act: string; witnessed: boolean; tier: number };
    if (!witnessed || tier < 2 || b.caught) return;
    settle(ctx); // an earlier moment he let pass
    b.reaction = { patron, act, reacted: false };
    if (b.shift) b.shift.interrupt = true;
  });
  // He let it run its course without a word.
  const settle = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const r = b.reaction;
    if (!r) return;
    if (!r.reacted) nudge(ctx, r.act, E.ignoreGain, E.ignoreCap);
    b.reaction = null;
  };
  api.events.on("encounter:ended", (ctx) => settle(ctx));
  api.events.on("shift:end", (ctx) => settle(ctx));
  api.events.on("shift:tick", (ctx) => {
    // a passing moment (no encounter running) is over by the next tick
    const b = bs(ctx.state);
    if (b.reaction && !b.encounter) settle(ctx);
  });

  const pending = (state: GameState) => {
    const b = bs(state);
    return state.time.phase === "shift" && b.reaction && !b.reaction.reacted && !b.caught ? b.reaction : null;
  };

  api.actions.register({
    id: REACT_STOP,
    labelKey: "action.react.stop",
    describe: () => ({ key: "action.react.stop" }),
    enumerate: (state) => (pending(state) ? [{ type: REACT_STOP }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      const r = b.reaction!;
      const act = actById(r.act);
      const p = b.patrons[r.patron]!;
      r.reacted = true;
      b.expect[act.id] = E.forbid;
      for (const a of content.acts) if (a.tier > act.tier) b.expect[a.id] = Math.min(b.expect[a.id] ?? 0, E.forbidHigher);
      tell(ctx, "told.stop", { act: `act.${act.id}` });
      ctx.log("log.react.stop", { name: `@name:${p.name}`, act: `act.${act.id}` });
      const visit = b.shift?.visits.find((v) => v.patron === p.id);
      if (visit) visit.blocked = true;
      p.memory.affinity = clamp(p.memory.affinity - 6, -100, 100);
      p.memory.interest = clamp(p.memory.interest - 5);
      changeHeroine(ctx, "mood", -5, "stopped");
      // how she takes it: a faithful wife is a little relieved, the others resent it
      const h = b.heroine;
      h.marriage.resent = clamp(h.marriage.resent + (h.traits.fidelity >= 60 ? 0 : 3));
      if (b.encounter?.patron === p.id) endEncounter(ctx, true);
      if (isIntimate(act) && ctx.state.where[WIFE] !== HALL) ctx.state.where[WIFE] = HALL;
      b.reaction = null;
      ctx.emit("reaction", { how: "stop", act: act.id, patron: p.id });
    },
  });

  // The rest of what a husband can do with it: say it aloud, set a limit, take her away, walk off, send them somewhere, join.
  const JOIN = ["handjob", "blowjob", "sex"];
  api.actions.register({
    id: REACT,
    labelKey: "action.react.more",
    describe: (a) => ({ key: `action.react.${a.payload!.how}${a.payload!.act ? `.${a.payload!.act}` : ""}`, params: { name: `@name:${a.payload!.name ?? ""}` } }),
    enumerate(state) {
      const r = pending(state);
      if (!r) return [];
      const b = bs(state);
      const p = b.patrons[r.patron];
      const enc = b.encounter?.patron === r.patron ? b.encounter : null;
      const name = p?.name ?? "";
      const out: { type: string; payload: Record<string, string | number> }[] = ["cheer", "limit", "lead_away", "leave"].map((how) => ({ type: REACT, payload: { how, name } }));
      if (enc) {
        // somewhere with a door: the staff room, his room if he has one upstairs, their own bed
        if (enc.loc !== "cafe.staff") out.push({ type: REACT, payload: { how: "send_staff", name } });
        if (Object.values(b.lodgers ?? {}).some((l) => l.patron === r.patron)) out.push({ type: REACT, payload: { how: "send_room", name } });
        out.push({ type: REACT, payload: { how: "send_bed", name } });
        if (actById(r.act).tier >= 3 && b.husband.spentDay !== state.time.day) for (const act of JOIN) out.push({ type: REACT, payload: { how: "join", act, name } });
      }
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const r = b.reaction!;
      const act = actById(r.act);
      const p = b.patrons[r.patron]!;
      const how = action.payload!.how as string;
      const name = `@name:${p.name}`;
      const up = (toTier: number, by: number) => {
        for (const a of content.acts) if (!a.only && a.tier <= toTier) nudge(ctx, a.id, by, 90);
      };
      r.reacted = true;
      if (how === "cheer") {
        // said aloud, in front of the man: this and the next step up are wanted, not just allowed
        b.expect[act.id] = Math.max(b.expect[act.id] ?? 0, E.approve + 15);
        up(act.tier + 1, 25);
        tell(ctx, "told.cheer", { act: `act.${act.id}` });
        changeHeroine(ctx, "arousal", 7, "cheered on");
        p.memory.interest = clamp(p.memory.interest + 6);
        ctx.log("log.react.cheer", { name, act: `act.${act.id}` });
      } else if (how === "limit") {
        // this far and one step more; past that, no
        up(act.tier + 1, 20);
        for (const a of content.acts) if (a.tier > act.tier + 1) b.expect[a.id] = Math.min(b.expect[a.id] ?? 0, E.forbidHigher);
        tell(ctx, "told.limit", { act: `act.${act.id}` });
        ctx.log("log.react.limit", { name, act: `act.${act.id}` });
      } else if (how === "lead_away") {
        // no scene, no verdict: he simply needs her somewhere else
        nudge(ctx, act.id, -10);
        p.memory.interest = clamp(p.memory.interest - 3);
        changeHeroine(ctx, "mood", h.traits.fidelity >= 60 ? 2 : -2, "led away");
        ctx.log("log.react.lead_away", { name });
        if (b.encounter?.patron === p.id) endEncounter(ctx, true);
        ctx.state.where[WIFE] = ctx.state.where[HUSBAND]!;
        b.reaction = null;
      } else if (how === "leave") {
        // he turns his back on it: she is on her own, and she knows he knew
        up(act.tier + 2, 18);
        tell(ctx, "told.leave", { act: `act.${act.id}` });
        ctx.log("log.react.leave", { name });
        ctx.state.where[HUSBAND] = ctx.state.where[HUSBAND] === "cafe.kitchen" ? "cafe.bar" : "cafe.kitchen";
        b.reaction = null;
      } else if (how === "send_staff" || how === "send_room" || how === "send_bed") {
        // a door between them and the room: nobody watching counts for a lot with her, and so does who sent her
        const to = how === "send_staff" ? "cafe.staff" : how === "send_bed" ? "home.bedroom" : (Object.entries(b.lodgers).find(([, l]) => l.patron === p.id)?.[0] ?? "cafe.staff");
        up(9, how === "send_bed" ? 35 : 28);
        tell(ctx, "told.sent", { act: `act.${act.id}` });
        ctx.log(`log.react.${how}`, { name });
        if (b.encounter) b.encounter.loc = to;
        ctx.state.where[WIFE] = to;
        if (ctx.state.where[p.id] !== undefined) ctx.state.where[p.id] = to;
        changeHeroine(ctx, "arousal", 5, "sent off with him");
        b.reaction = null;
      } else if (how === "join") {
        const mine = action.payload!.act as string;
        const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: mine, partner: HUSBAND, loc: b.encounter?.loc ?? ctx.state.where[WIFE]!, offer: 0, pressure: 0 });
        // already in the middle of it with another man: her own heat argues for him, her shame against
        const total = res.total + h.arousal * 0.3 - (100 - h.traits.openness) * 0.25;
        const verdict = verdictOf(total);
        b.proposals.push({ day: ctx.state.time.day, tick: b.shift?.tick ?? -1, patron: HUSBAND, act: mine, loc: b.encounter?.loc ?? "", verdict, seen: true, total, rows: [...res.rows, { id: "consent.joined", labelKey: "factor.consent.joined", value: total - res.total }] });
        if (verdict === "refuse") {
          changeHeroine(ctx, "mood", -3, "too much at once");
          ctx.log("log.react.join.no", { name });
        } else {
          up(9, 30);
          tell(ctx, "told.join", { act: `act.${mine}` });
          changeHeroine(ctx, "arousal", 15, "both of them");
          h.traits.openness = clamp(h.traits.openness + 1);
          p.memory.affinity = clamp(p.memory.affinity + 5, -100, 100);
          ctx.log("log.react.join.yes", { name, act: `act.${mine}` });
          // not a line in the log: a scene of three, with him in it, turn by turn
          if (b.encounter) endEncounter(ctx, true);
          b.reaction = null;
          ctx.emit("join:start", { act: mine, patron: p.id });
        }
      }
      ctx.emit("reaction", { how, act: act.id, patron: p.id });
    },
  });

  api.actions.register({
    id: REACT_APPROVE,
    labelKey: "action.react.approve",
    enumerate: (state) => (pending(state) ? [{ type: REACT_APPROVE }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      const r = b.reaction!;
      const act = actById(r.act);
      r.reacted = true;
      b.expect[act.id] = Math.max(b.expect[act.id] ?? 0, E.approve);
      // a nod at this also softens what comes just before it
      for (const a of content.acts) if (a.tier < act.tier) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, E.approve * 0.8);
      tell(ctx, "told.approve", { act: `act.${act.id}` });
      ctx.log("log.react.approve", { act: `act.${act.id}` });
      changeHeroine(ctx, "arousal", 4, "approved");
      ctx.emit("reaction", { how: "approve", act: act.id, patron: r.patron });
    },
  });

  // What he asks for before the shift tells her something too.
  api.events.on("shift:start", (ctx) => {
    const b = bs(ctx.state);
    if (b.directive === "friendly") {
      for (const a of content.acts) if (a.tier <= 2) nudge(ctx, a.id, E.friendly, 60);
      tell(ctx, "told.friendly");
    } else if (b.directive === "reserved") {
      for (const a of content.acts) if (a.tier >= 1) nudge(ctx, a.id, E.reserved);
      tell(ctx, "told.reserved");
    }
    const outfit = content.outfits.find((o) => o.id === b.heroine.outfit);
    if (b.outfitAsked && outfit && outfit.order > 0) tell(ctx, "told.outfit", { outfit: `outfit.${outfit.id}` });
  });
  // Walking in on them and how he took it (the secrecy system does the rest).
  api.events.on("caught:resolved", (ctx, e) => {
    const b = bs(ctx.state);
    const act = b.encounter?.act ?? b.proposals.at(-1)?.act;
    if (!act) return;
    if (e.payload!.choice === "watch") {
      for (const a of content.acts) if (a.tier <= actById(act).tier) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, E.approve);
      tell(ctx, "told.watched", { act: `act.${act}` });
    }
    if (e.payload!.choice === "stop") {
      for (const a of content.acts) if (a.tier >= 3) b.expect[a.id] = E.forbid;
      tell(ctx, "told.stop", { act: `act.${act}` });
    }
  });

  api.invariants.add("expect-bounds", (s) => {
    const b = bs(s);
    for (const [k, v] of Object.entries(b.expect)) if (v < -100 || v > 100 || !content.acts.some((a) => a.id === k)) return `bad expectation ${k}=${v}`;
    if (b.reaction && !b.shift) return "a reaction is pending outside of a shift";
    return null;
  });
}
