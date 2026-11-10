import { useState } from "react";
import { bs, clockText, content, HUSBAND, patronName, renderLog, renderParams, WIFE } from "@tc/base";
import type { Patron, ProposalRecord } from "@tc/base";
import { CORE_MOVE } from "@tc/core";
import type { Action, GameState, SceneDesc } from "@tc/core";
import { renderSchematic } from "@tc/schematics";
import { engine } from "./game";
import type { Lang, T } from "./game";

export interface Common {
  state: GameState;
  t: T;
  lang: Lang;
}

export const actionLabel = (a: Action, t: T, lang: Lang) => {
  const def = engine.actionDef(a.type)!;
  const d = def.describe?.(a);
  return d ? t(d.key, renderParams(d.params, t, lang)) : t(def.labelKey);
};

const who = (id: string, state: GameState, t: T, lang: Lang) => {
  if (id === HUSBAND) return t("ui.you");
  if (id === WIFE) return t("base.entity.wife");
  const p = bs(state).patrons[id];
  return p ? patronName(p.name, lang) : id;
};

// ---------------------------------------------------------------- top bar

export function TopBar({ state, t }: Common) {
  const b = bs(state);
  return (
    <div className="topbar">
      <div className="cell">
        <span className="cap">{t("ui.time")}</span>
        <span className="big">{clockText(state.time.minute)}</span>
        <span className="accent">{t(`base.phase.${state.time.phase}`)}</span>
        <span className="muted">{t("ui.day", { day: state.time.day })}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.money")}</span>
        <span className="big gold">{b.money}</span>
        <span className="bad">
          {t("ui.debt")} {b.debt}
        </span>
        <span className="muted">{t("ui.rent", { rent: content.balance.rentPerDay })}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.stock")}</span>
        <span className={`big${b.stock < 8 ? " bad" : ""}`}>{b.stock}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.reputation")}</span>
        <span className="big">{Math.round(b.reputation)}</span>
        {b.shift && (
          <span className="muted">
            {t("ui.served", { n: b.shift.served })} · {t("ui.tips", { n: b.shift.tips })}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- log

export function Log({ state, t, lang, debug }: Common & { debug: boolean }) {
  const entries = state.log.filter((e) => debug || !e.tags?.includes("unseen")).slice(-80).reverse();
  let lastDay = -1;
  return (
    <div className="log">
      {entries.map((e, i) => {
        const dayMark = e.day !== lastDay;
        lastDay = e.day;
        const unseen = e.tags?.includes("unseen");
        return (
          <div key={`${e.turn}-${i}`}>
            {dayMark && <div className="daymark">{t("ui.day", { day: e.day })}</div>}
            <div className={`entry${unseen ? " unseen" : ""}`} title={unseen ? t("ui.unseen") : undefined}>
              <span className="time">{clockText(e.minute)}</span>
              <span>{renderLog(e, t, lang)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- scene

export function ScenePanel({ state, t, lang, scene }: Common & { scene: SceneDesc | null }) {
  const b = bs(state);
  const layout = scene ? (content.scenes.find((s) => s.id === scene.type) ?? content.scenes.find((s) => s.id === "idle")!) : null;
  const wifeHere = state.where[WIFE] === state.where[HUSBAND];
  const svg =
    scene && layout
      ? renderSchematic(
          // "idle" shows whoever is actually in the room; other scenes use their layout
          scene.type === "idle"
            ? scene.participants.filter((p) => p.id !== HUSBAND).slice(0, 4).map((p, i) => ({ role: p.role, pose: "stand" as const, x: -54 + i * 36 }))
            : layout.figures,
          {
            title: t(`scene.${layout.id}`),
            subtitle: t(`loc.${scene.location}`),
            legend: { wife: t("role.wife"), patron: t("role.patron"), husband: t("role.husband") },
          },
        )
      : "";
  // the answer that led to what is on screen, if any
  const subject = b.encounter?.patron ?? b.shift?.moment?.patron;
  const visible = scene && scene.type !== "idle" && scene.type !== "serving";
  const record = visible && subject ? [...b.proposals].reverse().find((p) => p.patron === subject && p.verdict !== "refuse") : undefined;
  return (
    <div className="scene">
      <div className="picture" dangerouslySetInnerHTML={{ __html: svg }} />
      {!wifeHere && <div className="hint">{t("ui.not_here")}</div>}
      {record && <WhyLine record={record} state={state} t={t} lang={lang} />}
    </div>
  );
}

const fmt = (v: number) => (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toString();

/** One line "who, what, verdict" + the three biggest reasons; the full table opens on click. */
export function WhyLine({ record, state, t, lang }: Common & { record: ProposalRecord }) {
  const [open, setOpen] = useState(false);
  const p = bs(state).patrons[record.patron];
  const top = [...record.rows].sort((a, c) => Math.abs(c.value) - Math.abs(a.value)).slice(0, 3);
  const rows = open ? record.rows : top;
  return (
    <div className={`why verdict-${record.verdict}`}>
      <div className="why-head">
        <span className="time">{clockText(content.balance.shift.opensAt * 60 + record.tick * content.balance.shift.minutesPerTick)}</span>
        <b>{p ? patronName(p.name, lang) : "?"}</b>
        <span>{t(`act.${record.act}`)}</span>
        <span className="pill">
          {t(`verdict.${record.verdict}`)} {fmt(record.total)}
        </span>
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? t("ui.why.less") : t("ui.why.more")}
        </button>
      </div>
      <div className={open ? "rows open" : "rows"}>
        {rows.map((r) => (
          <span key={r.id} className="row">
            {t(r.labelKey)} <b className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rooms

/** Rooms as cards with name chips, like a house plan. Click a linked room to walk there. */
export function Rooms({ state, t, lang, onAct }: Common & { onAct(a: Action): void }) {
  const here = state.where[HUSBAND];
  const moves = engine.listActions(state).filter((a) => a.type === CORE_MOVE && a.actor === HUSBAND);
  const zones = [...new Set(engine.locations().map((l) => l.zone))];
  return (
    <div className="rooms">
      {zones.map((zone) => (
        <div key={zone} className="zone">
          <div className="cap">{t(`ui.zone.${zone}`)}</div>
          <div className="zone-rooms">
            {engine
              .locations()
              .filter((l) => l.zone === zone)
              .map((r) => {
                const move = moves.find((a) => a.payload?.to === r.id);
                const people = Object.keys(state.where).filter((id) => state.where[id] === r.id);
                return (
                  <button
                    key={r.id}
                    className={`room${r.id === here ? " here" : ""}${move ? " reachable" : ""}`}
                    disabled={!move}
                    onClick={() => move && onAct(move)}
                  >
                    <span className="room-name">{t(r.nameKey)}</span>
                    <span className="chips">
                      {people.length === 0 && <i className="muted">{t("ui.empty")}</i>}
                      {people.map((id) => (
                        <span key={id} className={`chip ${id === WIFE ? "wife" : id === HUSBAND ? "husband" : "patron"}`}>
                          {who(id, state, t, lang)}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- details tabs

function Bar({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track">
        <div className={`fill ${tone ?? ""}`} style={{ width: `${value}%` }} />
      </div>
      <span className="num">{Math.round(value)}</span>
    </div>
  );
}

export function HeroineTab({ state, t }: Common) {
  const h = bs(state).heroine;
  const tones = { energy: "green", mood: "green", arousal: "pink", drunk: "amber" };
  return (
    <div>
      <div className="cap">{t("ui.state")}</div>
      {(["energy", "mood", "arousal", "drunk"] as const).map((k) => (
        <Bar key={k} label={t(`stat.${k}`)} value={h[k]} tone={tones[k]} />
      ))}
      <div className="cap gap">{t("ui.character")}</div>
      {(Object.keys(h.traits) as (keyof typeof h.traits)[]).map((k) => (
        <Bar key={k} label={t(`trait.${k}`)} value={h.traits[k]} />
      ))}
    </div>
  );
}

function PatronRow({ p, t, lang }: { p: Patron; t: T; lang: Lang }) {
  const far = content.acts.filter((a) => (p.memory.acts[a.id] ?? 0) > 0).sort((a, c) => c.tier - a.tier)[0];
  return (
    <li>
      <div>
        <b>{patronName(p.name, lang)}</b> <span className="muted">{t(`patron.type.${p.type}`)}</span>
        {p.regular && <span className="star">★</span>}
      </div>
      <div className="muted small">
        {t("ui.patron.line", { age: p.age, build: t(`patron.build.${p.build}`), approach: t(`patron.approach.${p.approach}`) })}
      </div>
      <div className="muted small">
        {t("ui.patron.memory", { visits: p.memory.visits, interest: Math.round(p.memory.interest), affinity: Math.round(p.memory.affinity) })}
        {" · "}
        {far ? t("ui.patron.ladder", { act: t(`act.${far.id}`) }) : t("ui.patron.nothing")}
      </div>
    </li>
  );
}

export function GuestsTab({ state, t, lang }: Common) {
  const b = bs(state);
  const present = b.shift?.visits ?? [];
  const regulars = Object.values(b.patrons)
    .filter((p) => p.regular && !present.some((v) => v.patron === p.id))
    .sort((a, c) => c.memory.interest - a.memory.interest);
  return (
    <div>
      <div className="cap">{t("ui.patrons")}</div>
      <ul className="patrons">
        {present.length === 0 && <li className="muted">{t("ui.nobody")}</li>}
        {present.map((v) => (
          <PatronRow key={v.patron} p={b.patrons[v.patron]!} t={t} lang={lang} />
        ))}
      </ul>
      {regulars.length > 0 && (
        <>
          <div className="cap gap">{t("ui.regulars")}</div>
          <ul className="patrons">
            {regulars.map((p) => (
              <PatronRow key={p.id} p={p} t={t} lang={lang} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Her recent answers. Without debug the player only gets what he could have witnessed. */
export function WhyTab({ state, t, lang, debug }: Common & { debug: boolean }) {
  const b = bs(state);
  const list = [...b.proposals].reverse().filter((p) => debug || p.seen);
  if (list.length === 0) return <p className="muted">{t("ui.why.none")}</p>;
  return (
    <div className="why-list">
      {list.map((p, i) => (
        <WhyLine key={`${p.day}-${p.tick}-${p.patron}-${i}`} record={p} state={state} t={t} lang={lang} />
      ))}
    </div>
  );
}
