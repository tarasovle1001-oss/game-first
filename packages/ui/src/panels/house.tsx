import { HUSBAND, WIFE, bs, content, husbandSees } from "@tc/base";
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
  const group = bs(state).shift?.group;
  const members = new Set((bs(state).shift?.visits ?? []).filter((v) => v.group).map((v) => v.patron));
  // who is waiting for an order, room by room; what he can serve himself right now
  const serves = engine.listActions(state).filter((a) => a.type === "base/serve");
  const ORDER_EVERY = content.balance.shift.orderEveryMinutes;
  const waitingIn = (room: string) => (bs(state).shift?.visits ?? []).filter((v) => !v.group && v.out === undefined && state.where[v.patron] === room && bs(state).encounter?.patron !== v.patron && (v.served === 0 || v.sinceOrder >= ORDER_EVERY));
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
                const guests = people.filter((id) => id !== WIFE && id !== HUSBAND && !members.has(id));
                const waiting = sees ? waitingIn(r.id) : [];
                const serve = serves.find((a) => waiting.some((v) => v.patron === a.payload?.patron));
                // a company that was let in sits in the small hall (or the sauna) as one party, not as separate guests
                // a room that is let shows whose it is, whether he is in it right now or not
                const lodger = bs(state).lodgers?.[r.id];
                const party = group && group.pending === undefined && r.id === (group.sauna ? "cafe.sauna" : "cafe.lounge") ? group.size : 0;
                return (
                  <button key={r.id} className={`rg-room${r.id === here ? " here" : ""}${move ? " reachable" : ""}${people.length === 0 && !party && !lodger ? " empty" : ""}`} disabled={!move} onClick={() => move && onAct(move)} title={t(r.nameKey)}>
                    <span className="rg-name">{t(r.nameKey)}</span>
                    <span className="rg-who">
                      {people.includes(HUSBAND) && <i className="husband">{t("ui.you")}</i>}
                      {people.includes(WIFE) && <i className={`wife${sees ? "" : " guess"}`} title={sees ? undefined : t("ui.guess.hint")}>{who(WIFE, state, t, lang)}{sees ? "" : "?"}</i>}
                      {guests.length === 1 && <i className="patron">{who(guests[0]!, state, t, lang)}</i>}
                      {guests.length > 1 && <i className="patron">×{guests.length}</i>}
                      {party > 0 && <i className="patron">{t("ui.party", { n: party })}</i>}
                      {lodger && !guests.includes(lodger.patron) && <i className="patron booked" title={t("ui.booked.hint", { n: lodger.nights })}>{t("ui.booked", { name: who(lodger.patron, state, t, lang) })}</i>}
                    </span>
                    {waiting.length > 0 && (
                      // an order is waiting: an orange frame; in the same room and free to take it, a full orange plate that serves
                      <span
                        className={`rg-order${serve ? " can" : ""}`}
                        role={serve ? "button" : undefined}
                        onClick={(e) => {
                          if (!serve) return;
                          e.stopPropagation();
                          onAct(serve);
                        }}
                      >
                        {serve ? t("ui.order.serve", { name: who(serve.payload!.patron as string, state, t, lang) }) : t("ui.order.waiting", { n: waiting.length })}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
