import { bs } from "@tc/base";
import type { Action } from "@tc/core";
import { CHEAT_END_SHIFT, CHEAT_FIELDS, CHEAT_MODE, CHEAT_PRESET, CHEAT_PRESETS, CHEAT_SET, CHEAT_STYLE, readField } from "@tc/mod-cheats";
import type { Common } from "./panels";

/** Debug-only drawer. Every control dispatches a cheat action, so cheating is replayable like any other move. */
export function CheatPanel({ state, t, onAct, onClose }: Common & { onAct(a: Action): void; onClose(): void }) {
  const b = bs(state);
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
