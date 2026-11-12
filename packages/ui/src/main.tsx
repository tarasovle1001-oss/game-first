import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { tracer, resetTracer, bs, withLook, husbandSees } from "@tc/base";
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

const DEFAULT_COLS = [24, 27, 28, 21];
const DEFAULT_FONT = 17;
const MIN_COL = 0.12;
type Tab = "her" | "you" | "why" | "phone" | "stats" | "none";

/** What lives behind the money in the top bar, and inside the phone, instead of in the menu. */
const MONEY_ACTS = new Set(["base/tip-share", "base/repay-debt"]);
const PHONE_ACTS = new Set(["base/call-wife", "base/phone-peek"]);
const clockOf = (s: GameState) => `${String(Math.floor(s.time.minute / 60) % 24).padStart(2, "0")}:${String(s.time.minute % 60).padStart(2, "0")}`;
const NOTES_KEY = "test-city.notes";
const BUILD = "12o";
const RESUME_KEY = "test-city.resume";
const RESUME_BUDGET = 2_500_000; // characters: the browser gives a page about twice that
/** A save with the steps back in it: the game as it is now, and as many earlier moments as fit. */
const packSave = (state: GameState, past: GameState[]) => {
  const now = saveGame(state, engine);
  const steps: string[] = [];
  let size = now.length;
  for (let i = past.length - 1; i >= 0; i--) {
    const s = saveGame(past[i]!, engine);
    if (size + s.length > RESUME_BUDGET) break;
    size += s.length;
    steps.unshift(s);
  }
  return JSON.stringify({ resume: 1, now, past: steps });
};
/** Reads either kind: a plain save, or one with the steps back. */
const unpackSave = (json: string, mods: Parameters<typeof loadGame>[1]): { state: GameState; past: GameState[] } => {
  const raw = JSON.parse(json) as { resume?: number; now?: string; past?: string[] };
  if (raw.resume !== 1 || typeof raw.now !== "string") return { state: loadGame(json, mods).state, past: [] };
  const past: GameState[] = [];
  for (const s of raw.past ?? []) {
    try {
      past.push(loadGame(s, mods).state);
    } catch {
      past.length = 0; // a step that does not load breaks the chain before it
    }
  }
  return { state: loadGame(raw.now, mods).state, past };
};
/** Where the player left off, if the tab was closed in the middle of a game. */
const resumed = (() => {
  try {
    const json = localStorage.getItem(RESUME_KEY);
    return json ? unpackSave(json, game.mods) : null;
  } catch {
    return null;
  }
})();

