import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BED, TALK, TELL, rentOf, bs, content, WAIT } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, loadGame, saveGame, sceneKey } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { CheatPanel } from "./cheats";
import { NewGame } from "./newgame";
import { AUTOSAVE_KEY, carryOver, downloadText, engine, game, makeGame, newSeed, readModFile, SAVE_KEY, setGame } from "./game";
import type { Lang, ModPack } from "./game";
import { loadPack, packInfo, pictureFor } from "./pack";
import { actionLabel, CoupleTab, GuestsTab, HeroineTab, Log, PhoneTab, Rooms, ScenePanel, Summary, TopBar, WhyTab } from "./panels";
import "./style.css";

type Tab = "her" | "you" | "guests" | "why" | "phone";

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
  const [menu, setMenu] = useState(false);
  const [packCount, setPackCount] = useState(0);
  const packInput = useRef<HTMLInputElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(true); // the first thing a player sees
  const [tab, setTab] = useState<Tab>("her");
  const [error, setError] = useState("");
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
      const next = engine.dispatch(state, a);
      // a new day has started: keep a copy, in case the tab gets closed
      if (next.time.day !== state.time.day) {
        try {
          localStorage.setItem(AUTOSAVE_KEY, saveGame(next, engine));
        } catch {
          /* storage may be unavailable when opened from a file; the game goes on */
        }
      }
      setState(next);
    });
  const load = (json: string | null) => json && guard(() => setState(loadGame(json, game.mods).state));
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

  const [herOpen, setHerOpen] = useState<string | null>(null);
  const all = engine.listActions(state);
  const waits = all.filter((a) => a.type === WAIT);
  const advance = all.find((a) => a.type === CORE_ADVANCE);
  const bed = all.filter((a) => a.type === BED);
  const withHer = all.filter((a) => a.type === TALK || a.type === TELL);
  const herGroups = (["chat", "touch", "tell"] as const).filter((g) => withHer.some((a) => (a.type === TELL ? "tell" : a.payload?.group) === g));
  const herTab = herGroups.includes(herOpen as never) ? herOpen : null;
  const other = all.filter((a) => a.type !== WAIT && a.type !== CORE_ADVANCE && a.type !== CORE_MOVE && a.type !== BED && a.type !== TALK && a.type !== TELL);
  const otherGroups = [...other.reduce((map, a) => map.set(a.type, [...(map.get(a.type) ?? []), a]), new Map<string, Action[]>())];

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
  const common = { state, t, lang, open: transparent };
  const b = bs(state);

  return (
    <div className="app">
      <header>
        <TopBar {...common} />
        <div className="tools">
          <button className={transparent ? "on" : ""} title={t("ui.transparent.hint")} onClick={() => setTransparent(!transparent)}>
            {t("ui.transparent")}
          </button>
          <button className={debug ? "on" : ""} onClick={() => setDebug(!debug)}>
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
            guard(() => setState(engine.init(seed, { base: setup as never })));
            setSetupOpen(false);
          }}
        />
      )}

      {(error || problems.length > 0) && <pre className="error">{[error, ...problems].filter(Boolean).join("\n")}</pre>}

      <div className="layout">
        <aside className="col-log">
          <div className="cap">{t("ui.log")}</div>
          <Log {...common} debug={transparent} />
        </aside>

        <section className="col-main">
          {state.time.phase === "summary" ? <Summary {...common} /> : <ScenePanel {...common} scene={scene} picture={scene ? pictureFor(scene, state.time.day * 7 + state.turn) : null} />}
          <div className="cap gap">{t("ui.where")}</div>
          <Rooms {...common} onAct={act} />
          {debug && <CheatPanel {...common} onAct={act} />}
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
              <div className="muted small">
                {t("ui.served", { n: b.shift?.served ?? 0 })} · {t("ui.tips", { n: b.shift?.tips ?? 0 })} · {t("ui.rent", { rent: rentOf(state) })}
              </div>
              <div className="waits">
                {waits.map((a, i) => (
                  <button key={i} className={a.payload?.until ? "wide" : ""} onClick={() => act(a)}>
                    <kbd>{i + 1}</kbd> {actionLabel(a, t, lang)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {state.time.phase === "shift" && waits.length === 0 && advance && <div className="muted">{t("ui.closing")}</div>}
          {bed.length > 0 && (
            <div className="card">
              <div className="card-title">{t("action.bed")}</div>
              <div className="grid2">
                {bed.filter((a) => !a.payload?.to).map((a, i) => (
                  <button key={i} className={a.payload?.do === "finish" ? "primary" : ""} onClick={() => act(a)}>
                    {actionLabel(a, t, lang)}
                  </button>
                ))}
              </div>
              <div className="card-title sub">{t("ui.bed.switch")}</div>
              <div className="chips">
                {bed.filter((a) => a.payload?.to).map((a, i) => (
                  <button key={i} onClick={() => act(a)}>
                    {t(`act.${a.payload!.to}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {withHer.length > 0 && (
            <div className="card">
              <div className="card-title">{t("ui.her.title")}</div>
              <div className="chips">
                {herGroups.map((g) => (
                  <button key={g} className={herTab === g ? "on" : ""} onClick={() => setHerOpen(herTab === g ? null : g)}>
                    {t(`ui.her.${g}`)}
                  </button>
                ))}
              </div>
              {herTab === "tell" && (
                <div className="stack sub">
                  {[...new Set(withHer.filter((a) => a.type === TELL).map((a) => a.payload!.group as string))].map((g) => (
                    <div key={g} className="tell-row">
                      <span>{t(`tell.${g}`)}</span>
                      <button onClick={() => act({ type: TELL, payload: { group: g, say: "allow" } })}>{t("ui.tell.allow")}</button>
                      <button className="deny" onClick={() => act({ type: TELL, payload: { group: g, say: "forbid" } })}>
                        {t("ui.tell.forbid")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {herTab && herTab !== "tell" && (
                <div className="stack sub">
                  {withHer
                    .filter((a) => (a.type === TELL ? "tell" : a.payload?.group) === herTab)
                    .map((a, i) => (
                      <button key={i} className={a.payload?.say === "forbid" ? "deny" : ""} onClick={() => act(a)}>
                        {actionLabel(a, t, lang)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          {other.length > 0 && (
            <div className="card">
              <div className="card-title">
                {t(`ui.todo.${state.time.phase}`)}
                {state.time.phase === "prep" && bs(state).day && (
                  <span className="muted small">
                    {" "}
                    · {Math.floor(bs(state).day!.left / 60)}:{String(bs(state).day!.left % 60).padStart(2, "0")} {t("ui.day.left")} · {t("ui.clean")} {Math.round(bs(state).clean)}
                  </span>
                )}
              </div>
              <div className="stack">
                {otherGroups.map(([type, list]) =>
                  list.length < 3 ? (
                    list.map((a, i) => (
                      <button key={type + i} onClick={() => act(a)}>
                        {actionLabel(a, t, lang)}
                      </button>
                    ))
                  ) : (
                    <details key={type} open={type === "base/day" || type === "base/guest" || type === "base/hear-her"}>
                      <summary>
                        {t(engine.actionDef(type)!.labelKey)} <span className="muted">({list.length})</span>
                      </summary>
                      <div className="stack sub">
                        {list.map((a, i) => (
                          <button key={i} onClick={() => act(a)}>
                            {actionLabel(a, t, lang)}
                          </button>
                        ))}
                      </div>
                    </details>
                  ),
                )}
              </div>
            </div>
          )}
          {advance && (
            <button className="primary" onClick={() => act(advance)}>
              <kbd>↵</kbd> {actionLabel(advance, t, lang)}
            </button>
          )}

          <div className="tabs">
            {(["her", "you", "guests", "why", "phone"] as Tab[]).map((k) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {t(`ui.tab.${k}`)}
                {k === "guests" && b.shift ? ` ${b.shift.visits.length}` : ""}
              </button>
            ))}
          </div>
          <div className="tab-body">
            {tab === "her" && <HeroineTab {...common} />}
            {tab === "you" && <CoupleTab {...common} />}
            {tab === "guests" && <GuestsTab {...common} />}
            {tab === "why" && <WhyTab {...common} debug={transparent} />}
            {tab === "phone" && <PhoneTab {...common} debug={transparent} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
