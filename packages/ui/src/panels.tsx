import { bs, content, HUSBAND, patronName, WIFE } from "@tc/base";
import type { Patron } from "@tc/base";
import { CORE_MOVE } from "@tc/core";
import type { Action, FormulaResult, GameState } from "@tc/core";
import { engine } from "./game";
import type { Lang, T } from "./game";

interface Common {
  state: GameState;
  t: T;
  lang: Lang;
}

export function StatusBar({ state, t }: Common) {
  const b = bs(state);
  const total = content.balance.shift.ticks;
  return (
    <div className="status">
      <span>
        {t("ui.money")}: <b>{b.money}</b>
      </span>
      <span>
        {t("ui.debt")}: <b>{b.debt}</b>
      </span>
      <span>
        {t("ui.reputation")}: <b>{Math.round(b.reputation)}</b>
      </span>
      <span>
        {t("ui.stock")}: <b>{b.stock}</b>
      </span>
      {b.shift && <span>{t("ui.tick", { tick: b.shift.tick, total })}</span>}
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${value}%` }} />
      </div>
      <span className="num">{Math.round(value)}</span>
    </div>
  );
}

export function HeroineCard({ state, t }: Common) {
  const h = bs(state).heroine;
  return (
    <div className="card">
      {(["energy", "mood", "arousal", "drunk"] as const).map((k) => (
        <Bar key={k} label={t(`stat.${k}`)} value={h[k]} />
      ))}
      <div className="sep" />
      {(Object.keys(h.traits) as (keyof typeof h.traits)[]).map((k) => (
        <Bar key={k} label={t(`trait.${k}`)} value={h.traits[k]} />
      ))}
    </div>
  );
}

const who = (id: string, state: GameState, t: T, lang: Lang) => {
  if (id === WIFE || id === HUSBAND) return t(`base.entity.${id}`);
  const p = bs(state).patrons[id];
  return p ? patronName(p.name, lang) : id;
};

/** Rooms on a grid. Click a linked room to walk there. */
export function RoomMap({ state, t, lang, onAct }: Common & { onAct(a: Action): void }) {
  const here = state.where[HUSBAND];
  const moves = engine.listActions(state).filter((a) => a.type === CORE_MOVE && a.actor === HUSBAND);
  const cell = 88;
  const rooms = engine.locations();
  const pos = (id: string) => engine.location(id)!.meta!.map as { x: number; y: number; w: number; h: number };
  const width = Math.max(...rooms.map((r) => pos(r.id).x + pos(r.id).w)) * cell;
  const height = Math.max(...rooms.map((r) => pos(r.id).y + pos(r.id).h)) * cell;
  return (
    <div className="map" style={{ width, height }}>
      {rooms.map((r) => {
        const m = pos(r.id);
        const move = moves.find((a) => a.payload?.to === r.id);
        const people = Object.entries(state.where).filter(([, loc]) => loc === r.id);
        return (
          <button
            key={r.id}
            className={`room zone-${r.zone}${r.id === here ? " here" : ""}${move ? " reachable" : ""}`}
            style={{ left: m.x * cell, top: m.y * cell, width: m.w * cell - 6, height: m.h * cell - 6 }}
            disabled={!move}
            onClick={() => move && onAct(move)}
          >
            <span className="room-name">{t(r.nameKey)}</span>
            <span className="dots">
              {people.map(([id]) => (
                <i key={id} className={`dot ${id === WIFE ? "wife" : id === HUSBAND ? "husband" : "patron"}`} title={who(id, state, t, lang)} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PatronRow({ p, t, lang, extra }: { p: Patron; t: T; lang: Lang; extra?: string }) {
  return (
    <li>
      <b>{patronName(p.name, lang)}</b> <span className="muted">({t(`patron.type.${p.type}`)})</span>
      {p.regular && <span className="tag">★</span>}
      {extra && <span className="muted"> {extra}</span>}
      <br />
      <span className="muted small">
        {t("ui.patron.line", { age: p.age, build: t(`patron.build.${p.build}`), approach: t(`patron.approach.${p.approach}`) })}
        {" · "}
        {t("ui.patron.memory", { visits: p.memory.visits, interest: Math.round(p.memory.interest), affinity: Math.round(p.memory.affinity) })}
      </span>
    </li>
  );
}

export function Patrons({ state, t, lang }: Common) {
  const b = bs(state);
  const present = b.shift?.visits ?? [];
  const regulars = Object.values(b.patrons).filter((p) => p.regular && !present.some((v) => v.patron === p.id));
  return (
    <>
      <h2>{t("ui.patrons")}</h2>
      <ul className="patrons">
        {present.length === 0 && <li className="muted">{t("ui.nobody")}</li>}
        {present.map((v) => (
          <PatronRow key={v.patron} p={b.patrons[v.patron]!} t={t} lang={lang} />
        ))}
      </ul>
      {regulars.length > 0 && (
        <>
          <h2>{t("ui.regulars")}</h2>
          <ul className="patrons">
            {regulars.map((p) => (
              <PatronRow key={p.id} p={p} t={t} lang={lang} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Named rows of any formula: the same widget serves tips now and consent later. */
export function FormulaTable({ result, t, title }: { result: FormulaResult; t: T; title?: string }) {
  const fmt = (v: number) => (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toString();
  return (
    <table className="formula">
      {title && <caption>{title}</caption>}
      <tbody>
        {result.rows.map((r) => (
          <tr key={r.id}>
            <td>{t(r.labelKey)}</td>
            <td className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</td>
          </tr>
        ))}
        <tr className="total">
          <td>{t("ui.total")}</td>
          <td>{fmt(result.total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
