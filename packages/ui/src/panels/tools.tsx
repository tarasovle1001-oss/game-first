import { useState } from "react";
import { CONSENT_FORMULA, verdictOf, inspect, bs, content, HUSBAND, patronName, renderParams, WIFE } from "@tc/base";
import type { ConsentInput, DeltaRow, DeltaVia } from "@tc/base";
import type { GameState } from "@tc/core";
import { engine } from "../game";
import { Common, reasonLabel } from "./common";
import { fmt } from "./scene";

// ---------------------------------------------------------------- "what if": the consent formula on demand

/** Pick any act, any partner, any place: the rows of her answer right now, without waiting for it to happen. */
export function ConsentCalc({ state, t, lang }: Common) {
  const b = bs(state);
  const [act, setAct] = useState(content.acts.find((a) => a.tier >= 2)?.id ?? content.acts[0]!.id);
  const [partner, setPartner] = useState<string>(HUSBAND);
  const [loc, setLoc] = useState<string>("");
  const [offer, setOffer] = useState(0);
  const here = b.shift?.visits.map((v) => v.patron) ?? [];
  const partners = [HUSBAND, ...here, ...Object.values(b.lodgers).map((l) => l.patron).filter((id) => !here.includes(id))];
  const who = partners.includes(partner) ? partner : HUSBAND;
  const where = loc || state.where[WIFE] || "";
  const res = engine.evaluate<ConsentInput>(CONSENT_FORMULA, state, { act, partner: who, loc: where, offer, pressure: 0 });
  const verdict = verdictOf(res.total);
  return (
    <details className="calc">
      <summary className="cap">{t("calc.title")}</summary>
      <div className="calc-pick">
        <select value={act} onChange={(e) => setAct(e.target.value)}>
          {content.acts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tier} · {t(`act.${a.id}`)}
            </option>
          ))}
        </select>
        <select value={who} onChange={(e) => setPartner(e.target.value)}>
          {partners.map((id) => (
            <option key={id} value={id}>
              {id === HUSBAND ? t("ui.you") : b.patrons[id] ? patronName(b.patrons[id]!.name, lang) : id}
            </option>
          ))}
        </select>
        <select value={where} onChange={(e) => setLoc(e.target.value)}>
          {engine.locations().map((l) => (
            <option key={l.id} value={l.id}>
              {t(l.nameKey)}
            </option>
          ))}
        </select>
        {who !== HUSBAND && (
          <label className="small muted">
            {t("calc.offer")} <input type="number" min={0} max={5000} value={offer} onChange={(e) => setOffer(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
      </div>
      <div className={`calc-total verdict-${verdict}`}>
        <b>{t(`verdict.${verdict}`)}</b> {fmt(res.total)}
        <span className="muted small">
          {" "}
          · {t("calc.need", { yes: content.consent.hesitantAt, glad: content.consent.eagerAt })}
        </span>
      </div>
      <div className="rows open">
        {[...res.rows]
          .sort((a, c) => Math.abs(c.value) - Math.abs(a.value))
          .map((r) => (
            <span key={r.id} className="row">
              {t(r.labelKey)} <b className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</b>
            </span>
          ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- inspector

export const INSPECT_SHORT = 12;
/** What the last action changed and where it came from: big numbers on one line, the rest as small rows with a source. */
export function InspectorBlock({ prev, state, t, lang, what }: Common & { prev: GameState | null; what: string }) {
  const [all, setAll] = useState(false);
  if (!prev)
    return (
      <div className="inspector">
        <div className="insp-head">
          <span className="cap">{t("inspect.title")}</span>
          <span className="muted small">{t("inspect.first")}</span>
        </div>
      </div>
    );
  const ins = inspect(prev, state);
  const label = (r: DeltaRow) => t(r.label, renderParams(r.params, t, lang));
  const amount = (r: DeltaRow) => (r.id.startsWith("perm.") ? t(r.to > 0 ? "inspect.perm.allow" : "inspect.perm.forbid") : `${fmt(r.delta)} ${r.delta > 0 ? "↑" : "↓"}`);
  const tone = (r: DeltaRow) => (r.good === null ? "flat" : r.good ? "pos" : "neg");
  const via = (v: DeltaVia) => (v.key.startsWith("told.") ? t(v.key, renderParams(v.params, t, lang)) : reasonLabel(v.key, t)) + (v.amount !== undefined ? ` ${fmt(v.amount)}` : "");
  // a big number comes down as a row too when somebody left a reason next to it
  const small = ins.rows; // one list: every change with where it came from
  const shown = all ? small : small.slice(0, INSPECT_SHORT);
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="cap">{t("inspect.title")}</span>
        <b>{what}</b>
        {ins.minutes > 0 && <span className="muted small">{t("inspect.minutes", { n: ins.minutes })}</span>}
      </div>
      {ins.rows.length === 0 && <div className="muted small">{t("inspect.none")}</div>}
      {shown.length > 0 && (
        <div className="insp-rows">
          {shown.map((r) => (
            <div key={r.id} className="insp-row" title={`${r.from} → ${r.to}`}>
              <span className="insp-what">{label(r)}</span>
              <b className={tone(r)}>{amount(r)}</b>
              {r.via.length > 0 && (
                <span className="insp-via">
                  {t("inspect.via")} {r.via.map(via).join(", ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {small.length > INSPECT_SHORT && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? t("ui.why.less") : t("inspect.more", { n: small.length - INSPECT_SHORT })}
        </button>
      )}
    </div>
  );
}
