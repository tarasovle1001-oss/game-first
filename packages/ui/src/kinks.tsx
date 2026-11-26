import { useState } from "react";
import { cleanKinks, content } from "@tc/base";
import type { T } from "./game";

// Kink switches (27.11): directions with a tick each, unfolding into their items. What is off never comes up in the game.
// The last choice is the player's profile: new games start from it.
const PROFILE = "tc_kinks";
export function loadKinkProfile(): string[] {
  try {
    return cleanKinks(JSON.parse(localStorage.getItem(PROFILE) ?? "[]"));
  } catch {
    return [];
  }
}
export function saveKinkProfile(off: string[]) {
  try {
    localStorage.setItem(PROFILE, JSON.stringify(cleanKinks(off)));
  } catch {
    /* no storage: it lasts for this visit */
  }
}

/** The switches themselves. `off`: ids turned off (directions or items); `onChange` gets the cleaned list. */
export function KinkSwitches({ t, off, onChange }: { t: T; off: string[]; onChange(off: string[]): void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ids = new Set(off);
  const isOff = (dir: string, item?: string) => ids.has(dir) || (item !== undefined && ids.has(item));
  const set = (next: Set<string>) => onChange(cleanKinks([...next]));
  const toggleDir = (dir: string, items: string[]) => {
    const next = new Set(ids);
    const anyOn = items.some((i) => !isOff(dir, i));
    for (const i of items) next.delete(i);
    if (anyOn) next.add(dir);
    else next.delete(dir);
    set(next);
  };
  const toggleItem = (dir: string, item: string, items: string[]) => {
    const next = new Set(ids);
    // the whole direction was off: turning one item on turns the others off one by one
    if (next.has(dir)) {
      next.delete(dir);
      for (const i of items) if (i !== item) next.add(i);
    } else if (next.has(item)) next.delete(item);
    else next.add(item);
    // every item off = the direction off
    if (items.every((i) => next.has(i))) {
      for (const i of items) next.delete(i);
      next.add(dir);
    }
    set(next);
  };
  return (
    <div className="kinks">
      <p className="muted small">{t("ui.kinks.about")}</p>
      {content.kinks.directions.map((d) => {
        const items = d.items.map((i) => i.id);
        const on = items.filter((i) => !isOff(d.id, i)).length;
        const state = on === items.length ? "all" : on === 0 ? "none" : "some";
        return (
          <div key={d.id} className={`kink-dir ${state}`}>
            <label className="check">
              <input type="checkbox" checked={on > 0} ref={(el) => el && (el.indeterminate = state === "some")} onChange={() => toggleDir(d.id, items)} />
              <b>{t(`kink.${d.id}`)}</b>
              <span className="muted small"> - {t(`ui.kinks.${state}`)}</span>
            </label>
            <button className="link small" onClick={() => setOpen(open === d.id ? null : d.id)}>
              {open === d.id ? t("ui.kinks.close") : t("ui.kinks.open")}
            </button>
            {open === d.id && (
              <div className="kink-items">
                {d.items.map((i) => (
                  <label key={i.id} className="check">
                    <input type="checkbox" checked={!isOff(d.id, i.id)} onChange={() => toggleItem(d.id, i.id, items)} />
                    {t(`kink.${d.id}.${i.id}`)}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The switches as a dialog during the game. */
export function KinkDialog({ t, off, onDone, onCancel }: { t: T; off: string[]; onDone(off: string[]): void; onCancel(): void }) {
  const [now, setNow] = useState(off);
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h1>{t("ui.kinks.title")}</h1>
        <KinkSwitches t={t} off={now} onChange={setNow} />
        <div className="dialog-actions">
          <button onClick={onCancel}>{t("ui.newgame.cancel")}</button>
          <button className="primary" onClick={() => onDone(now)}>
            {t("ui.kinks.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
