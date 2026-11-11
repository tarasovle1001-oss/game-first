import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { tracer, resetTracer, bs, withLook } from "@tc/base";
import { loadGame, saveGame, sceneKey } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { CheatPanel } from "./cheats";
import { NewGame } from "./newgame";
import { AUTOSAVE_KEY, carryOver, downloadText, engine, game, makeGame, newSeed, readModFile, SAVE_KEY, setGame } from "./game";
import type { Lang, ModPack } from "./game";
import { loadPack, packInfo, pictureFor } from "./pack";
import { actionLabel, ConsentCalc, HerCard, InspectorBlock, OutcomeCard, CoupleTab, GuestsTab, HeroineTab, Log, PhoneTab, RoomGrid, ScenePanel, StatsTab, Summary, TopBar, WhyTab } from "./panels";
import { ActionMenu } from "./menu";
import "./style.css";

type Tab = "her" | "you" | "why" | "phone" | "stats" | "none";

// The UI only reads state and dispatches actions. No game rules live here.
function App() {
  const [state, setState] = useState<GameState>(() => engine.init(newSeed()));
  const [extra, setExtra] = useState<ModPack[]>([]);
  const [lang, setLang] = useState<Lang>("ru");
  const [debug, setDebug] = useState(false);
  // transparent: everything is shown; immersive: only what the husband could know. Remembered between visits.
  const [transparent, setTransparentState] = useState(() => {
    try {
      return localStorage.getItem("test-city.transparent") === "1";
    } catch {
      return false;
    }
  });
  const setTransparent = (v: boolean) => {
    setTransparentState(v);
    try {
      localStorage.setItem("test-city.transparent", v ? "1" : "0");
    } catch {
      /* no storage: the setting just lasts for this visit */
    }
  };
  // the inspector: what the last action changed, under the scene. Remembered between visits.
  const [inspector, setInspectorState] = useState(() => {
    try {
      return localStorage.getItem("test-city.inspector") === "1";
    } catch {
      return false;
    }
  });
  const setInspector = (v: boolean) => {
    setInspectorState(v);
    try {
      localStorage.setItem("test-city.inspector", v ? "1" : "0");
    } catch {
      /* no storage: the setting just lasts for this visit */
    }
  };
  const [lastWhat, setLastWhat] = useState("");
  const [menu, setMenu] = useState(false);
  const [packCount, setPackCount] = useState(0);
  const packInput = useRef<HTMLInputElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(true); // the first thing a player sees
  const [tab, setTab] = useState<Tab>("none");
  const [error, setError] = useState("");
  // the last few states, to step back from a misclick: states are immutable, so keeping them costs little
  const [past, setPast] = useState<GameState[]>([]);
  const UNDO_DEPTH = 20;
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setState(prev);
    setLastWhat(t("ui.undo"));
  };
  const saveInput = useRef<HTMLInputElement>(null);
  const modInput = useRef<HTMLInputElement>(null);
  const t = useMemo(() => game.translator(lang), [lang, extra]);

  const guard = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const act = (a: Action) =>
    guard(() => {
      // with the inspector on, every change is put down to the event that made it
      resetTracer();
      engine.setTracer(inspector ? tracer : null);
      const next = engine.dispatch(state, a);
      // a new day has started: keep a copy, in case the tab gets closed
      if (next.time.day !== state.time.day) {
        try {
          localStorage.setItem(AUTOSAVE_KEY, saveGame(next, engine));
        } catch {
          /* storage may be unavailable when opened from a file; the game goes on */
        }
      }
      setPast([...past, state].slice(-UNDO_DEPTH));
      setState(next);
      setLastWhat(actionLabel(a, t, lang));
    });
  const load = (json: string | null) =>
    json &&
    guard(() => {
      setPast([]);
      setState(loadGame(json, game.mods).state);
    });
  const addMod = (source: string) =>
    guard(() => {
      const pack = readModFile(source);
      const packs = [...extra.filter((p) => p.mod.id !== pack.mod.id), pack];
      const next = makeGame(packs);
      const moved = carryOver(state, game, next);
      setGame(next);
      setExtra(packs);
      setState(moved);
    });
  const readFile = (input: HTMLInputElement | null, use: (text: string) => void) => {
    const file = input?.files?.[0];
    if (file) void file.text().then(use);
    if (input) input.value = "";
  };

  // keys that do not belong to the action menu: undo, the inspector, the cheat drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") setInspector(!inspector);
      else if (e.key === "F9") setDebug(!debug);
      else if (e.target instanceof HTMLInputElement) return;
      else if (e.key === "Backspace" || (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey))) undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const scene = engine.currentScene(state);
  const problems = engine.checkInvariants(state);
  const common = { state, t, lang, open: transparent };
  const b = bs(state);

  return (
    <div className="app">
      <header>
        <TopBar {...common} />
        <div className="tools">
          <button disabled={past.length === 0} title={t("ui.undo.hint")} onClick={undo}>
            {t("ui.undo")} {past.length > 0 ? past.length : ""}
          </button>
          <button className={transparent ? "on" : ""} title={t("ui.transparent.hint")} onClick={() => setTransparent(!transparent)}>
            {t("ui.transparent")}
          </button>
          <button className={inspector ? "on" : ""} title={t("ui.inspector.hint")} onClick={() => setInspector(!inspector)}>
            {t("ui.inspector")}
          </button>
          <button className={debug ? "on" : ""} title={t("ui.cheats.key")} onClick={() => setDebug(!debug)}>
            {t("ui.debug")}
          </button>
          <button onClick={() => setLang(lang === "en" ? "ru" : "en")}>{lang === "en" ? "RU" : "EN"}</button>
          <button className={menu ? "on" : ""} onClick={() => setMenu(!menu)}>
            {t("ui.menu")}
          </button>
        </div>
        {menu && (
          <div className="menu" onClick={() => setMenu(false)}>
            <button onClick={() => setSetupOpen(true)}>{t("ui.new")}</button>
            <button onClick={() => guard(() => localStorage.setItem(SAVE_KEY, saveGame(state, engine)))}>{t("ui.save")}</button>
            <button onClick={() => load(localStorage.getItem(SAVE_KEY))}>{t("ui.load")}</button>
            <button onClick={() => load(localStorage.getItem(AUTOSAVE_KEY))}>{t("ui.load.auto")}</button>
            <button onClick={() => downloadText(`test-city-day${state.time.day}.json`, saveGame(state, engine))}>{t("ui.save.file")}</button>
            <button onClick={() => saveInput.current?.click()}>{t("ui.load.file")}</button>
            <button onClick={() => modInput.current?.click()}>{t("ui.mod.add")}</button>
            <button onClick={() => packInput.current?.click()}>{t("ui.pack.add")}</button>
            {packCount > 0 && <div className="muted small">{t("ui.pack.loaded", { name: packInfo().name, n: packInfo().keys })}</div>}
            <div className="muted small">
              {t("ui.mods")}: {game.packs.map((p) => `${p.mod.id} v${p.mod.version}`).join(", ")}
            </div>
          </div>
        )}
        <input ref={saveInput} type="file" accept=".json" hidden onChange={(e) => readFile(e.target, load)} />
        <input ref={modInput} type="file" accept=".js" hidden onChange={(e) => readFile(e.target, addMod)} />
        <input
          ref={(el) => {
            packInput.current = el;
            el?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && setPackCount(loadPack(e.target.files))}
        />
      </header>

      {setupOpen && (
        <NewGame
          t={t}
          seed={newSeed()}
          onCancel={state.turn > 0 ? () => setSetupOpen(false) : undefined}
          onStart={(seed, setup) => {
            guard(() => {
              setPast([]);
              setState(engine.init(seed, { base: setup as never }));
            });
            setSetupOpen(false);
          }}
        />
      )}

      {(error || problems.length > 0) && <pre className="error">{[error, ...problems].filter(Boolean).join("\n")}</pre>}

      <div className="layout">
        <aside className="col-story">
          <Log {...common} debug={transparent} />
        </aside>

        <section className="col-house">
          <details className="fold" open>
            <summary className="cap">{t("ui.house")}</summary>
            <RoomGrid {...common} onAct={act} />
          </details>
          {state.time.phase !== "summary" && <HerCard {...common} />}
          {(b.shift || Object.keys(b.lodgers).length > 0) && (
            <div className="house-guests">
              <GuestsTab {...common} />
              {b.shift && <div className="muted small today">{t("ui.today.line", { n: b.shift.served, tips: b.shift.tips })}</div>}
            </div>
          )}
        </section>

        <section className="col-focus">
          {state.time.phase === "summary" ? <Summary {...common} /> : <ScenePanel {...common} scene={scene} picture={scene ? pictureFor(withLook(state, scene), state.time.day * 7 + state.turn) : null} />}
          {state.time.phase !== "summary" && <OutcomeCard {...common} />}
          {inspector && state.time.phase !== "summary" && <InspectorBlock {...common} prev={past[past.length - 1] ?? null} what={lastWhat} />}
          {inspector && state.time.phase !== "summary" && <ConsentCalc {...common} />}
          <div className="tabs">
            {(["her", "you", "why", "phone", "stats"] as Tab[]).map((k) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(tab === k ? "none" : k)}>
                {t(`ui.tab.${k}`)}
              </button>
            ))}
          </div>
          {tab !== "none" && (
            <div className="tab-body">
              {tab === "her" && <HeroineTab {...common} />}
              {tab === "stats" && <StatsTab {...common} />}
              {tab === "you" && <CoupleTab {...common} />}
              {tab === "why" && <WhyTab {...common} debug={transparent} />}
              {tab === "phone" && <PhoneTab {...common} debug={transparent} />}
            </div>
          )}
          {debug && (
            <p className="muted small mono">
              scene {scene ? sceneKey(scene) : "-"} · seed {state.seed} · turn {state.turn}
              {b.encounter && ` · encounter ${b.encounter.act}@${b.encounter.loc} with ${b.encounter.patron}`}
            </p>
          )}
        </section>

        <aside className="col-actions">
          <ActionMenu state={state} t={t} lang={lang} act={act} />
        </aside>
      </div>
      {debug && <CheatPanel {...common} onAct={act} onClose={() => setDebug(false)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
