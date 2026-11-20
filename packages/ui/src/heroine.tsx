// Heroine screens: the picker (whom to play) and the builder (her name, story and look, with four preview pictures).
import { useEffect, useRef, useState } from "react";
import { cardFolder, content, lookSummary, newCard, previewScenes, randomLook } from "@tc/base";
import type { HeroineCard } from "@tc/base";
import type { T } from "./game";
import { checkGen, drawPicture, fileOf, genAlive, genSetup, listFolder, picUrl, sendCard, setGen, useGen } from "./gen";
import { downloadCard, dropThumb, keepThumb, loadHeroines, readCardFile, saveHeroines, thumbOf } from "./heroines";

const H = content.heroine;
const NAMES = ["Ника", "Алина", "Вера", "Мила", "Лена", "Даша", "Катя", "Ира", "Оля", "Таня", "Соня", "Юля", "Аня", "Лиза", "Марина", "Ксюша", "Полина", "Света"];
const rndName = () => NAMES[Math.floor(Math.random() * NAMES.length)]!;

/** Whom to play: the default heroine or one of your own. */
export function HeroinePicker({ t, onPick, onCancel }: { t: T; onPick(card: HeroineCard | null): void; onCancel?(): void }) {
  const [list, setList] = useState(loadHeroines);
  const [editing, setEditing] = useState<HeroineCard | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sure, setSure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useGen();
  useEffect(() => {
    void checkGen().then((a) => {
      if (!a) return;
      for (const c of list) void listFolder(cardFolder(c)).then((f) => setCounts((x) => ({ ...x, [c.id]: f.length })));
    });
  }, [list]);
  const store = (next: HeroineCard[]) => {
    setList(next);
    saveHeroines(next);
  };

  if (editing)
    return (
      <HeroineBuilder
        t={t}
        start={editing}
        onBack={() => setEditing(null)}
        onSave={(c) => {
          store(list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]);
          setEditing(null);
        }}
      />
    );

  const cast = content.casts[0]!;
  return (
    <div className="overlay">
      <div className="dialog heroines">
        <h1>{t("ui.newgame.title")}</h1>
        <p className="muted">{t("ui.hero.pick")}</p>
        <div className="hero-list">
          <div className="hero-card">
            <div className="hero-thumb">{cast.name.slice(0, 1)}</div>
            <div className="hero-body">
              <b>{t("ui.hero.default")}</b>
              <div className="muted small">{cast.name}</div>
              <div className="hero-actions">
                <button className="primary" onClick={() => onPick(null)}>{t("ui.hero.play")}</button>
              </div>
            </div>
          </div>
          {list.map((c) => {
            const thumb = thumbOf(c.id);
            return (
              <div className="hero-card" key={c.id}>
                <div className="hero-thumb">{thumb ? <img src={thumb} alt="" /> : c.name.slice(0, 1)}</div>
                <div className="hero-body">
                  <b>
                    {c.name}, {c.age}
                  </b>
                  {c.tagline && <div className="small">{c.tagline}</div>}
                  <div className="muted small">{lookSummary(c) || t("ui.hero.nolook")}</div>
                  {counts[c.id] !== undefined && <div className="muted small">{t("ui.hero.pictures", { n: counts[c.id]! })}</div>}
                  <div className="hero-actions">
                    <button className="primary" onClick={() => onPick(c)}>{t("ui.hero.play")}</button>
                    <button onClick={() => setEditing(c)}>{t("ui.hero.edit")}</button>
                    <button onClick={() => downloadCard(c)} title={t("ui.hero.share.about")}>{t("ui.hero.share")}</button>
                    {sure === c.id ? (
                      <>
                        <button className="danger" onClick={() => (store(list.filter((x) => x.id !== c.id)), dropThumb(c.id), setSure(null))}>{t("ui.hero.delete.yes")}</button>
                        <button onClick={() => setSure(null)}>{t("ui.hero.delete.no")}</button>
                      </>
                    ) : (
                      <button onClick={() => setSure(c.id)}>{t("ui.hero.delete")}</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">
          {onCancel && <button onClick={onCancel}>{t("ui.newgame.cancel")}</button>}
          <button onClick={() => fileInput.current?.click()} title={t("ui.hero.import.about")}>{t("ui.hero.import")}</button>
          <button className="primary" onClick={() => setEditing({ ...newCard(rndName(), Date.now(), Math.random), ...randomLook(Math.random) })}>{t("ui.hero.new")}</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const card = await readCardFile(f, list);
            if (card) store([...list.filter((x) => x.id !== card.id), card]);
          }}
        />
      </div>
    </div>
  );
}

type Shot = { url: string | null; folder: string; state: "none" | "wait" | "done" | "error"; ahead?: number };

/** The builder: her story on the left, her look below it, the four previews and her card on the right. */
export function HeroineBuilder({ t, start, onSave, onBack }: { t: T; start: HeroineCard; onSave(card: HeroineCard): void; onBack(): void }) {
  const [card, setCard] = useState<HeroineCard>(start);
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [fine, setFine] = useState(false);
  useGen();
  const alive = genAlive();
  const folder = cardFolder(card);
  const set = (patch: Partial<HeroineCard>) => setCard((c) => ({ ...c, ...patch }));
  const previews = previewScenes();

  // what the generator already has for this look
  useEffect(() => {
    let gone = false;
    void checkGen().then(async (a) => {
      if (!a) return;
      const files = new Set(await listFolder(folder));
      if (gone) return;
      setShots((was) => {
        const next = { ...was };
        for (const p of previews) {
          const f = fileOf(p.desc);
          if (files.has(f)) next[p.id] = { url: picUrl(folder, f), folder, state: "done" };
        }
        const first = previews[0] && next[previews[0].id];
        if (first?.url && !thumbOf(card.id)) void keepThumb(card.id, first.url).catch(() => {});
        return next;
      });
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const drawOne = async (id: string, replace: boolean) => {
    const p = previews.find((x) => x.id === id)!;
    const now = card;
    const f = cardFolder(now);
    setShots((s) => ({ ...s, [id]: { url: s[id]?.url ?? null, folder: s[id]?.folder ?? f, state: "wait" } }));
    await sendCard(now);
    const url = await drawPicture(p.desc, now, { replace, onWait: (ahead) => setShots((s) => ({ ...s, [id]: { ...s[id]!, ahead } })) });
    setShots((s) => ({ ...s, [id]: url ? { url, folder: f, state: "done" } : { ...s[id]!, state: "error" } }));
    if (url && id === previews[0]?.id) void keepThumb(now.id, url).catch(() => {});
  };
  const drawAll = () => previews.forEach((p) => void drawOne(p.id, shots[p.id]?.folder === folder && shots[p.id]?.state === "done"));

  const random = (what: "all" | "look" | "story") => {
    if (what === "look" || what === "all") set(randomLook(Math.random));
    if (what === "story" || what === "all") set({ name: rndName(), age: 19 + Math.floor(Math.random() * 16) });
  };
  const opt = (slot: string, o: string) => t(`card.${slot}.${o}`);

  return (
    <div className="overlay">
      <div className="dialog builder">
        <div className="builder-head">
          <h1>{t("ui.hero.build")}</h1>
          <button onClick={() => random("all")}>⟳ {t("ui.hero.random")}</button>
        </div>
        <div className="builder-cols">
          <div>
            <section className="bsec">
              <div className="cap">
                {t("ui.hero.who")}
                <button className="mini" onClick={() => random("story")}>⟳</button>
              </div>
              <label className="slider">
                <span>{t("ui.newgame.name")}</span>
                <input type="text" value={card.name} maxLength={24} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="slider">
                <span>{t("ui.hero.age")}</span>
                <input type="range" min={18} max={45} value={card.age} onChange={(e) => set({ age: Number(e.target.value) })} />
                <b>{card.age}</b>
              </label>
              <label className="field">
                <span>{t("ui.hero.tagline")}</span>
                <input type="text" value={card.tagline ?? ""} maxLength={120} placeholder={t("ui.hero.tagline.hint")} onChange={(e) => set({ tagline: e.target.value || undefined })} />
              </label>
              <label className="field">
                <span>{t("ui.hero.story")}</span>
                <textarea rows={3} value={card.story ?? ""} placeholder={t("ui.hero.story.hint")} onChange={(e) => set({ story: e.target.value || undefined })} />
              </label>
            </section>
            <section className="bsec">
              <div className="cap">
                {t("ui.hero.look")}
                <button className="mini" onClick={() => random("look")}>⟳</button>
              </div>
              <p className="muted small">{t("ui.hero.look.about")}</p>
              {H.slots.map((s) => (
                <label className="slider" key={s.id}>
                  <span>{t(`card.${s.id}`)}</span>
                  <select value={card.look[s.id] ?? ""} onChange={(e) => set({ look: { ...card.look, [s.id]: e.target.value } })}>
                    <option value="">{t("ui.hero.unset")}</option>
                    {Object.keys(s.options).map((o) => (
                      <option key={o} value={o}>
                        {opt(s.id, o)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="small muted">{t("ui.hero.marks", { n: H.maxMarks })}</div>
              <div className="chips">
                {Object.keys(H.marks).map((m) => {
                  const on = card.marks.includes(m);
                  return (
                    <button key={m} className={on ? "chip on" : "chip"} disabled={!on && card.marks.length >= H.maxMarks} onClick={() => set({ marks: on ? card.marks.filter((x) => x !== m) : [...card.marks, m] })}>
                      {t(`card.mark.${m}`)}
                    </button>
                  );
                })}
              </div>
              <label className="field">
                <span>{t("ui.hero.extra")}</span>
                <textarea rows={2} value={card.extra} placeholder="hair ribbon, (freckles:1.3)" onChange={(e) => set({ extra: e.target.value })} />
              </label>
              <p className="muted small">{t("ui.hero.extra.about")}</p>
              <button className="link" onClick={() => setFine(!fine)}>
                {t("ui.hero.fine")} {fine ? "▴" : "▾"}
              </button>
              {fine && (
                <>
                  <label className="field">
                    <span>{t("ui.hero.nude")}</span>
                    <textarea rows={2} value={card.nude} onChange={(e) => set({ nude: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>{t("ui.hero.negative")}</span>
                    <textarea rows={2} value={card.negative} onChange={(e) => set({ negative: e.target.value })} />
                  </label>
                </>
              )}
            </section>
          </div>
          <div>
            <section className="bsec">
              <div className="previews">
                {previews.map((p) => {
                  const s = shots[p.id];
                  const stale = s?.state === "done" && s.folder !== folder;
                  return (
                    <div className="preview" key={p.id}>
                      {s?.url ? <img src={s.url} alt="" className={stale ? "stale" : ""} /> : <div className="preview-empty">{t(`ui.hero.preview.${p.id}`)}</div>}
                      <div className="preview-bar">
                        <span>{t(`ui.hero.preview.${p.id}`)}</span>
                        {s?.state === "wait" ? (
                          <span className="muted">{s.ahead ? t("ui.hero.queue", { n: s.ahead }) : t("ui.hero.drawing")}</span>
                        ) : (
                          <button className="mini" disabled={!alive} onClick={() => void drawOne(p.id, true)} title={t("ui.hero.redraw")}>
                            ⟳
                          </button>
                        )}
                      </div>
                      {stale && <div className="preview-note">{t("ui.hero.stale")}</div>}
                      {s?.state === "error" && <div className="preview-note">{t("ui.hero.failed")}</div>}
                    </div>
                  );
                })}
              </div>
              {alive ? (
                <>
                  {!alive.comfy && <p className="warn small">{t("ui.hero.nocomfy")}</p>}
                  <button className="primary wide" onClick={drawAll}>
                    {t("ui.hero.draw")}
                  </button>
                </>
              ) : (
                <div className="muted small">
                  <p>{alive === false ? t("ui.hero.noserver") : t("ui.hero.looking")}</p>
                  <button onClick={() => void checkGen()}>{t("ui.hero.check")}</button>
                </div>
              )}
            </section>
            <section className="bsec">
              <h2 className="hero-name">
                {card.name || "?"}, {card.age}
              </h2>
              {card.tagline && <div className="small">{card.tagline}</div>}
              <div className="muted small">{lookSummary(card) || t("ui.hero.nolook")}</div>
              {card.story && <p className="small">{card.story}</p>}
              <p className="muted small">{t("ui.hero.later")}</p>
            </section>
          </div>
        </div>
        <div className="dialog-actions">
          <button onClick={onBack}>{t("ui.hero.back")}</button>
          <button className="primary" disabled={!card.name.trim()} onClick={() => onSave({ ...card, name: card.name.trim(), updatedAt: Date.now(), createdAt: card.createdAt || Date.now() })}>
            {t("ui.hero.save", { name: card.name.trim() || "?" })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The generator switch in the menu: on - missing pictures are drawn while you play; off - the nearest saved ones. */
export function GenSwitch({ t }: { t: T }) {
  useGen();
  useEffect(() => {
    void checkGen();
    const i = setInterval(() => void checkGen(), 30000);
    return () => clearInterval(i);
  }, []);
  const s = genSetup();
  const a = genAlive();
  const status = a === null ? "…" : a === false ? t("ui.gen.off") : !a.comfy ? t("ui.gen.nocomfy") : a.waiting > 0 ? t("ui.gen.waiting", { n: a.waiting }) : t("ui.gen.ready");
  return (
    <div className="gen-switch">
      <label className="check" title={t("ui.gen.about")}>
        <input type="checkbox" checked={s.on} onChange={(e) => setGen({ on: e.target.checked })} />
        {t("ui.gen")}
      </label>
      <span className={`muted small ${a && a.comfy ? "ok" : ""}`}> {status}</span>
    </div>
  );
}
