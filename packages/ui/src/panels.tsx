import { useState } from "react";
import { bs, clockText, content, expectLevel, fitOf, HUSBAND, patronName, renderLog, renderParams, WIFE } from "@tc/base";
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
  /** Transparent mode: show what the husband could not know (unseen log lines, her hidden sides, every answer). */
  open?: boolean;
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
        <span className="muted">{t("ui.purse", { purse: b.purse })}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.stock")}</span>
        <span className={`big${b.stock < 8 ? " bad" : ""}`}>{b.stock}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.reputation")}</span>
        <span className="big">{Math.round(b.reputation)}</span>
      </div>
      <div className="cell">
        <span className="cap">{b.mode === "open" ? "NTS" : "NTR"}</span>
        <span className={b.mode === "open" ? "accent" : "muted"}>{t(`mode.${b.mode}`)}</span>
        {b.mode === "hidden" ? (
          <span className={b.suspicion >= content.secrecy.confrontAt ? "bad" : "muted"}>
            {t("ui.suspicion")} {Math.round(b.suspicion)}
          </span>
        ) : (
          <span className="muted">
            {t("ui.power")} {Math.round(b.power)}
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

export function ScenePanel({ state, t, lang, scene, open }: Common & { scene: SceneDesc | null }) {
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
  const subject = b.encounter?.patron ?? b.shift?.moment?.patron ?? (b.night?.asked ? HUSBAND : undefined);
  const visible = scene && scene.type !== "idle" && scene.type !== "serving" && (scene.type !== "sleeping" || b.night?.asked);
  const record = visible && subject ? [...b.proposals].reverse().find((p) => p.patron === subject && (subject === HUSBAND || p.verdict !== "refuse")) : undefined;
  return (
    <div className="scene">
      <div className="picture" dangerouslySetInnerHTML={{ __html: svg }} />
      {!wifeHere && <div className="hint">{t("ui.not_here")}</div>}
      {b.night?.sex && (
        <div className="meters">
          <Bar label={t("ui.bed.his")} value={b.night.sex.his} tone="his" />
          <Bar label={t("ui.bed.hers")} value={b.night.sex.hers} tone="hers" />
          <div className="muted small">
            {t(`act.${b.night.sex.act}`)} · {b.night.sex.turns * content.body.bed.minutesPerTurn} {t("ui.min")}
            {b.night.sex.came > 0 ? ` · ${t("ui.bed.came", { n: String(b.night.sex.came) })}` : ""}
          </div>
        </div>
      )}
      {record && <WhyLine record={record} state={state} t={t} lang={lang} open={open} />}
    </div>
  );
}

function fmt(v: number) {
  return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toString();
}

/** One line "who, what, verdict" + the three biggest reasons; the full table opens on click. */
export function WhyLine({ record, state, t, lang, open: transparent }: Common & { record: ProposalRecord }) {
  const [open, setOpen] = useState(false);
  const p = bs(state).patrons[record.patron];
  const top = [...record.rows].sort((a, c) => Math.abs(c.value) - Math.abs(a.value)).slice(0, 3);
  const rows = open ? record.rows : top;
  return (
    <div className={`why verdict-${record.verdict}`}>
      <div className="why-head">
        <span className="time">
          {clockText(record.tick < 0 ? content.balance.clock.night : content.balance.shift.opensAt * 60 + record.tick * content.balance.shift.minutesPerTick)}
        </span>
        <b>{record.patron === HUSBAND ? t("ui.you") : p ? patronName(p.name, lang) : "?"}</b>
        <span>{t(`act.${record.act}`)}</span>
        <span className="pill">
          {t(`verdict.${record.verdict}`)} {fmt(record.total)}
        </span>
        {record.rolled !== undefined && <span className="muted small">{t("verdict.rolled", { percent: Math.round(record.rolled * 100) })}</span>}
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? t("ui.why.less") : t("ui.why.more")}
        </button>
      </div>
      <div className={open ? "rows open" : "rows"}>
        {rows.map((r) => (
          <span key={r.id} className="row">
            {t(!transparent && r.id.startsWith("consent.latent.") ? "factor.consent.latent" : r.labelKey)} <b className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</b>
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
                    {r.id === here && bs(state).shift && ["cafe.hall", "cafe.kitchen", "cafe.bar"].includes(r.id) && (
                      <span className="spot">{t(`ui.spot.${r.id}`)}</span>
                    )}
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

export function HeroineTab({ state, t, open }: Common) {
  const h = bs(state).heroine;
  const tones = { energy: "green", mood: "green", arousal: "pink", drunk: "amber" };
  return (
    <div>
      <div className="cap">{t("ui.state")}</div>
      {(["energy", "mood", "arousal", "drunk"] as const).map((k) => (
        <Bar key={k} label={t(`stat.${k}`)} value={h[k]} tone={tones[k]} />
      ))}
      <Bar label={t("stat.satisfied")} value={h.satisfied} />
      <div className="cap gap">{t("ui.character")}</div>
      {(Object.keys(h.traits) as (keyof typeof h.traits)[]).map((k) => (
        <Bar key={k} label={t(`trait.${k}`)} value={h.traits[k]} />
      ))}
      <Bar label={t("stat.sizeTaste")} value={h.sizeTaste} />
      <div className="cap gap">{t("ui.directive")}</div>
      <div>
        {t("ui.outfit")}: <b>{t(`outfit.${h.outfit}`)}</b> · {t(`directive.${bs(state).directive}`)}
      </div>
      {open && (
        <>
          <div className="cap gap">{t("ui.latents")}</div>
          {Object.keys(h.latents).length === 0 && <div className="muted">{t("ui.latents.none")}</div>}
          <div className="chips">
            {Object.keys(h.latents).map((id) => (
              <span key={id} className="chip latent">
                {t(`latent.${id}`)}
              </span>
            ))}
          </div>
        </>
      )}
      {Object.keys(h.tastes.acts).length > 0 && (
        <>
          <div className="cap gap">{t("ui.tastes")}</div>
          <div className="rows">
            {Object.entries(h.tastes.acts)
              .filter(([, v]) => Math.abs(v) >= 1)
              .sort((a, c) => c[1] - a[1])
              .slice(0, 6)
              .map(([id, v]) => (
                <span key={id} className="row">
                  {t(`act.${id}`)} <b className={v < 0 ? "neg" : "pos"}>{fmt(v)}</b>
                </span>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The day in numbers, shown while the summary phase lasts. */
export function Summary({ state, t }: Common) {
  const d = bs(state).today;
  const net = d.income + d.tips - d.supplies - d.rent - d.interest;
  const line = (key: string, value: number, sign = 1) => (
    <div className="sum-line">
      <span>{t(key)}</span>
      <b className={sign < 0 && value > 0 ? "neg" : ""}>{sign < 0 && value > 0 ? `-${value}` : value}</b>
    </div>
  );
  return (
    <div className="summary">
      <div className="card-title">{t("ui.summary.title", { day: d.day })}</div>
      {line("ui.summary.income", d.income)}
      {line("ui.summary.tips", d.tips)}
      {line("ui.summary.supplies", d.supplies, -1)}
      {line("ui.summary.rent", d.rent, -1)}
      {line("ui.summary.interest", d.interest, -1)}
      <div className="sum-line total">
        <span>{t("ui.summary.net")}</span>
        <b className={net < 0 ? "neg" : "pos"}>{net}</b>
      </div>
      <div className="muted small">
        {t("ui.summary.served")}: {d.served} · {t("ui.summary.turned")}: {d.turnedAway}
      </div>
    </div>
  );
}

/** What he has told or shown her, and what she has made of it. */
function Expectations({ state, t, lang }: Common) {
  const b = bs(state);
  const known = Object.entries(b.expect)
    .filter(([, v]) => Math.abs(v) >= 15)
    .map(([id, v]) => ({ id, v, ...expectLevel(v), tier: content.acts.find((a) => a.id === id)?.tier ?? 0 }))
    .sort((a, c) => a.tier - c.tier);
  const list = (side: "allow" | "deny") => {
    const items = known.filter((k) => k.side === side);
    if (items.length === 0) return null;
    return (
      <>
        <div className="cap gap">{t(`ui.thinks.${side}`)}</div>
        {items.map((k) => (
          <div key={k.id} className="thinks">
            <span className="muted small">{t(`ui.sure.${k.sure}`)}:</span> {t(`act.${k.id}`)}
          </div>
        ))}
      </>
    );
  };
  return (
    <>
      <div className="cap gap">{t("ui.told")}</div>
      {b.told.length === 0 && <div className="muted small">{t("ui.told.none")}</div>}
      {[...b.told].reverse().slice(0, 5).map((x, i) => (
        <div key={i} className="thinks">
          {t(x.key, renderParams(x.params, t, lang))} <span className="muted small">({t("ui.day.short", { day: x.day })})</span>
        </div>
      ))}
      {list("allow")}
      {list("deny")}
    </>
  );
}

/** Her body and the two of you: the slow numbers. */
export function CoupleTab({ state, t, lang }: Common) {
  const b = bs(state);
  const h = b.heroine;
  const skills = Object.entries(h.skills).sort((a, c) => c[1] - a[1]);
  return (
    <div>
      <div className="cap">{t("ui.marriage")}</div>
      <Bar label={t("stat.desire")} value={h.marriage.desire} tone="pink" />
      <Bar label={t("stat.resent")} value={h.marriage.resent} tone="amber" />
      {b.mode === "open" && <Bar label={t("ui.power")} value={b.power} />}
      <div className="muted small">
        {t("ui.husband.line", { size: b.husband.size, minutes: b.husband.minutes, style: t(`husband.style.${b.husband.style}`) })}
      </div>
      {b.denied > 1 && <div className="muted small">{t("ui.denied", { n: b.denied })}</div>}
      {b.secretKnows && <div className="small bad">{t("ui.secret_knows")}</div>}
      <Expectations state={state} t={t} lang={lang} />
      <div className="cap gap">{t("ui.body")}</div>
      {(["vagina", "anus", "mouth"] as const).map((z) => (
        <div key={z}>
          <Bar label={t(`zone.${z}`)} value={h.body[z].stretch} />
          <div className="muted small indent">{t("ui.fit", { cm: Math.round(fitOf(state, z) * 10) / 10 })}</div>
        </div>
      ))}
      {skills.length > 0 && (
        <>
          <div className="cap gap">{t("ui.skills")}</div>
          {skills.map(([id, v]) => (
            <Bar key={id} label={t(`act.${id}`)} value={v} />
          ))}
        </>
      )}
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
        {p.memory.sizeKnown && ` · ${t("ui.patron.size", { size: p.size })}`}
        {p.memory.orgasms > 0 && ` · ${t("ui.patron.came", { n: p.memory.orgasms })}`}
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
        <WhyLine key={`${p.day}-${p.tick}-${p.patron}-${i}`} record={p} state={state} t={t} lang={lang} open={debug} />
      ))}
    </div>
  );
}

/** Phone: what has reached the husband. Her threads show only what he has read (everything once it is open). */
export function PhoneTab({ state, t, lang, debug }: Common & { debug: boolean }) {
  const b = bs(state);
  const threads = Object.entries(b.phone.threads)
    .map(([other, list]) => ({ other, list: list.filter((m) => debug || m.seen) }))
    .filter((x) => x.list.length > 0);
  const unread = Object.values(b.phone.threads).flat().filter((m) => !m.seen).length;
  const name = (id: string) => (id === WIFE ? t("ui.phone.she") : id === HUSBAND ? t("ui.you") : b.patrons[id] ? patronName(b.patrons[id]!.name, lang) : "?");
  return (
    <div>
      <div className="cap">{t("ui.phone.hers")}</div>
      {unread > 0 && b.mode === "hidden" && <div className="muted small">{t("ui.phone.unread", { n: unread })}</div>}
      {threads.length === 0 && <p className="muted">{t("ui.phone.empty")}</p>}
      {threads.map(({ other, list }) => (
        <div key={other} className="thread">
          <div className="thread-title">
            {name(other)}
            {b.phone.expected.includes(other) && <span className="pill">{t("ui.phone.expected")}</span>}
          </div>
          {list.slice(-6).map((m, i) => (
            <div key={i} className={`sms ${m.from === WIFE ? "out" : "in"}${m.seen ? "" : " unseen"}`}>
              <span className="time">
                {t("ui.day", { day: m.day })} {clockText(m.minute)}
              </span>
              {t(m.key, renderParams(m.params, t, lang))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
