import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { bs, patronName, renderLog, TIP_FORMULA } from "@tc/base";
import { CORE_MOVE, loadGame, saveGame, sceneKey } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { engine, mods, newSeed, SAVE_KEY, translator } from "./game";
import type { Lang } from "./game";
import { FormulaTable, HeroineCard, Patrons, RoomMap, StatusBar } from "./panels";
import "./style.css";

// The UI only reads state and dispatches actions. No game rules live here.
function App() {
  const [state, setState] = useState<GameState>(() => engine.init(newSeed()));
  const [lang, setLang] = useState<Lang>("ru");
  const [debug, setDebug] = useState(false);
  const [error, setError] = useState("");
  const t = useMemo(() => translator(lang), [lang]);

  const act = (a: Action) => {
    try {
      setState(engine.dispatch(state, a));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const scene = engine.currentScene(state);
  const problems = engine.checkInvariants(state);
  const actions = engine.listActions(state).filter((a) => a.type !== CORE_MOVE); // moves live on the map
  const common = { state, t, lang };
  const b = bs(state);

  return (
    <main>
      <header>
        <strong>
          {t("ui.day", { day: state.time.day })} - {t(`base.phase.${state.time.phase}`)}
        </strong>
        <span className="spacer" />
        <button onClick={() => setState(engine.init(newSeed()))}>{t("ui.new")}</button>
        <button onClick={() => localStorage.setItem(SAVE_KEY, saveGame(state, engine))}>{t("ui.save")}</button>
        <button
          onClick={() => {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) setState(loadGame(raw, mods).state);
          }}
        >
          {t("ui.load")}
        </button>
        <button onClick={() => setDebug(!debug)}>{t("ui.debug")}</button>
        <button onClick={() => setLang(lang === "en" ? "ru" : "en")}>{lang === "en" ? "RU" : "EN"}</button>
      </header>
      <StatusBar {...common} />

      {(error || problems.length > 0) && <pre className="error">{[error, ...problems].filter(Boolean).join("\n")}</pre>}

      <div className="columns">
        <div>
          <h2>{t("ui.map")}</h2>
          <RoomMap {...common} onAct={act} />

          <h2>{t("ui.actions")}</h2>
          <div className="actions">
            {actions.map((a, i) => (
              <button key={i} onClick={() => act(a)}>
                {t(engine.actionDef(a.type)!.labelKey)}
              </button>
            ))}
          </div>

          <h2>{t("ui.log")}</h2>
          <ul className="log">
            {state.log
              .slice(-40)
              .reverse()
              .map((e, i) => (
                <li key={`${e.turn}-${i}`}>{renderLog(e, t, lang)}</li>
              ))}
          </ul>
        </div>

        <div>
          <h2>{t("ui.heroine")}</h2>
          <HeroineCard {...common} />
          <Patrons {...common} />
        </div>
      </div>

      {debug && (
        <section className="debug">
          <h2>{t("ui.debug")}</h2>
          <p>
            {t("ui.scene")}: <code>{scene ? sceneKey(scene) : "-"}</code> · seed <code>{state.seed}</code> · turn <code>{state.turn}</code>
          </p>
          <div className="formulas">
            {(b.shift?.visits ?? []).map((v) => (
              <FormulaTable
                key={v.patron}
                t={t}
                title={`${patronName(b.patrons[v.patron]!.name, lang)}: tip @20`}
                result={engine.evaluate(TIP_FORMULA, state, { patron: v.patron, bill: 20 })}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
