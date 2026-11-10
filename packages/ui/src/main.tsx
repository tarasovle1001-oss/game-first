import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { bs, WAIT } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, loadGame, saveGame, sceneKey } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { engine, mods, newSeed, SAVE_KEY, translator } from "./game";
import type { Lang } from "./game";
import { actionLabel, GuestsTab, HeroineTab, Log, Rooms, ScenePanel, TopBar, WhyTab } from "./panels";
import "./style.css";

type Tab = "her" | "guests" | "why";

// The UI only reads state and dispatches actions. No game rules live here.
function App() {
  const [state, setState] = useState<GameState>(() => engine.init(newSeed()));
  const [lang, setLang] = useState<Lang>("ru");
  const [debug, setDebug] = useState(false);
  const [tab, setTab] = useState<Tab>("her");
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

  const all = engine.listActions(state);
  const waits = all.filter((a) => a.type === WAIT);
  const advance = all.find((a) => a.type === CORE_ADVANCE);
  const other = all.filter((a) => a.type !== WAIT && a.type !== CORE_ADVANCE && a.type !== CORE_MOVE);

  // keys 1-4 for the waits, Enter for the next phase
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= waits.length) act(waits[n - 1]!);
      else if (e.key === "Enter" && advance) act(advance);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const scene = engine.currentScene(state);
  const problems = engine.checkInvariants(state);
  const common = { state, t, lang };
  const b = bs(state);

  return (
    <div className="app">
      <header>
        <TopBar {...common} />
        <div className="tools">
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
          <button className={debug ? "on" : ""} onClick={() => setDebug(!debug)}>
            {t("ui.debug")}
          </button>
          <button onClick={() => setLang(lang === "en" ? "ru" : "en")}>{lang === "en" ? "RU" : "EN"}</button>
        </div>
      </header>

      {(error || problems.length > 0) && <pre className="error">{[error, ...problems].filter(Boolean).join("\n")}</pre>}

      <div className="layout">
        <aside className="col-log">
          <div className="cap">{t("ui.log")}</div>
          <Log {...common} debug={debug} />
        </aside>

        <section className="col-main">
          <ScenePanel {...common} scene={scene} />
          <div className="cap gap">{t("ui.where")}</div>
          <Rooms {...common} onAct={act} />
          {debug && (
            <p className="muted small mono">
              scene {scene ? sceneKey(scene) : "-"} · seed {state.seed} · turn {state.turn}
              {b.encounter && ` · encounter ${b.encounter.act}@${b.encounter.loc} with ${b.encounter.patron}`}
            </p>
          )}
        </section>

        <aside className="col-side">
          {waits.length > 0 && (
            <div className="card">
              <div className="card-title">{t("ui.wait")}</div>
              <div className="muted small">{t("ui.wait.hint")}</div>
              <div className="waits">
                {waits.map((a, i) => (
                  <button key={i} className={a.payload?.until ? "wide" : ""} onClick={() => act(a)}>
                    <kbd>{i + 1}</kbd> {actionLabel(a, t, lang)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {state.time.phase === "shift" && waits.length === 0 && <div className="muted">{t("ui.closing")}</div>}
          {other.length > 0 && (
            <div className="card">
              <div className="card-title">{t("ui.business")}</div>
              <div className="stack">
                {other.map((a, i) => (
                  <button key={i} onClick={() => act(a)}>
                    {actionLabel(a, t, lang)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {advance && (
            <button className="primary" onClick={() => act(advance)}>
              <kbd>↵</kbd> {actionLabel(advance, t, lang)}
            </button>
          )}

          <div className="tabs">
            {(["her", "guests", "why"] as Tab[]).map((k) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {t(`ui.tab.${k}`)}
                {k === "guests" && b.shift ? ` ${b.shift.visits.length}` : ""}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {tab === "her" && <HeroineTab {...common} />}
            {tab === "guests" && <GuestsTab {...common} />}
            {tab === "why" && <WhyTab {...common} debug={debug} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
