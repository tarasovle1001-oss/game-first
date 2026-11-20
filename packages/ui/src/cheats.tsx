import { useState } from "react";
import { bs, content } from "@tc/base";
import type { Action } from "@tc/core";
import { CHEAT_END_SHIFT, CHEAT_FIELDS, CHEAT_MODE, CHEAT_PRESET, CHEAT_PRESETS, CHEAT_SET, CHEAT_STYLE, readField, SCENARIOS } from "@tc/mod-cheats";
import type { Common } from "./panels";

/** A moment kept to come back to: the game as a save, and its move record. */
export interface Bookmark {
  id: number;
  label: string;
  save: string;
  journal: unknown;
}
type Extra = {
  onScenario(id: string, own: { preset?: string; mode?: string }): void;
  bookmarks: Bookmark[];
  onBookmarkAdd(): void;
  onBookmarkGo(b: Bookmark): void;
  onBookmarkDel(id: number): void;
};

/** Debug-only drawer. Every control dispatches a cheat action, so cheating is replayable like any other move. */
export function CheatPanel({ state, t, onAct, onClose, onScenario, bookmarks, onBookmarkAdd, onBookmarkGo, onBookmarkDel }: Common & { onAct(a: Action): void; onClose(): void } & Extra) {
  const b = bs(state);
  const [wife, setWife] = useState("");
  const [mode, setMode] = useState("");
  const groups = [...new Set(CHEAT_FIELDS.map((f) => f.group))];
  return (
    <aside className="cheats">
      <div className="cheat-head">
        <b>{t("cheats.title")}</b>
        <span className="muted small">{t("cheats.hint")}</span>
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="cap gap">{t("cheats.scenarios")}</div>
      <div className="muted small">{t("cheats.scenarios.hint")}</div>
      <div className="cheat-row">
        <label className="small">
          {t("cheats.scenario.wife")}{" "}
          <select value={wife} onChange={(e) => setWife(e.target.value)}>
            <option value="">{t("cheats.scenario.own")}</option>
            {content.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`preset.${p.id}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="small">
          {t("cheats.scenario.mode")}{" "}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">{t("cheats.scenario.own")}</option>
            <option value="hidden">NTR</option>
            <option value="open">NTS</option>
          </select>
        </label>
      </div>
      <div className="cheat-row wrap">
        {SCENARIOS.map((sc) => (
          <button key={sc.id} onClick={() => onScenario(sc.id, { ...(wife ? { preset: wife } : {}), ...(mode ? { mode } : {}) })}>
            {t(`cheats.scenario.${sc.id}`)}
          </button>
        ))}
      </div>
      <div className="cap gap">{t("cheats.bookmarks")}</div>
      <div className="cheat-row">
        <button onClick={onBookmarkAdd}>{t("cheats.bookmark.add")}</button>
      </div>
      {bookmarks.length === 0 && <div className="muted small">{t("cheats.bookmark.none")}</div>}
      {bookmarks.map((bm) => (
        <div key={bm.id} className="cheat-row">
          <span className="small">{bm.label}</span>
          <button onClick={() => onBookmarkGo(bm)}>{t("cheats.bookmark.go")}</button>
          <button className="link" onClick={() => onBookmarkDel(bm.id)} title={t("cheats.bookmark.del")}>
            ✕
          </button>
        </div>
      ))}
      <div className="cap gap">{t("cheats.preset")}</div>
      <div className="cheat-row">
        {CHEAT_PRESETS.map((id) => (
          <button key={id} onClick={() => onAct({ type: CHEAT_PRESET, payload: { id } })}>
            {t(`cheats.preset.${id}`)}
          </button>
        ))}
      </div>
      <div className="cheat-row">
        <button onClick={() => onAct({ type: CHEAT_MODE, payload: { mode: b.mode === "open" ? "hidden" : "open" } })}>
          {t("cheats.mode")}: {b.mode === "open" ? "NTS" : "NTR"}
        </button>
        {(["naive", "jealous", "encouraging"] as const).map((style) => (
          <button key={style} className={b.husband.style === style ? "on" : ""} onClick={() => onAct({ type: CHEAT_STYLE, payload: { style } })}>
            {t(`husband.style.${style}`)}
          </button>
        ))}
        {state.time.phase === "shift" && <button onClick={() => onAct({ type: CHEAT_END_SHIFT })}>{t("cheats.end_shift")}</button>}
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="cap gap">{t(`cheats.group.${g}`)}</div>
          {CHEAT_FIELDS.filter((f) => f.group === g).map((f) => {
            const value = Math.round(readField(state, f.path) * 10) / 10;
            const set = (raw: string) => {
              const v = Number(raw);
              if (raw !== "" && v >= f.min && v <= f.max && v !== value) onAct({ type: CHEAT_SET, payload: { path: f.path, value: v } });
            };
            return (
              <label key={f.path} className="cheat-field">
                <span>{t(f.labelKey)}</span>
                {/* a slider only where the range is a plain 0..100: money does not fit on one */}
                {f.max <= 100 ? <input type="range" min={f.min} max={f.max} value={value} onChange={(e) => set(e.target.value)} /> : <span />}
                <input type="number" min={f.min} max={f.max} value={value} onChange={(e) => set(e.target.value)} />
              </label>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