// The UI only reads state and dispatches actions. No game rules live here.
function App() {
  const [state, setState] = useState<GameState>(() => resumed?.state ?? engine.init(newSeed()));
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
  // the look of the screen, remembered between visits: column widths (in shares) and the size of the text
  const [look, setLookState] = useState<{ cols: number[]; font: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("test-city.look") ?? "null") as { cols?: number[]; font?: number } | null;
      if (saved && Array.isArray(saved.cols) && saved.cols.length === 4 && typeof saved.font === "number") return { cols: saved.cols, font: saved.font };
    } catch {
      /* nothing saved, or not ours */
    }
    return { cols: DEFAULT_COLS, font: DEFAULT_FONT };
  });
  const setLook = (next: { cols: number[]; font: number }) => {
    setLookState(next);
    try {
      localStorage.setItem("test-city.look", JSON.stringify(next));
    } catch {
      /* no storage: lasts for this visit */
    }
  };
  useEffect(() => {
    document.documentElement.style.fontSize = `${look.font}px`;
  }, [look.font]);
  // drag the line between two columns: what one gains the other loses
  const drag = (i: number) => (down: PointerEvent<HTMLDivElement>) => {
    down.preventDefault();
    const width = (down.currentTarget.parentElement!.parentElement as HTMLElement).clientWidth;
    const total = look.cols.reduce((a, c) => a + c, 0);
    const start = down.clientX;
    const from = look.cols;
    const move = (e: globalThis.PointerEvent) => {
      const shift = ((e.clientX - start) / width) * total;
      const min = total * MIN_COL;
      const d = Math.max(min - from[i]!, Math.min(from[i + 1]! - min, shift));
      const cols = [...from];
      cols[i] = from[i]! + d;
      cols[i + 1] = from[i + 1]! - d;
      setLook({ cols, font: look.font });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const split = (i: number) => <div className="splitter" onPointerDown={drag(i)} onDoubleClick={() => setLook({ cols: DEFAULT_COLS, font: look.font })} title={t("ui.split.hint")} />;
  const [menu, setMenu] = useState(false);
  const [packCount, setPackCount] = useState(0);
  const packInput = useRef<HTMLInputElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(!resumed); // the first thing a player sees, unless there is a game to come back to
  const [tab, setTab] = useState<Tab>("none");
  // playtest notes: one keypress, and the moment is written down with everything needed to find it again
  const [notes, setNotes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const addNote = () => {
    const text = window.prompt(t("ui.note.ask"));
    if (!text) return;
    const b = bs(state);
    const h = b.heroine;
    const line = `[${BUILD}] день ${state.time.day}, ${clockOf(state)}, ${t(`base.phase.${state.time.phase}`)} | после: ${lastWhat || "-"} | она: энергия ${Math.round(h.energy)}, настроение ${Math.round(h.mood)}, возбуждение ${Math.round(h.arousal)}, открытость ${Math.round(h.traits.openness)}, верность ${Math.round(h.traits.fidelity)}, неудовл. ${Math.round(h.frustration)} | деньги ${b.money}, долг ${b.debt}, репутация ${Math.round(b.reputation)} | seed ${state.seed}, ход ${state.turn}\n  ${text}`;
    const next = [...notes, line];
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {
      /* the note is still on screen for this session */
    }
  };
  const saveNotes = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([notes.join("\n\n")], { type: "text/plain;charset=utf-8" }));
    a.download = `playtest-notes-${BUILD}.txt`;
    a.click();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        addNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [error, setError] = useState("");
  // the last few states, to step back from a misclick: states are immutable, so keeping them costs little
  const [past, setPast] = useState<GameState[]>(() => resumed?.past ?? []);
  const UNDO_DEPTH = 20;
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setState(prev);
    setLastWhat(t("ui.undo"));
  };
  // every step is kept: close the tab at any moment and come back to the same one, steps back included
  useEffect(() => {
    if (setupOpen && state.turn === 0) return; // nothing chosen yet
    try {
      localStorage.setItem(RESUME_KEY, packSave(state, past));
    } catch {
      try {
        localStorage.setItem(RESUME_KEY, packSave(state, []));
      } catch {
        /* storage may be full or unavailable; the game goes on */
      }
    }
  }, [state, past, setupOpen]);
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
      const got = unpackSave(json, game.mods);
      setPast(got.past.slice(-UNDO_DEPTH));
      setState(got.state);
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
  // where he last saw her himself: the map shows that, faintly, while she is out of his sight
  const seenAt = useRef<string | undefined>(state.where["wife"]);
  if (state.where["wife"] === state.where["husband"] || husbandSees(state, state.where["wife"] ?? "")) seenAt.current = state.where["wife"];
  const common = { state, t, lang, open: transparent, guess: seenAt.current };
  const unread = Object.values(bs(state).phone.threads).flat().filter((m) => !m.seen).length;
  const moneyActs = engine.listActions(state).filter((a) => MONEY_ACTS.has(a.type));
  const phoneActs = engine.listActions(state).filter((a) => PHONE_ACTS.has(a.type));
  const b = bs(state);

  return (
    <div className="app">
      <header>
        <TopBar {...common} onMoney={() => setMoneyOpen(true)} />
        <button className="phone-btn" title={t("ui.tab.phone")} onClick={() => setPhoneOpen(true)}>
          <span className="phone-ico" />
          {unread > 0 && <span className="phone-badge">{unread}</span>}
        </button>
        <div className="tools">
          <button disabled={past.length === 0} title={t("ui.undo.hint")} onClick={undo}>
            {t("ui.undo")} {past.length > 0 ? past.length : ""}
          </button>
          <span className="fontsize" title={t("ui.font.hint")}>
            <button disabled={look.font <= 13} onClick={() => setLook({ ...look, font: look.font - 1 })}>
              A-
            </button>
            <button disabled={look.font >= 24} onClick={() => setLook({ ...look, font: look.font + 1 })}>
              A+
            </button>
          </span>
          <button className={transparent ? "on" : ""} title={t("ui.transparent.hint")} onClick={() => setTransparent(!transparent)}>
            {t("ui.transparent")}
          </button>
          <button className={inspector ? "on" : ""} title={t("ui.inspector.hint")} onClick={() => setInspector(!inspector)}>
            {t("ui.inspector")}
          </button>
          <button className={debug ? "on" : ""} title={t("ui.cheats.key")} onClick={() => setDebug(!debug)}>
            {t("ui.debug")}
          </button>
          <button onClick={addNote} title={t("ui.note.hint")}>
            {t("ui.note")}
            {notes.length > 0 ? ` ${notes.length}` : ""}
          </button>
          {notes.length > 0 && (
            <button onClick={saveNotes} title={t("ui.note.save.hint")}>
              ⭳
            </button>
          )}
          <button onClick={() => setLang(lang === "en" ? "ru" : "en")}>{lang === "en" ? "RU" : "EN"}</button>
          <button className={menu ? "on" : ""} onClick={() => setMenu(!menu)}>
            {t("ui.menu")}
          </button>
        </div>
        {menu && (
          <div className="menu" onClick={() => setMenu(false)}>
            <button onClick={() => setSetupOpen(true)}>{t("ui.new")}</button>
            <button onClick={() => guard(() => localStorage.setItem(SAVE_KEY, packSave(state, past)))}>{t("ui.save")}</button>
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

      <div className="layout" style={{ gridTemplateColumns: look.cols.map((c) => `minmax(0, ${c}fr)`).join(" ") }}>
        <aside className="col-story">
          {split(0)}
          <Log {...common} debug={transparent} />
        </aside>

        <section className="col-house">
          {split(1)}
          <details className="fold" open>
            <summary className="cap">{t("ui.house")}</summary>
            <RoomGrid {...common} onAct={act} />
          </details>
          <HerCard {...common} />
          {(b.shift || Object.keys(b.lodgers).length > 0) && (
            <div className="house-guests">
              <GuestsTab {...common} />
              {b.shift && <div className="muted small today">{t("ui.today.line", { n: b.shift.served, tips: b.shift.tips })}</div>}
            </div>
          )}
        </section>

        <section className="col-focus">
          {split(2)}
          {<ScenePanel {...common} scene={scene} picture={scene ? pictureFor(withLook(state, scene), state.time.day * 7 + state.turn) : null} />}
          <OutcomeCard {...common} />
          {inspector && <InspectorBlock {...common} prev={past[past.length - 1] ?? null} what={lastWhat} />}
          {inspector && <ConsentCalc {...common} />}
          <div className="tabs">
            {(["her", "why", "stats"] as Tab[]).map((k) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(tab === k ? "none" : k)}>
                {t(`ui.tab.${k}`)}
              </button>
            ))}
          </div>
          {tab !== "none" && (
            <div className="tab-body">
              {tab === "her" && (
                <>
                  <HeroineTab {...common} />
                  <CoupleTab {...common} />
                </>
              )}
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
      {moneyOpen && (
        <div className="overlay" onClick={() => setMoneyOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("ui.money.title")}</h3>
            <p className="muted small">{t("ui.money.now", { money: bs(state).money, debt: bs(state).debt, purse: bs(state).purse })}</p>
            {moneyActs.length === 0 && <p className="muted">{t("ui.money.none")}</p>}
            <div className="stack">
              {moneyActs.map((a, i) => (
                <button key={i} onClick={() => act(a)}>
                  {actionLabel(a, t, lang)}
                </button>
              ))}
            </div>
            <button className="quiet" onClick={() => setMoneyOpen(false)}>
              {t("ui.close")}
            </button>
          </div>
        </div>
      )}
      {phoneOpen && (
        <div className="overlay" onClick={() => setPhoneOpen(false)}>
          <div className="modal phone" onClick={(e) => e.stopPropagation()}>
            <div className="phone-top">{clockOf(state)}</div>
            <div className="phone-apps">
              {(["messages", "calls", "social", "camera", "bank", "notes"] as const).map((app) => (
                <div key={app} className={`phone-app${app === "messages" || app === "calls" ? "" : " soon"}`} title={app === "messages" || app === "calls" ? undefined : t("ui.phone.soon")}>
                  <span className="phone-app-ico">{t(`ui.phone.app.${app}`).slice(0, 1)}</span>
                  <span>{t(`ui.phone.app.${app}`)}</span>
                  {app === "messages" && unread > 0 && <span className="phone-badge">{unread}</span>}
                </div>
              ))}
            </div>
            <div className="phone-body">
              {phoneActs.map((a, i) => (
                <button key={i} onClick={() => act(a)}>
                  {actionLabel(a, t, lang)}
                </button>
              ))}
              <PhoneTab {...common} debug={transparent} />
            </div>
            <button className="quiet" onClick={() => setPhoneOpen(false)}>
              {t("ui.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
