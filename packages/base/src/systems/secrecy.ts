// NTR and NTS. While it is hidden, what he notices turns into suspicion. Walking in on them,
// or a confession, opens it for good. Once open, his presence stops being a wall and her power over him grows.
import type { Ctx, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { actById, endEncounter, isIntimate } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, husbandNextTo, husbandSees } from "./places";

export const CAUGHT_STOP = "base/caught-stop";
export const CAUGHT_WATCH = "base/caught-watch";
export const CONFRONT = "base/confront";
const S = content.secrecy;

function suspect(ctx: Ctx, amount: number) {
  const b = bs(ctx.state);
  if (b.mode !== "hidden") return;
  b.suspicion = clamp(b.suspicion + amount * S.styleFactor[b.husband.style]);
}

/** One-way: from here on she does not hide it. */
export function goOpen(ctx: Ctx, reason: string) {
  const b = bs(ctx.state);
  if (b.mode === "open") return;
  b.mode = "open";
  b.suspicion = 100;
  b.secretKnows = false;
  b.caught = null;
  ctx.log("log.mode.open");
  ctx.emit("mode:changed", { mode: "open", reason });
}

export function registerSecrecy(api: ModApi) {
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { witnessed, tier, intimate } = e.payload as { witnessed: boolean; tier: number; intimate: boolean };
    if (b.mode === "hidden") {
      if (witnessed && tier >= 2) suspect(ctx, tier * S.sawPublicPerTier);
      if (!witnessed && intimate) {
        b.secretActsToday += 1;
        const { patron, loc } = e.payload as { patron: string; loc: string };
        const name = `@name:${b.patrons[patron]!.name}`;
        if (husbandSees(ctx.state, HALL)) {
          // he watches them walk off together
          suspect(ctx, S.sawThemLeave);
          ctx.log("log.hint.left_together", { name, room: `loc.${loc}` });
          if (b.shift) b.shift.interrupt = true;
        } else if (husbandNextTo(ctx.state, loc)) {
          // he is next door: he hears something
          suspect(ctx, S.heardNextDoor);
          ctx.log("log.hint.noise", { room: `loc.${loc}` });
          if (b.shift) b.shift.interrupt = true;
        }
      }
    } else if (tier >= 2) {
      b.power = clamp(b.power + (witnessed ? S.powerPerSeen : intimate ? S.powerPerTold : 0));
    }
  });

  // Things that do not add up, noticed when the evening is over.
  api.events.on("shift:end", (ctx, e) => {
    const b = bs(ctx.state);
    if (b.mode !== "hidden" || b.secretKnows) return;
    const { income, tips } = e.payload as { income: number; tips: number };
    if (tips > income * S.oddTipsShare && b.secretActsToday > 0) {
      suspect(ctx, S.oddTips);
      ctx.log("log.hint.tips", { tips });
    }
  });
  // The morning after: a woman with nothing to hide looks you in the eye.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase !== "night" || b.mode !== "hidden" || b.secretKnows || b.secretActsToday === 0) return;
    if (ctx.rng.chance((100 - b.heroine.traits.honesty) / 100 + 0.2)) return; // she carries it off
    suspect(ctx, S.guiltyLook);
    ctx.log("log.hint.guilty");
  });

  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    if (b.mode === "hidden" && !b.secretKnows) {
      suspect(ctx, b.secretActsToday * S.tracePerSecretAct);
      b.suspicion = clamp(b.suspicion - S.fadePerDay);
    }
    b.secretActsToday = 0;
  });

  // He opens the door at the wrong moment.
  api.events.on("entity:moved", (ctx, e) => {
    const b = bs(ctx.state);
    const { id, from, to } = e.payload as { id: string; from: string; to: string };
    if (id !== HUSBAND || b.mode !== "hidden") return;
    const enc = b.encounter;
    if (b.caught && enc && from === enc.loc) {
      // he backed out before they noticed: now he knows, and she does not know that he does
      b.caught = null;
      b.secretKnows = true;
      b.suspicion = 100;
      ctx.log("log.caught.leave");
      ctx.emit("caught:resolved", { choice: "leave" });
      return;
    }
    if (enc && to === enc.loc && isIntimate(actById(enc.act))) {
      b.caught = { patron: enc.patron, act: enc.act };
      if (b.shift) b.shift.interrupt = true;
      ctx.log("log.caught", { name: `@name:${b.patrons[enc.patron]!.name}`, act: `act.${enc.act}` });
      ctx.emit("caught", { patron: enc.patron, act: enc.act });
    }
  });
  // If it is over before he decided, he was seen standing there.
  api.events.on("encounter:ended", (ctx) => {
    if (bs(ctx.state).caught) goOpen(ctx, "caught");
  });

  const caughtNow = (state: Parameters<typeof bs>[0]) => state.time.phase === "shift" && bs(state).caught !== null;
  api.actions.register({
    id: CAUGHT_STOP,
    labelKey: "action.caught.stop",
    enumerate: (state) => (caughtNow(state) ? [{ type: CAUGHT_STOP }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      const p = b.patrons[b.caught!.patron]!;
      const visit = b.shift!.visits.find((v) => v.patron === p.id);
      ctx.log("log.caught.stop", { name: `@name:${p.name}` });
      b.caught = null;
      goOpen(ctx, "caught");
      endEncounter(ctx, true);
      if (visit) {
        visit.blocked = true;
        visit.stay = 0; // he is out of the door
      }
      p.memory.affinity = clamp(p.memory.affinity - 15, -100, 100);
      p.memory.interest = clamp(p.memory.interest - 10);
      changeHeroine(ctx, "mood", -12, "caught");
      const h = b.heroine;
      h.traits.fidelity = clamp(h.traits.fidelity + 4);
      h.marriage.resent = clamp(h.marriage.resent + 6);
      b.power = clamp(b.power - 5);
      ctx.emit("caught:resolved", { choice: "stop" });
    },
  });
  api.actions.register({
    id: CAUGHT_WATCH,
    labelKey: "action.caught.watch",
    enumerate: (state) => (caughtNow(state) ? [{ type: CAUGHT_WATCH }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      ctx.log("log.caught.watch", { name: `@name:${b.patrons[b.caught!.patron]!.name}` });
      b.caught = null;
      goOpen(ctx, "caught");
      b.power = clamp(b.power + 10);
      changeHeroine(ctx, "arousal", 8, "watched");
      ctx.emit("caught:resolved", { choice: "watch" });
    },
  });

  // At night he can put it to her, once he has enough to go on.
  api.actions.register({
    id: CONFRONT,
    labelKey: "action.confront",
    enumerate(state) {
      const b = bs(state);
      const ready = b.secretKnows || b.suspicion >= S.confrontAt;
      return state.time.phase === "night" && b.mode === "hidden" && ready && b.night && !b.night.asked ? [{ type: CONFRONT }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.night!.asked = true;
      const nothingToHide = Object.values(b.patrons).every((p) => p.memory.tier < 2);
      if (nothingToHide) {
        ctx.log("log.confront.nothing");
        b.suspicion = clamp(b.suspicion - 30);
        h.marriage.resent = clamp(h.marriage.resent + 4);
      } else if (b.secretKnows || h.traits.honesty >= S.confessHonesty || b.suspicion >= 95) {
        ctx.log("log.confront.admit");
        goOpen(ctx, "confession");
      } else {
        ctx.log("log.confront.deny");
        b.suspicion = clamp(b.suspicion - 20);
        h.traits.honesty = clamp(h.traits.honesty - 4);
        h.marriage.resent = clamp(h.marriage.resent + 3);
      }
    },
  });

  // Once she has the upper hand, some nights she decides what happens in the bedroom.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase !== "night" || b.mode !== "open" || !b.night) return;
    const L = S.lead;
    if (b.power < L.tease || !ctx.rng.chance(b.power * L.chancePerPower)) return;
    const kind = b.power >= L.ignore ? "fd_ignore" : b.power >= L.facesit ? "fd_facesit" : "fd_tease";
    b.night.scene = kind;
    b.night.asked = true; // tonight he does not get to ask
    if (kind === "fd_facesit") {
      b.heroine.orgasms += 1;
      b.heroine.satisfied = 100;
      changeHeroine(ctx, "arousal", -b.heroine.arousal + 8, "her lead");
      changeHeroine(ctx, "mood", 6, "her lead");
    }
    b.power = clamp(b.power + 1);
    ctx.log(`log.lead.${kind}`);
    ctx.emit("lead", { kind });
  });
  // How long he has gone without: counted at the end of each night.
  api.events.on("husband:act", (ctx) => {
    bs(ctx.state).denied = -1; // tonight does not count
  });
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "night") bs(ctx.state).denied += 1;
  });

  api.scenes.register({
    id: "base.caught",
    priority: 200,
    match(state) {
      const b = bs(state);
      if (!b.caught || !b.encounter) return null;
      return {
        type: "caught",
        location: b.encounter.loc,
        participants: [
          { id: WIFE, role: "wife" },
          { id: b.caught.patron, role: "patron" },
          { id: HUSBAND, role: "husband" },
        ],
      };
    },
  });

  api.invariants.add("secrecy-consistent", (s) => {
    const b = bs(s);
    if (b.suspicion < 0 || b.suspicion > 100 || b.power < 0 || b.power > 100) return "suspicion or power out of range";
    if (b.caught && (!b.encounter || b.encounter.patron !== b.caught.patron)) return "caught without a matching encounter";
    if (b.caught && b.mode !== "hidden") return "caught while it is already open";
    if (b.caught && s.where[HUSBAND] !== b.encounter?.loc) return "caught but the husband is not in the room";
    return null;
  });
}
