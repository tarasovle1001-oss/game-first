// Pictures for the things that are not an act with a guest or the bed: what she is busy with by day,
// the bathroom, and the short things on the floor (a dare, a deal being struck, him at a guest's table).
import type { ModApi } from "@tc/core";
import { bs, HUSBAND, WIFE } from "../state";
import { HALL, husbandSees } from "./places";

const TASK: Record<string, string> = { cook: "her_cook", tidy: "her_tidy", rest: "her_rest", dress: "her_dress" };

export function registerPictures(api: ModApi) {
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
