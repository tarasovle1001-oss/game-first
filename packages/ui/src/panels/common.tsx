import { bs, HUSBAND, patronName, renderParams, WIFE } from "@tc/base";
import type { Action, GameState } from "@tc/core";
import { engine } from "../game";
import type { Lang, T } from "../game";

export interface Common {
  /** Where he last saw her with his own eyes. */
  guess?: string;
  state: GameState;
  t: T;
  lang: Lang;
  /** Transparent mode: show what the husband could not know (unseen log lines, her hidden sides, every answer). */
  open?: boolean;
}

export const actionLabel = (a: Action, t: T, lang: Lang) => {
  const def = engine.actionDef(a.type)!;
  const d = def.describe?.(a);
  return d ? t(d.key, renderParams(d.params, t, lang)) : t(def.labelKey);
};

export const who = (id: string, state: GameState, t: T, lang: Lang) => {
  if (id === HUSBAND) return t("ui.you");
  if (id === WIFE) return t("base.entity.wife");
  const p = bs(state).patrons[id];
  return p ? patronName(p.name, lang) : id;
};

export function Bar({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track">
        <div className={`fill ${tone ?? ""}`} style={{ width: `${value}%` }} />
      </div>
      <span className="num">{Math.round(value)}</span>
    </div>
  );
}

export function reasonLabel(r: string, t: Common["t"]) {
  // an event name ("shift:tick") or "action": where the inspector saw the number move
  for (const k of [`reason.${r}`, `source.${r.replace(/[:-]/g, "_")}`, `act.${r}`, `day.${r}`]) {
    const s = t(k);
    if (s !== k) return s;
  }
  // a small thing at a table: named by its id, it has no short name of its own
  if (t(`log.moment.${r}`) !== `log.moment.${r}`) return `${t("source.moment")} (${r})`;
  return r;
}
