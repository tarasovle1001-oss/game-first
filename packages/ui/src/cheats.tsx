import { bs } from "@tc/base";
import type { Action } from "@tc/core";
import { CHEAT_END_SHIFT, CHEAT_FIELDS, CHEAT_MODE, CHEAT_SET, CHEAT_STYLE, readField } from "@tc/mod-cheats";
import type { Common } from "./panels";

/** Debug-only panel. Every control dispatches a cheat action, so cheating is replayable like any other move. */
export function CheatPanel({ state, t, onAct }: Common & { onAct(a: Action): void }) {
  const b = bs(state);
  const groups = [...new Set(CHEAT_FIELDS.map((f) => f.group))];
  return (
    <section className="cheats">
      <div className="card-title">{t("cheats.title")}</div>
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
      <div className="cheat-groups">
        {groups.map((g) => (
          <div key={g}>
            <div className="cap">{t(`cheats.group.${g}`)}</div>
            {CHEAT_FIELDS.filter((f) => f.group === g).map((f) => (
              <label key={f.path} className="cheat-field">
                <span>{t(f.labelKey)}</span>
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={Math.round(readField(state, f.path) * 10) / 10}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (e.target.value !== "" && value >= f.min && value <= f.max) onAct({ type: CHEAT_SET, payload: { path: f.path, value } });
                  }}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
