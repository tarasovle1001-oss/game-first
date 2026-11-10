import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { baseLocales, baseMod } from "@tc/base";
import { createEngine, createTranslator, loadGame, saveGame, sceneKey } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { exampleLocales, exampleMod } from "@tc/mod-example";
import "./style.css";

// The UI only reads state and dispatches actions. No game rules live here.
const mods = [baseMod, exampleMod];
const engine = createEngine(mods);
const SAVE_KEY = "test-city.save";
const dicts = { en: [baseLocales.en!, exampleLocales.en!], ru: [baseLocales.ru!, exampleLocales.ru!] };
const newSeed = () => (Date.now() % 2147483647) | 0; // the only non-deterministic input, outside the core

function App() {
  const [state, setState] = useState<GameState>(() => engine.init(newSeed()));
  const [lang, setLang] = useState<"en" | "ru">("ru");
  const [error, setError] = useState("");
  const t = useMemo(() => createTranslator(dicts, lang), [lang]);

  const room = (id: string) => t(engine.location(id)?.nameKey ?? id);
  const act = (a: Action) => {
    try {
      setState(engine.dispatch(state, a));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const label = (a: Action) => {
    const def = engine.actionDef(a.type)!;
    const to = a.payload?.to;
    return t(def.labelKey, typeof to === "string" ? { to: room(to) } : undefined);
  };
  const scene = engine.currentScene(state);
  const problems = engine.checkInvariants(state);

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
        <button onClick={() => setLang(lang === "en" ? "ru" : "en")}>{lang === "en" ? "RU" : "EN"}</button>
      </header>

      {(error || problems.length > 0) && <pre className="error">{[error, ...problems].filter(Boolean).join("\n")}</pre>}

      <section>
        <h2>{t("ui.scene")}</h2>
        {scene && (
          <p>
            <code>{sceneKey(scene)}</code>
            <br />
            {room(scene.location)}: {scene.participants.map((p) => t(`base.entity.${p.id}`)).join(", ")}
          </p>
        )}
      </section>

      <section>
        <h2>{t("ui.actions")}</h2>
        <div className="actions">
          {engine.listActions(state).map((a, i) => (
            <button key={i} onClick={() => act(a)}>
              {label(a)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t("ui.log")}</h2>
        <ul className="log">
          {state.log
            .slice(-30)
            .reverse()
            .map((e, i) => (
              <li key={i}>
                {t(
                  e.key,
                  e.params && Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, typeof v === "string" ? t(v) : v])),
                )}
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
