// Pictures for the things that are not an act with a guest or the bed: what she is busy with by day,
// the bathroom, and the short things on the floor (a dare, a deal being struck, him at a guest's table).
import type { ModApi } from "@tc/core";
import { bs, HUSBAND, WIFE } from "../state";
import { content } from "../content";
import { HALL, husbandSees } from "./places";
const SAUNA = "cafe.sauna";
import { actById, onScreen } from "./encounters";
import { detail, freshGlance } from "./glance";
import { dressOf } from "./dress";

/** What she has come to him with -> the picture of it. */
const APPROACH: Record<string, string> = { affection: "him_hug", comfort: "him_hug", tease: "wants_him", harassed: "talk", retro: "talk" };

const TASK: Record<string, string> = { cook: "her_cook", tidy: "her_tidy", rest: "her_rest", dress: "her_dress" };

export function registerPictures(api: ModApi) {
  // close-ups of things that happen to him and around her, for the move they happen on
  // from her touch it ends in his trousers; alone behind a door there are no trousers in it - that has a close-up of its own
  api.events.on("husband:came_touch", (ctx, e) => detail(ctx, { id: e.payload?.from === "alone" ? "him_came_alone" : "him_cum_pants", who: HUSBAND }));
  api.events.on("husband:wet_dream", (ctx) => detail(ctx, { id: "wet_sheet", who: HUSBAND }));
  api.events.on("floor:moment", (ctx, e) => {
    const id = e.payload!.id as string;
    if (id === "watches_bend") detail(ctx, { id: "upskirt", who: WIFE, tags: { wear: bs(ctx.state).heroine.panties === "off" ? "bare" : "on" } });
    if (id === "big_tip" || id === "whispers_price") detail(ctx, { id: "tip_tuck", who: WIFE });
  });
  // A small thing that has just happened: his hand on her, a guest's word at a table, her alone behind a door.
  api.scenes.register({
    id: "base.glance",
    priority: 70,
    match(state) {
      const g = freshGlance(state);
      const b = bs(state);
      if (!g || b.encounter || b.caught || b.night?.sex || !onScreen(state, g.loc)) return null;
      return { type: g.type, location: g.loc, participants: g.who, ...(g.tags ? { tags: g.tags } : {}) };
    },
  });
  // She has come over to ask him first about a guest: the two of them, talking, above whatever was just going on at a table.
  api.scenes.register({
    id: "base.ask",
    priority: 73,
    match(state) {
      const b = bs(state);
      const at = state.where[HUSBAND];
      if (!b.ask || !at || state.where[WIFE] !== at || b.night?.sex || b.encounter || b.caught) return null;
      return { type: "talk", location: at, participants: [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }] };
    },
  });
  // She has walked over to him and is waiting for his answer: this outranks the glance of a moment at a table.
  api.scenes.register({
    id: "base.approach",
    priority: 72,
    match(state) {
      const ap = bs(state).approach;
      const at = state.where[HUSBAND];
      if (!ap || !at || state.where[WIFE] !== at || bs(state).night?.sex || bs(state).encounter || bs(state).caught) return null;
      return { type: APPROACH[ap.kind] ?? "talk", location: at, participants: [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }] };
    },
  });
  // She went after a guest who had stepped out: what the two of them are doing there.
  api.scenes.register({
    id: "base.meet",
    priority: 59,
    match(state) {
      const m = bs(state).shift?.meet;
      if (!m || bs(state).encounter || state.where[WIFE] !== m.to || !onScreen(state, m.to)) return null;
      return { type: actById(m.act).scene, location: m.to, participants: [{ id: WIFE, role: "wife" }, { id: m.patron, role: "patron" }], tags: { outfit: dressOf(state) } };
    },
  });
  // She is in a lodger's room at night: for eyes that may see it, the whole of what it came to.
  api.scenes.register({
    id: "base.upstairs",
    priority: 58,
    match(state) {
      const up = bs(state).night?.up;
      if (!up || up.stage !== 2 || !up.act || state.where[WIFE] !== up.room || !onScreen(state, up.room)) return null;
      return { type: actById(up.act).scene, location: up.room, participants: [{ id: WIFE, role: "wife" }, { id: up.patron, role: "patron" }], tags: { outfit: dressOf(state) } };
    },
  });
  // She is in another room with the guests there (the back room, the sauna, a lodger's door): the tray, the talk.
  // What it comes to is an ordinary scene with a guest (base.encounter); this is the picture until then.
  api.scenes.register({
    id: "base.company",
    priority: 58,
    match(state) {
      const b = bs(state);
      const at = b.shift?.attend;
      if (!at || b.encounter || state.where[WIFE] !== at.loc || !onScreen(state, at.loc)) return null;
      const men = b.shift!.visits.filter((v) => state.where[v.patron] === at.loc).map((v) => v.patron);
      const lead = at.patron && men.includes(at.patron) ? at.patron : men[0];
      if (!lead) return null;
      const heat = Math.max(0, ...b.shift!.visits.filter((v) => men.includes(v.patron)).map((v) => v.heat ?? 0));
      const B = content.floor.groups.beats;
      const type = heat >= B.rowdyHeat ? "patron_touching" : heat >= B.warmHeat ? "patron_flirting" : at.why === "tray" || at.why === "serve" ? "serving" : "patron_chatting";
      const sauna = at.loc === SAUNA;
      return { type, location: at.loc, participants: [{ id: WIFE, role: "wife" }, { id: lead, role: "patron" }], tags: { outfit: sauna ? "towel" : dressOf(state), ...(men.length > 1 ? { men: String(Math.min(3, men.length)) } : {}) } };
    },
  });
  api.scenes.register({
    id: "base.show",
    priority: 60,
    match(state) {
      const sh = bs(state).shift;
      const s = sh?.show;
      if (!sh || !s || sh.tick >= s.until || bs(state).encounter || !husbandSees(state, HALL)) return null;
      const guests = sh.visits.map((v) => v.patron);
      if (s.type === "table_sit") {
        if (state.where[HUSBAND] !== HALL || !s.patron) return null;
        return { type: s.type, location: HALL, participants: [{ id: HUSBAND, role: "husband" }, { id: s.patron, role: "patron" }] };
      }
      if (state.where[WIFE] !== HALL) return null;
      return { type: s.type, location: HALL, participants: [{ id: WIFE, role: "wife" }, ...guests.slice(0, 2).map((id, i) => ({ id, role: i ? "patron2" : "patron" }))], tags: { bare: s.type === "walk_naked" ? "all" : "flash" } };
    },
  });
  api.scenes.register({
    id: "base.deal",
    priority: 55,
    match(state) {
      const b = bs(state);
      if (!b.deal || !b.shift || b.encounter || state.where[HUSBAND] !== HALL) return null;
      return { type: "deal", location: HALL, participants: [{ id: HUSBAND, role: "husband" }, { id: b.deal.patron, role: "patron" }, ...(state.where[WIFE] === HALL ? [{ id: WIFE, role: "wife" }] : [])] };
    },
  });
  // Behind the bedroom door with her own drawer: for eyes that may see it, for as long as it lasts.
  api.scenes.register({
    id: "base.solo",
    priority: 6,
    match(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || b.day?.her?.task !== "solo" || !b.solo || state.where[WIFE] !== "home.bedroom" || !onScreen(state, "home.bedroom")) return null;
      return { type: "her_solo", location: "home.bedroom", participants: [{ id: WIFE, role: "wife" }], tags: { toy: b.solo.zone } };
    },
  });
  api.scenes.register({
    id: "base.her_day",
    priority: 5,
    match(state) {
      const b = bs(state);
      const task = b.day?.her?.task;
      const at = state.where[HUSBAND];
      if (state.time.phase !== "prep" || !task || !at || state.where[WIFE] !== at || b.night?.sex) return null;
      const both = [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }];
      if (task === "wash") return { type: b.washedWith === state.time.day ? "bath_together" : "bath_walkin", location: at, participants: both, tags: { outfit: "towel" } };
      return TASK[task] ? { type: TASK[task]!, location: at, participants: both } : null;
    },
  });
}
