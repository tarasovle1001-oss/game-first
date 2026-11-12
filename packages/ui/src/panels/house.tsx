import { HUSBAND, WIFE, husbandSees } from "@tc/base";
import { CORE_MOVE } from "@tc/core";
import type { Action } from "@tc/core";
import { engine } from "../game";
import { Common, who } from "./common";

/** Who is where, as a grid of small room cards by floor: fits a narrow column, a click walks there. */
export function RoomGrid({ state, t, lang, onAct, open, guess }: Common & { onAct(a: Action): void }) {
  const here = state.where[HUSBAND];
  const knowsHer = open || state.where[WIFE] === here || husbandSees(state, state.where[WIFE] ?? "");
  const moves = engine.listActions(state).filter((a) => a.type === CORE_MOVE && a.actor === HUSBAND);
  const rooms = engine.locations().map((l) => ({ ...l, m: (l.meta as { map: { x: number; y: number } }).map }));
  const floors = [...new Set(rooms.map((r) => r.m.y))].sort((a, c) => a - c);
  return (
    <div className="rgrid">
      {floors.map((y) => (
        <div key={y}>
          <div className="rg-floor">{t(`ui.floor.${y}`)}</div>
          <div className="rg-row">
            {rooms
              .filter((r) => r.m.y === y)
              .sort((a, c) => a.m.x - c.m.x)
              .map((r) => {
                const move = moves.find((a) => a.payload?.to === r.id);
                // what he cannot see from where he stands he does not know: she is drawn where he last saw her, faintly
                const sees = open || r.id === here || husbandSees(state, r.id);
                const herHere = sees ? state.where[WIFE] === r.id : !knowsHer && guess === r.id;
                const people = Object.keys(state.where).filter((id) => (id === WIFE ? herHere : state.where[id] === r.id && (sees || id === HUSBAND)));
                const guests = people.filter((id) => id !== WIFE && id !== HUSBAND);
                return (
                  <button key={r.id} className={`rg-room${r.id === here ? " here" : ""}${move ? " reachable" : ""}${people.length === 0 ? " empty" : ""}`} disabled={!move} onClick={() => move && onAct(move)} title={t(r.nameKey)}>
                    <span className="rg-name">{t(r.nameKey)}</span>
                    <span className="rg-who">
                      {people.includes(HUSBAND) && <i className="husband">{t("ui.you")}</i>}
                      {people.includes(WIFE) && <i className={`wife${sees ? "" : " guess"}`} title={sees ? undefined : t("ui.guess.hint")}>{who(WIFE, state, t, lang)}{sees ? "" : "?"}</i>}
                      {guests.length === 1 && <i className="patron">{who(guests[0]!, state, t, lang)}</i>}
                      {guests.length > 1 && <i className="patron">×{guests.length}</i>}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
