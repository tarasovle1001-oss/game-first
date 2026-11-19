// Pictures for the things that are not an act with a guest or the bed: what she is busy with by day,
// the bathroom, and the short things on the floor (a dare, a deal being struck, him at a guest's table).
import type { ModApi } from "@tc/core";
import { bs, HUSBAND, WIFE } from "../state";
import { content } from "../content";
import { HALL, husbandSees } from "./places";
const LOUNGE = "cafe.lounge";
const SAUNA = "cafe.sauna";
import { actById, onScreen } from "./encounters";
import { freshGlance } from "./glance";
import { dressOf } from "./dress";

/** What she has come to him with -> the picture of it. */
const APPROACH: Record<string, string> = { affection: "him_hug", comfort: "him_hug", tease: "wants_him", harassed: "talk", retro: "talk" };

const TASK: Record<string, string> = { cook: "her_cook", tidy: "her_tidy", rest: "her_rest", dress: "her_dress" };

export function registerPictures(api: ModApi) {
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
  // She has walked over to him and is waiting for his answer.
  api.scenes.register({
    id: "base.approach",
    priority: 65,
    match(state) {
      const ap = bs(state).approach;
      const at = state.where[HUSBAND];
      if (!ap || !at || state.where[WIFE] !== at || bs(state).night?.sex) return null;
      return { type: APPROACH[ap.kind] ?? "talk", location: at, participants: [{ id: WIFE, role: "wife" }, { id: HUSBAND, role: "husband" }] };
    },
  });
  // She is in the back room with a company: the tray, the talk, and what it came to.
  api.scenes.register({
    id: "base.company",
    priority: 58,
    match(state) {
      const b = bs(state);
      const g = b.shift?.group;
      if (!g || b.encounter || g.herOut === undefined) return null;
      const venue = g.sauna ? SAUNA : LOUNGE;
      if (state.where[WIFE] !== venue || !onScreen(state, venue)) return null;
      const men = [{ id: g.lead, role: "patron" }];
      const warm = g.heat >= content.floor.groups.beats.rowdyHeat ? "patron_touching" : g.heat >= content.floor.groups.beats.warmHeat ? "patron_flirting" : "patron_chatting";
      const type = g.round ? (g.round.beat < 2 ? "serving" : warm) : g.did ? actById(g.did).scene : "serving";
      return { type, location: venue, participants: [{ id: WIFE, role: "wife" }, ...men], tags: { outfit: dressOf(state), men: String(Math.min(3, g.size)), ...(g.sauna ? { outfit: "towel" } : {}) } };
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
