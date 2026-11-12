import { useState } from "react";
import { CONSENT_FORMULA, charmOf, verdictOf, inspect, annoyedLevel, fameOf, fameTier, weekdayOf, soreOf, wearOf, slick, ATTRS, attrOf, faceOf, feelingsOf, latitudeOf, trustOf, wantsOf, himOf, worryOf, annoyanceOf, describeScene, bs, clockText, content, expectLevel, fitOf, HUSBAND, patronName, pleasureFor, renderParams, WIFE, installment, husbandSees, sizeClass, withLook } from "@tc/base";
import type { ConsentInput, DeltaRow, DeltaVia, Patron, ProposalRecord } from "@tc/base";
import { CORE_MOVE } from "@tc/core";
import type { Action, GameState, SceneDesc } from "@tc/core";
import { renderSchematic } from "@tc/schematics";
import { engine } from "./game";
import { pictureFor } from "./pack";
import type { Lang, T } from "./game";

export interface Common {
  /** Where he last saw her with his own eyes. */
  guess?: string;
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
        <span className="muted">
          {t("ui.day", { day: state.time.day })}, {t(`weekday.${weekdayOf(state)}`).toLowerCase()}
          {b.weather ? ` · ${t(`weather.${b.weather}`).split(",")[0]!.toLowerCase()}` : ""}
        </span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.money")}</span>
        <span className="big gold">{b.money}</span>
        <span className="muted">{t("ui.purse", { purse: b.purse })}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.debt")}</span>
        <span className="big bad">{b.debt}</span>
        {b.debt > 0 && <span className={b.loan.dueDay - state.time.day <= 1 ? "bad" : "muted"}>{t("ui.loan.next", { money: installment(state), day: b.loan.dueDay })}</span>}
      </div>
      <div className="cell">
        <span className="cap">{t("ui.stock")}</span>
        <span className={`big${b.stock < 8 ? " bad" : ""}`}>{b.stock}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.reputation")}</span>
        <span className="big">{Math.round(b.reputation)}</span>
        <span className="muted">{t("ui.clean")} {Math.round(b.clean)}</span>
      </div>
      <div className="cell">
        <span className="cap">{t("ui.him.energy")}</span>
        <span className={`big${himOf(state).energy < content.day.rhythm.him.tiredBelow ? " bad" : ""}`}>{Math.round(himOf(state).energy)}</span>
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

const LEWD = new Set(content.acts.filter((a) => a.tier >= 2).map((a) => a.id));
/** What a log line is about, for its colour: money, something lewd, or plain business. */
function kindOf(key: string, params: Record<string, unknown> | undefined): "money" | "lewd" | "system" {
  const act = /^log\.act\.([a-z_]+)\./.exec(key)?.[1];
  if (act) return LEWD.has(act) ? "lewd" : "system";
  if (/^log\.(enc|bed|came|husband|night|bare|towels|caught|leave|annoyed|approach\.tease|answer\.tease|her\.(starts|compare|stretch|his)|gym\.(met|late|locker))/.test(key)) return "lewd";
  if (/tip|income|rent|loan|buy|supplies|sold|paid|money|salary|market|side_job/.test(key) || ["tip", "money", "income"].some((k) => typeof params?.[k] === "number" && (params[k] as number) > 0)) return "money";
  return "system";
}
const MONEY_KEYS = new Set(["tip", "money", "cost", "offer", "price", "income", "rent", "amount"]);
/** A log line with its names, acts and sums picked out: every guest has his own colour, acts are pink, money is gold. */
/** Drunk: what she says inside the quotes trails off. The narration around it stays sober. */
const slur = (text: string) =>
  text.replace(/"([^"]+)"/g, (_m, inner: string) => `"${inner.replace(/, /, "... ").replace(/([^.!?…])[.!]+(\s|$)/g, "$1...$2").replace(/([^.!?…])$/, "$1...")}"`);

function richLine(e: { key: string; params?: Record<string, unknown>; tags?: string[] }, t: T, lang: Lang) {
  const spans: { text: string; cls: string; hue?: number }[] = [];
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.params ?? {})) {
    let span: { text: string; cls: string; hue?: number } | null = null;
    if (typeof v === "string" && v.startsWith("@name:")) span = { text: patronName(Number(v.slice(6)), lang), cls: "who", hue: (Number(v.slice(6)) * 47) % 360 };
    else if (typeof v === "string" && v.startsWith("act.")) span = { text: t(v), cls: "pink" };
    else if (typeof v === "number" && MONEY_KEYS.has(k)) span = { text: String(v), cls: "gold" };
    if (span) {
      params[k] = `\u0001${spans.length}\u0002`;
      spans.push(span);
    } else params[k] = typeof v === "string" ? t(v) : (v as number);
  }
  const plain = t(e.key, params);
  const text = e.tags?.includes("slur") ? slur(plain) : plain;
  return text.split(/(\u0001\d+\u0002)/).map((part, i) => {
    const m = /\u0001(\d+)\u0002/.exec(part);
    if (!m) return <span key={i}>{part}</span>;
    const sp = spans[Number(m[1])]!;
    return (
      <span key={i} className={sp.cls} style={sp.hue === undefined ? undefined : { color: `hsl(${sp.hue} 70% 74%)` }}>
        {sp.text}
      </span>
    );
  });
}

type LogFilter = "all" | "people" | "money" | "lewd";
export function Log({ state, t, lang, debug }: Common & { debug: boolean }) {
  const [filter, setFilter] = useState<LogFilter>("all");
  // what happens out of his sight is not told to him, but a house is not silent: one line of noise per moment of it
  const visible: typeof state.log = [];
  for (const e of state.log) {
    if (debug || !e.tags?.includes("unseen")) visible.push(e);
    else if (!e.tags?.includes("thought")) {
      const last = visible[visible.length - 1];
      if (!(last && last.key === "log.noise" && last.day === e.day && Math.abs(last.minute - e.minute) < 10)) visible.push({ ...e, key: "log.noise", params: undefined, tags: ["noise"] });
    }
  }
  const fits = (e: (typeof visible)[number]) => {
    if (filter === "all") return true;
    const kind = kindOf(e.key, e.params);
    if (filter === "people") return typeof e.params?.name === "string" || /^log\.(talk|hear|ask|stance|about|wish|tell|dare|complaint|morning\.ignored|promise)/.test(e.key) || e.tags?.includes("thought") === true;
    return kind === filter;
  };
  const shown = visible.filter(fits);
  const hidden = visible.length - shown.length;
  // the same line over and over is one line with a count and the span of time it covers
  type Row = { e: (typeof visible)[number]; n: number; from: number };
  const rows: Row[] = [];
  for (const e of shown.slice(-120)) {
    const last = rows.at(-1);
    if (last && last.e.key === e.key && last.e.day === e.day && JSON.stringify(last.e.params ?? {}) === JSON.stringify(e.params ?? {})) {
      last.n += 1;
      last.e = e;
    } else rows.push({ e, n: 1, from: e.minute });
  }
  rows.reverse();
  const shownRows = rows.slice(0, 80);
  let lastDay = -1;
  return (
    <div className="log">
      <div className="log-filters">
        {(["all", "people", "money", "lewd"] as LogFilter[]).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {t(`ui.log.${f}`)}
          </button>
        ))}
        {hidden > 0 && <span className="muted small">{t("ui.log.hidden", { n: hidden })}</span>}
      </div>
      {shownRows.map(({ e, n, from }, i) => {
        const dayMark = e.day !== lastDay;
        lastDay = e.day;
        const unseen = e.tags?.includes("unseen");
        // what the last action brought sits above a line; everything older is dimmed
        const fresh = e.turn === state.turn;
        const edge = !fresh && i > 0 && shownRows[i - 1]!.e.turn === state.turn;
        return (
          <div key={`${e.turn}-${i}`}>
            {edge && <div className="since">{t("ui.log.since")}</div>}
            {dayMark && <div className="daymark">{t("ui.day", { day: e.day })}</div>}
            <div className={`entry k-${kindOf(e.key, e.params)}${unseen ? " unseen" : ""}${e.tags?.includes("thought") ? " thought" : ""}${fresh ? "" : " old"}`} title={unseen ? t("ui.unseen") : undefined}>
              <span className="time">{clockText(e.minute)}</span>
              <span>
                {richLine(e, t, lang)}
                {n > 1 && <span className="muted small"> x{n} ({t("ui.log.more", { n: n - 1, from: clockText(from), to: clockText(e.minute) })})</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The running count: what the place is known for, and who she has been with. */
export function StatsTab({ state, t, lang, open }: Common) {
  const b = bs(state);
  const tally = b.tally;
  const partners = Object.entries(tally?.partners ?? {}).sort((x, y) => y[1] - x[1]);
  const acts = Object.entries(tally?.acts ?? {}).sort((x, y) => y[1] - x[1]);
  const who = (id: string) => (id === HUSBAND ? t("ui.memory.you") : b.patrons[id] ? patronName(b.patrons[id]!.name, lang) : t("ui.memory.someone"));
  return (
    <div>
      <div className="cap">{t("ui.stats.axes")}</div>
      <Bar label={t("ui.stats.service")} value={b.reputation} tone="green" />
      <Bar label={t("ui.stats.fame")} value={fameOf(state)} />
      <Bar label={t("ui.stats.scandal")} value={b.gossip} tone="amber" />
      <div className="muted small">{t(`fame.${fameTier(state)}`)}</div>
      <div className="cap gap">{t("ui.stats.total")}</div>
      {!tally && <div className="muted small">{t("ui.stats.none")}</div>}
      {tally && <div className="small">{t("ui.stats.you", { n: tally.partners[HUSBAND] ?? 0 })}</div>}
      {tally && !open && <div className="muted small">{t("ui.stats.hidden")}</div>}
      {tally && open && (
        <>
          <div className="small">{t("ui.stats.sum", { n: partners.reduce((s, [, n]) => s + n, 0), men: partners.filter(([id]) => id !== HUSBAND).length, came: tally.came })}</div>
          <div className="cap gap">{t("ui.stats.partners")}</div>
          <div className="rows">
            {partners.slice(0, 12).map(([id, n]) => (
              <span key={id} className="row">
                {who(id)} <b>{n}</b>
              </span>
            ))}
          </div>
          <div className="cap gap">{t("ui.stats.acts")}</div>
          <div className="rows">
            {acts.slice(0, 16).map(([id, n]) => (
              <span key={id} className="row">
                {t(`act.${id}`)} <b>{n}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- scene

/** Men standing around and looking on: drawn at the edges of whatever the picture is. */
const WATCHERS = [
  { role: "watcher", pose: "stand" as const, x: -106, flip: false },
  { role: "watcher", pose: "stand" as const, x: 106, flip: true },
];

export function ScenePanel({ state, t, lang, scene, open, picture }: Common & { scene: SceneDesc | null; picture?: { url: string; key: string; exact: boolean } | null }) {
  const b = bs(state);
  const layout = scene ? (content.scenes.find((s) => s.id === scene.type) ?? content.scenes.find((s) => s.id === "idle")!) : null;
  const wifeHere = state.where[WIFE] === state.where[HUSBAND];
  // She is somewhere he cannot see: the panel still shows her. Clear in transparent mode, behind a blur otherwise.
  const wifeShown = !!scene?.participants.some((p) => p.id === WIFE);
  const enc = b.encounter;
  const away: SceneDesc | null =
    scene && !wifeShown && state.time.phase !== "summary"
      ? enc
        ? { type: content.acts.find((a) => a.id === enc.act)!.scene, location: enc.loc, participants: [{ id: WIFE, role: "wife" }, { id: enc.patron, role: "patron" }], tags: {} }
        : { type: "idle", location: state.where[WIFE] ?? "", participants: [{ id: WIFE, role: "wife" }], tags: {} }
      : null;
  const awayLayout = away ? content.scenes.find((x) => x.id === away.type) : null;
  const awayPicture = away ? pictureFor(withLook(state, away), state.time.day * 7 + state.turn) : null;
  const awaySvg = away
    ? renderSchematic(away.type === "idle" || !awayLayout ? [{ role: "wife", pose: "stand" as const, x: 0 }] : awayLayout.figures, {
        title: open ? t(`scene.${awayLayout?.id ?? "idle"}`) : t("ui.scene.unseen"),
        subtitle: t(`loc.${away.location}`),
        legend: { wife: t("role.wife"), patron: t("role.patron"), husband: t("role.husband") },
      })
    : "";
  const task = state.time.phase === "prep" ? b.day?.her?.task : undefined;
  const svg =
    scene && layout
      ? renderSchematic(
          // "idle" shows whoever is actually in the room; other scenes use their layout
          scene.type === "idle"
            ? scene.participants.filter((p) => p.id !== HUSBAND).slice(0, 4).map((p, i) => ({ role: p.role, pose: "stand" as const, x: -54 + i * 36 }))
            : [...layout.figures, ...(scene.tags?.crowd ? WATCHERS : [])],
          {
            title: t(`scene.${layout.id}`),
            subtitle: t(`loc.${scene.location}`),
            legend: { wife: t("role.wife"), patron: t("role.patron"), husband: t("role.husband"), patron2: `${t("role.patron")} 2`, patron3: `${t("role.patron")} 3`, watcher: t("role.watcher") },
          },
        )
      : "";
  // the answer that led to what is on screen, if any
  const subject = b.encounter?.patron ?? b.shift?.moment?.patron ?? (b.night?.asked ? HUSBAND : undefined);
  const visible = scene && scene.type !== "idle" && scene.type !== "serving" && (scene.type !== "sleeping" || b.night?.asked);
  const asked = visible && subject ? [...b.proposals].reverse().find((p) => p.patron === subject && (subject === HUSBAND || p.verdict !== "refuse")) : undefined;
  // something is going on that nobody asked her about in so many words (he pushed her to it, it grew out of the last thing): the reasons are worked out as they stand now
  const live = (): ProposalRecord | undefined => {
    if (!enc || !visible) return undefined;
    const res = engine.evaluate<ConsentInput>(CONSENT_FORMULA, state, { act: enc.act, partner: enc.patron, loc: enc.loc, offer: 0, pressure: 0 });
    return { day: state.time.day, tick: b.shift?.tick ?? -1, patron: enc.patron, act: enc.act, loc: enc.loc, verdict: verdictOf(res.total), seen: true, total: res.total, rows: res.rows };
  };
  const record = enc && (!asked || asked.act !== enc.act || asked.patron !== enc.patron) ? live() : asked;
  return (
    <div className="scene">
      {away ? (
        awayPicture ? (
          <div className={`picture photo${open ? "" : " veiled"}`}>
            <img src={awayPicture.url} alt="" />
          </div>
        ) : (
          <div className={`picture${open ? "" : " veiled"}`} dangerouslySetInnerHTML={{ __html: awaySvg }} />
        )
      ) : picture && scene && layout ? (
        <div className="picture photo">
          <img src={picture.url} alt={t(`scene.${layout.id}`)} />
          <div className="photo-cap">
            <b>{t(`scene.${layout.id}`)}</b> · {t(`loc.${scene.location}`)}
            {open && !picture.exact && <span className="muted"> · {picture.key}</span>}
          </div>
        </div>
      ) : (
        <div className="picture" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {!wifeHere && (
        <div className="hint">
          {t("ui.not_here")} {t("ui.her.doing", { name: b.heroine.name ?? t("role.wife"), what: task ? t(`her.task.${task}`) : t(`loc.${state.where[WIFE]}`) })}
        </div>
      )}
      <SizeLine state={state} t={t} lang={lang} open={open} />
      {open && (
        <details className="words">
          <summary className="muted small">{t("ui.scene.words")}</summary>
          <div className="small mono">{describeScene(state, true).prompt}</div>
        </details>
      )}
      {b.encounter && b.shift && husbandSees(state, b.encounter.loc) && (
        <div className="meters">
          {(() => {
            const enc = b.encounter!;
            const intimate = enc.hisRate > 0;
            return (
              <>
                {intimate && <Bar label={t("ui.bed.him")} value={enc.his} tone="his" />}
                {intimate && <Bar label={t("ui.bed.hers")} value={enc.hers} tone="hers" />}
                <div className="muted small">
                  {t(`act.${enc.act}`)} · {t(`verdict.${enc.verdict}`)} · {t("ui.enc.for", { n: b.shift!.tick - enc.startTick })}
                  {enc.came > 0 ? ` · ${t("ui.bed.came", { n: String(enc.came) })}` : ""}
                </div>
              </>
            );
          })()}
        </div>
      )}
      {b.night?.sex && (
        <div className="meters">
          <Bar label={t("ui.bed.his")} value={b.night.sex.his} tone="his" />
          <Bar label={t("ui.bed.hers")} value={b.night.sex.hers} tone="hers" />
          <div className="muted small">
            {t(`act.${b.night.sex.act}`)} · {b.night.sex.turns * content.body.bed.minutesPerTurn} {t("ui.min")}
            {b.night.sex.came > 0 ? ` · ${t("ui.bed.came", { n: String(b.night.sex.came) })}` : ""}
          </div>
          {b.night.sex.asks && <div className="small bad">{b.night.sex.asks === "finish" ? t("ui.bed.asks.finish") : t("ui.bed.asks", { act: t(`act.${b.night.sex.asks}`) })}</div>}
          {b.night.sex.out && <div className="small bad">{t("ui.bed.out")}</div>}
        </div>
      )}
      {record && <WhyLine record={record} state={state} t={t} lang={lang} open={open} />}
    </div>
  );
}

/** How much of him there is next to what she is used to, and what it does for her: shown while something is going on. */
function SizeLine({ state, t, open }: Common) {
  const b = bs(state);
  const sex = b.night?.sex;
  const enc = b.encounter;
  const seen = enc ? husbandSees(state, enc.loc) || !!open : false;
  const p = enc ? b.patrons[enc.patron] : undefined;
  const actId = sex?.act ?? (enc && enc.hisRate > 0 && seen && p ? enc.act : undefined);
  const act = actId ? content.acts.find((a) => a.id === actId) : undefined;
  if (!act) return null;
  const size = sex ? b.husband.size : p!.size;
  const zone = act.zones.includes("anus") ? "anus" : act.zones.includes("vagina") ? "vagina" : act.zones.includes("mouth") ? "mouth" : null;
  const fit = zone ? fitOf(state, zone) : null;
  const hearts = Math.max(0, Math.min(5, Math.round(pleasureFor(state, act, size) / 20)));
  const MAX = 40;
  return (
    <div className="sizeline" title={t(`size.${sizeClass(size)}`)}>
      <span>{t("ui.size.his", { cm: size })}</span>
      <div className="track">
        <div className="len" style={{ width: `${Math.min(100, (size / MAX) * 100)}%` }} />
        {fit !== null && <div className="fit" style={{ left: `${Math.min(100, (fit / MAX) * 100)}%` }} title={t("ui.size.fit", { cm: Math.round(fit) })} />}
      </div>
      {fit !== null && <span className="muted small">{t("ui.size.fit", { cm: Math.round(fit) })}</span>}
      <span className="hearts">{"♥".repeat(hearts) + "♡".repeat(5 - hearts)}</span>
    </div>
  );
}

function fmt(v: number) {
  return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toString();
}

/** One line "who, what, verdict" + the three biggest reasons; the full table opens on click. */
export function WhyLine({ record, state, t, lang, open: transparent }: Common & { record: ProposalRecord }) {
  // a card, not a line: every reason on its own row, biggest first, with a bar for its weight
  const [open, setOpen] = useState(true);
  const p = bs(state).patrons[record.patron];
  const sorted = [...record.rows].sort((a, c) => Math.abs(c.value) - Math.abs(a.value));
  const rows = open ? sorted : sorted.slice(0, 3);
  const peak = Math.max(1, ...sorted.map((r) => Math.abs(r.value)));
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
      <div className="why-cap">{t(record.verdict === "refuse" ? "ui.why.cap.no" : "ui.why.cap.yes")}</div>
      <div className="why-list">
        {rows.map((r) => (
          <div key={r.id} className={`why-row ${r.value < 0 ? "neg" : "pos"}`}>
            <span className="why-arrow">{r.value < 0 ? "↓" : "↑"}</span>
            <span className="why-label">{t(!transparent && r.id.startsWith("consent.latent.") ? "factor.consent.latent" : r.labelKey)}</span>
            <span className="why-bar">
              <i style={{ width: `${Math.max(6, Math.round((Math.abs(r.value) / peak) * 100))}%` }} />
            </span>
            {transparent && <b className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</b>}
          </div>
        ))}
      </div>
      <div className="why-foot muted small">{t("ui.why.foot", { total: fmt(record.total), yes: content.consent.hesitantAt, eager: content.consent.eagerAt })}</div>
    </div>
  );
}

/** Who is where, as a grid of small room cards by floor: fits a narrow column, a click walks there. */
export function RoomGrid({ state, t, lang, onAct, open, guess }: Common & { onAct(a: Action): void }) {
  const here = state.where[HUSBAND];
  const knowsHer = open || state.where[WIFE] === here || husbandSees(state, state.where[WIFE] ?? "");
  const moves = engine.listActions(state).filter((a) => a.type === CORE_MOVE && a.actor === HUSBAND);
  const rooms = engine.locations().map((l) => ({ ...l, m: (l.meta as { map: { x: number; y: number } }).map }));
  const floors = [...new Set(rooms.map((r) => r.m.y))].sort((a, c) => a - c);
  return (
    <div className="rgrid">
      {floors.map((y) => (
        <div key={y}>
          <div className="rg-floor">{t(`ui.floor.${y}`)}</div>
          <div className="rg-row">
            {rooms
              .filter((r) => r.m.y === y)
              .sort((a, c) => a.m.x - c.m.x)
              .map((r) => {
                const move = moves.find((a) => a.payload?.to === r.id);
                // what he cannot see from where he stands he does not know: she is drawn where he last saw her, faintly
                const sees = open || r.id === here || husbandSees(state, r.id);
                const herHere = sees ? state.where[WIFE] === r.id : !knowsHer && guess === r.id;
                const people = Object.keys(state.where).filter((id) => (id === WIFE ? herHere : state.where[id] === r.id && (sees || id === HUSBAND)));
                const guests = people.filter((id) => id !== WIFE && id !== HUSBAND);
                return (
                  <button key={r.id} className={`rg-room${r.id === here ? " here" : ""}${move ? " reachable" : ""}${people.length === 0 ? " empty" : ""}`} disabled={!move} onClick={() => move && onAct(move)} title={t(r.nameKey)}>
                    <span className="rg-name">{t(r.nameKey)}</span>
                    <span className="rg-who">
                      {people.includes(HUSBAND) && <i className="husband">{t("ui.you")}</i>}
                      {people.includes(WIFE) && <i className={`wife${sees ? "" : " guess"}`} title={sees ? undefined : t("ui.guess.hint")}>{who(WIFE, state, t, lang)}{sees ? "" : "?"}</i>}
                      {guests.length === 1 && <i className="patron">{who(guests[0]!, state, t, lang)}</i>}
                      {guests.length > 1 && <i className="patron">×{guests.length}</i>}
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

// ---------------------------------------------------------------- her, at a glance

/** The card in the middle column: how she is right now, in one word, a few chips and two short columns of bars. */
export function HerCard({ state, t, open, lang, guess }: Common) {
  const [more, setMore] = useState(true);
  const knowsHer = open || state.where[WIFE] === state.where[HUSBAND] || husbandSees(state, state.where[WIFE] ?? "");
  const b = bs(state);
  const h = b.heroine;
  const chips: string[] = [];
  if (h.drunk >= 70) chips.push("ui.chip.drunk3");
  else if (h.drunk >= 40) chips.push("ui.chip.drunk2");
  else if (h.drunk >= 15) chips.push("ui.chip.drunk");
  const level = annoyedLevel(state);
  if (level === "done") chips.push("ui.chip.fedup");
  else if (level === "tired") chips.push("ui.chip.annoyed");
  if (h.energy < 25) chips.push("ui.chip.tired");
  if (open && (["vagina", "anus", "mouth"] as const).some((z) => soreOf(state, z) >= 30)) chips.push("ui.chip.sore");
  const wants = wantsOf(state);
  const top = (Object.entries(wants) as [string, number][]).sort((a, c) => c[1] - a[1])[0]!;
  const topWant = top[1] >= content.mind.wants.hintFrom && (open || top[0] === "rest" || top[0] === "attention") ? top[0] : null;
  const task = state.time.phase === "prep" ? b.day?.her?.task : undefined;
  const feelings = feelingsOf(state).slice(0, 4);
  // in the morning and through the day: how she carries last night, as far as anyone could tell by looking
  const f = (e: "guilt" | "shame" | "longing" | "tenderness" | "delight" | "anger") => h.feel?.[e] ?? 0;
  const sore = (["vagina", "anus", "mouth"] as const).some((z) => soreOf(state, z) >= 35);
  const seems =
    state.time.phase !== "prep" ? null : sore ? "careful" : f("anger") >= 25 || h.marriage.resent >= 50 ? "sharp" : f("guilt") + f("shame") >= 35 ? "quiet" : f("longing") >= 30 || h.frustration >= 40 ? "restless" : f("tenderness") + f("delight") >= 30 || h.mood >= 72 ? "humming" : h.energy < 45 ? "worn" : null;
  const last = (b.diary ?? []).find((d) => d.day === state.time.day - 1);
  const yesterday = last
    ? Object.entries(last.with)
        .filter(([id]) => open || id === HUSBAND || last.seen[id])
        // small talk and a shared drink are not what stays with her
        .map(([id, acts]) => [id, Object.keys(acts).filter((a) => (content.acts.find((x) => x.id === a)?.tier ?? 0) >= 2)] as const)
        .filter(([, acts]) => acts.length > 0)
        .map(([id, acts]) => `${who(id, state, t, lang)} - ${acts.map((a) => t(`act.${a}`)).join(", ")}`)
        .join("; ")
    : "";
  return (
    <div className="hercard">
      <div className="hc-head">
        <b className="hc-name">{h.name ?? t("role.wife")}</b>
        <span className="hc-face">{t(`face.${faceOf(state)}`)}</span>
        {chips.map((c) => (
          <span key={c} className="chip warn">
            {t(c)}
          </span>
        ))}
        <button className="link" onClick={() => setMore(!more)}>
          {t(more ? "ui.her.less" : "ui.her.more")}
        </button>
      </div>
      <div className="muted small">
        {knowsHer ? t(`loc.${state.where[WIFE]}`) : t("ui.guess.where", { where: t(`loc.${guess ?? state.where[WIFE]}`) })}
        {task && knowsHer ? ` · ${t(`her.task.${task}`)}` : ""}
        {topWant ? ` · ${t("ui.wants.hint", { what: t(`want.${topWant}`) })}` : ""}
      </div>
      {seems && <div className="small hc-seems">{t(`ui.seems.${seems}`)}</div>}
      {yesterday && (
        <div className="small muted">
          {t("ui.memory.yesterday")}: {yesterday}
        </div>
      )}
      {more && (
        <div className="hc-cols">
          <div>
            <div className="cap">{t("ui.her.self")}</div>
            <Bar label={t("stat.energy")} value={h.energy} tone="green" />
            <Bar label={t("stat.mood")} value={h.mood} tone="green" />
            {open && <Bar label={t("stat.arousal")} value={h.arousal} tone="pink" />}
            {h.drunk >= 1 && <Bar label={t("stat.drunk")} value={h.drunk} tone="amber" />}
            <Bar label={t("ui.charm")} value={charmOf(state)} tone="pink" />
            {open && annoyanceOf(state) >= 1 && <Bar label={t("ui.annoyance")} value={annoyanceOf(state)} tone="amber" />}
          </div>
          <div>
            <div className="cap">{t("ui.her.withyou")}</div>
            {open ? (
              <>
                <Bar label={t("ui.trust")} value={trustOf(state)} />
                <Bar label={t("stat.desire")} value={h.marriage.desire} tone="pink" />
                <Bar label={t("stat.resent")} value={h.marriage.resent} tone="amber" />
                <Bar label={t("ui.latitude.short")} value={latitudeOf(state)} />
              </>
            ) : (
              <div className="muted small">{t("ui.hidden.hint")}</div>
            )}
          </div>
        </div>
      )}
      {more && open && feelings.length > 0 && (
        <div className="hc-feel">
          <div className="cap">{t("ui.her.feel")}</div>
          {feelings.map(([e, v]) => (
            <Bar key={e} label={t(`emotion.${e}`)} value={v} tone={e === "tenderness" || e === "delight" || e === "pride" ? "green" : "amber"} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- how she took it

/** The card under the scene: how she took the last thing asked of her, in one coloured line, and what she said. */
export function OutcomeCard({ state, t, lang, open }: Common) {
  const o = bs(state).outcome;
  if (!o || (!o.seen && !open)) return null;
  const lines = state.log.filter((e) => e.turn === o.turn && e.day === o.day && e.minute === o.minute && (open || !e.tags?.includes("unseen")) && !e.tags?.includes("thought")).slice(-3);
  if (lines.length === 0) return null;
  const mins = (state.time.day - o.day) * 1440 + state.time.minute - o.minute;
  if (mins > 180) return null; // it was hours ago: no longer how she is taking things
  const age = mins <= 0 || o.turn === state.turn ? t("ui.outcome.now") : mins < 1440 ? t("ui.outcome.ago", { n: mins }) : t("ui.outcome.days", { n: Math.floor(mins / 1440) });
  return (
    <div className={`outcome o-${o.how}`}>
      <div className="o-head">
        <b>{t(`ui.outcome.${o.how}`)}</b>
        <span className="muted small">{o.who === HUSBAND ? t("ui.outcome.you") : t("ui.outcome.with", { name: who(o.who, state, t, lang) })}</span>
        <span className="muted small o-age">{age}</span>
      </div>
      {lines.map((e, i) => (
        <p key={i}>{richLine(e, t, lang)}</p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- "what if": the consent formula on demand

/** Pick any act, any partner, any place: the rows of her answer right now, without waiting for it to happen. */
export function ConsentCalc({ state, t, lang }: Common) {
  const b = bs(state);
  const [act, setAct] = useState(content.acts.find((a) => a.tier >= 2)?.id ?? content.acts[0]!.id);
  const [partner, setPartner] = useState<string>(HUSBAND);
  const [loc, setLoc] = useState<string>("");
  const [offer, setOffer] = useState(0);
  const here = b.shift?.visits.map((v) => v.patron) ?? [];
  const partners = [HUSBAND, ...here, ...Object.values(b.lodgers).map((l) => l.patron).filter((id) => !here.includes(id))];
  const who = partners.includes(partner) ? partner : HUSBAND;
  const where = loc || state.where[WIFE] || "";
  const res = engine.evaluate<ConsentInput>(CONSENT_FORMULA, state, { act, partner: who, loc: where, offer, pressure: 0 });
  const verdict = verdictOf(res.total);
  return (
    <details className="calc">
      <summary className="cap">{t("calc.title")}</summary>
      <div className="calc-pick">
        <select value={act} onChange={(e) => setAct(e.target.value)}>
          {content.acts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tier} · {t(`act.${a.id}`)}
            </option>
          ))}
        </select>
        <select value={who} onChange={(e) => setPartner(e.target.value)}>
          {partners.map((id) => (
            <option key={id} value={id}>
              {id === HUSBAND ? t("ui.you") : b.patrons[id] ? patronName(b.patrons[id]!.name, lang) : id}
            </option>
          ))}
        </select>
        <select value={where} onChange={(e) => setLoc(e.target.value)}>
          {engine.locations().map((l) => (
            <option key={l.id} value={l.id}>
              {t(l.nameKey)}
            </option>
          ))}
        </select>
        {who !== HUSBAND && (
          <label className="small muted">
            {t("calc.offer")} <input type="number" min={0} max={5000} value={offer} onChange={(e) => setOffer(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
      </div>
      <div className={`calc-total verdict-${verdict}`}>
        <b>{t(`verdict.${verdict}`)}</b> {fmt(res.total)}
        <span className="muted small">
          {" "}
          · {t("calc.need", { yes: content.consent.hesitantAt, glad: content.consent.eagerAt })}
        </span>
      </div>
      <div className="rows open">
        {[...res.rows]
          .sort((a, c) => Math.abs(c.value) - Math.abs(a.value))
          .map((r) => (
            <span key={r.id} className="row">
              {t(r.labelKey)} <b className={r.value < 0 ? "neg" : "pos"}>{fmt(r.value)}</b>
            </span>
          ))}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- inspector

const INSPECT_SHORT = 12;
/** What the last action changed and where it came from: big numbers on one line, the rest as small rows with a source. */
export function InspectorBlock({ prev, state, t, lang, what }: Common & { prev: GameState | null; what: string }) {
  const [all, setAll] = useState(false);
  if (!prev)
    return (
      <div className="inspector">
        <div className="insp-head">
          <span className="cap">{t("inspect.title")}</span>
          <span className="muted small">{t("inspect.first")}</span>
        </div>
      </div>
    );
  const ins = inspect(prev, state);
  const label = (r: DeltaRow) => t(r.label, renderParams(r.params, t, lang));
  const amount = (r: DeltaRow) => (r.id.startsWith("perm.") ? t(r.to > 0 ? "inspect.perm.allow" : "inspect.perm.forbid") : `${fmt(r.delta)} ${r.delta > 0 ? "↑" : "↓"}`);
  const tone = (r: DeltaRow) => (r.good === null ? "flat" : r.good ? "pos" : "neg");
  const via = (v: DeltaVia) => (v.key.startsWith("told.") ? t(v.key, renderParams(v.params, t, lang)) : reasonLabel(v.key, t)) + (v.amount !== undefined ? ` ${fmt(v.amount)}` : "");
  // a big number comes down as a row too when somebody left a reason next to it
  const small = ins.rows; // one list: every change with where it came from
  const shown = all ? small : small.slice(0, INSPECT_SHORT);
  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="cap">{t("inspect.title")}</span>
        <b>{what}</b>
        {ins.minutes > 0 && <span className="muted small">{t("inspect.minutes", { n: ins.minutes })}</span>}
      </div>
      {ins.rows.length === 0 && <div className="muted small">{t("inspect.none")}</div>}
      {shown.length > 0 && (
        <div className="insp-rows">
          {shown.map((r) => (
            <div key={r.id} className="insp-row" title={`${r.from} → ${r.to}`}>
              <span className="insp-what">{label(r)}</span>
              <b className={tone(r)}>{amount(r)}</b>
              {r.via.length > 0 && (
                <span className="insp-via">
                  {t("inspect.via")} {r.via.map(via).join(", ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {small.length > INSPECT_SHORT && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? t("ui.why.less") : t("inspect.more", { n: small.length - INSPECT_SHORT })}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- rooms

/** Rooms as cards with name chips, like a house plan. Click a linked room to walk there. */
export function Rooms({ state, t, lang, onAct }: Common & { onAct(a: Action): void }) {
  // The building as a plan: upstairs on top, the cafe below. Doors are gaps in the walls, stairs are marked.
  const here = state.where[HUSBAND];
  const moves = engine.listActions(state).filter((a) => a.type === CORE_MOVE && a.actor === HUSBAND);
  const rooms = engine.locations().map((l) => ({ ...l, m: (l.meta as { map: { x: number; y: number; w: number; h: number } }).map }));
  const CW = 98;
  const CH = 92;
  const PAD = 8;
  const GAP = 22; // room for the floor caption between storeys
  const cols = Math.max(...rooms.map((r) => r.m.x + r.m.w));
  const rows = Math.max(...rooms.map((r) => r.m.y + r.m.h));
  const top = (y: number) => PAD + GAP + y * (CH + GAP);
  const W = cols * CW + PAD * 2;
  const H = top(rows) - GAP + PAD;
  const doors: { x: number; y: number }[] = [];
  for (const r of rooms)
    for (const id of r.links ?? []) {
      const o = rooms.find((x) => x.id === id);
      if (!o || o.id < r.id || o.m.y !== r.m.y) continue;
      const edge = r.m.x + r.m.w === o.m.x ? o.m.x : o.m.x + o.m.w === r.m.x ? r.m.x : null;
      if (edge !== null) doors.push({ x: PAD + edge * CW, y: top(r.m.y) + CH * 0.62 });
    }
  return (
    <svg className="plan" viewBox={`0 0 ${W} ${H}`} role="img">
      {[...new Set(rooms.map((r) => r.m.y))].map((y) => (
        <text key={y} x={PAD} y={top(y) - 7} className="plan-floor">
          {t(`ui.floor.${y}`)}
        </text>
      ))}
      {rooms.map((r) => {
        const move = moves.find((a) => a.payload?.to === r.id);
        const people = Object.keys(state.where).filter((id) => state.where[id] === r.id);
        const x = PAD + r.m.x * CW;
        const y = top(r.m.y);
        const w = r.m.w * CW;
        const perCol = 3;
        const stairs = (r.links ?? []).some((id) => rooms.find((o) => o.id === id)?.m.y !== r.m.y);
        const spot = r.id === here && bs(state).shift && ["cafe.hall", "cafe.kitchen", "cafe.bar"].includes(r.id);
        return (
          <g key={r.id} className={`plan-room${r.id === here ? " here" : ""}${move ? " reachable" : ""}`} onClick={() => move && onAct(move)}>
            <title>{spot ? t(`ui.spot.${r.id}`) : t(r.nameKey)}</title>
            <rect x={x} y={y} width={w} height={CH} />
            <text x={x + 6} y={y + 15} className="plan-name">
              {t(r.nameKey)}
            </text>
            {stairs && (
              <path className="plan-stairs" d={`M${x + w - 24} ${y + 8}h16M${x + w - 24} ${y + 12}h16M${x + w - 24} ${y + 16}h16M${x + w - 24} ${y + 20}h16`} />
            )}
            {people.slice(0, perCol * r.m.w * 1).map((id, i) => {
              const cx = x + 6 + Math.floor(i / perCol) * CW;
              const cy = y + 24 + (i % perCol) * 21;
              const kind = id === WIFE ? "wife" : id === HUSBAND ? "husband" : "patron";
              const name = who(id, state, t, lang);
              return (
                <g key={id} className={`plan-chip ${kind}`}>
                  <rect x={cx} y={cy} width={CW - 12} height={18} rx={4} />
                  <text x={cx + 6} y={cy + 13.5}>
                    {name.length > 12 ? name.slice(0, 11) + "…" : name}
                  </text>
                </g>
              );
            })}
            {people.length > perCol * r.m.w && (
              <text x={x + w - 8} y={y + CH - 6} textAnchor="end" className="plan-more">
                +{people.length - perCol * r.m.w}
              </text>
            )}
          </g>
        );
      })}
      {doors.map((d, i) => (
        <line key={i} className="plan-door" x1={d.x} y1={d.y - 13} x2={d.x} y2={d.y + 13} />
      ))}
    </svg>
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

function reasonLabel(r: string, t: Common["t"]) {
  // an event name ("shift:tick") or "action": where the inspector saw the number move
  for (const k of [`reason.${r}`, `source.${r.replace(/[:-]/g, "_")}`, `act.${r}`, `day.${r}`]) {
    const s = t(k);
    if (s !== k) return s;
  }
  // a small thing at a table: named by its id, it has no short name of its own
  if (t(`log.moment.${r}`) !== `log.moment.${r}`) return `${t("source.moment")} (${r})`;
  return r;
}

export function HeroineTab({ state, t, open, lang }: Common) {
  const h = bs(state).heroine;
  const tones = { energy: "green", mood: "green", arousal: "pink", drunk: "amber" };
  const wants = wantsOf(state);
  const top = (Object.entries(wants) as [string, number][]).sort((a, c) => c[1] - a[1])[0]!;
  const topWant = top[1] >= content.mind.wants.hintFrom && (open || top[0] === "rest" || top[0] === "attention") ? top[0] : null;
  const b = bs(state);
  const days = (b.diary ?? []).filter((d) => state.time.day - d.day <= 2).sort((x, y) => y.day - x.day);
  const who = (id: string) => (id === HUSBAND ? t("ui.memory.you") : b.patrons[id] ? patronName(b.patrons[id]!.name, lang) : t("ui.memory.someone"));
  return (
    <div>
      <div className="cap">{t("ui.state")}</div>
      {(["energy", "mood", "arousal", "drunk"] as const)
        .filter((k) => open || k !== "arousal")
        .map((k) => (
          <div key={k}>
            <Bar label={t(`stat.${k}`)} value={h[k]} tone={tones[k]} />
            {open && (h.why?.[k]?.length ?? 0) > 0 && (
              <div className="why-line">
                {h.why![k]!.slice().reverse().map((w, i) => (
                  <span key={i} className={w.a < 0 ? "neg" : "pos"}>
                    {fmt(w.a)} {reasonLabel(w.r, t)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      {open && <Bar label={t("stat.satisfied")} value={h.satisfied} />}
      {open && <Bar label={t("ui.annoy.guests")} value={annoyanceOf(state, "guests")} tone="amber" />}
      {open && <Bar label={t("ui.annoy.him")} value={annoyanceOf(state, "him")} tone="amber" />}
      <div className="small">
        {t("ui.outside")}: <b>{t(`face.${faceOf(state)}`)}</b>
        {topWant && <span className="muted"> · {t("ui.wants.hint", { what: t(`want.${topWant}`) })}</span>}
      </div>
      {!open && annoyanceOf(state) >= content.manners.talk.annoy.tired && <div className="small bad">{t("ui.annoyed.seems")}</div>}
      {!open && <div className="muted small">{t("ui.hidden.hint")}</div>}
      {open && (
        <>
          {(["vagina", "anus", "mouth"] as const).some((z) => soreOf(state, z) >= 5) && <div className="cap gap">{t("ui.sore")}</div>}
          {(["vagina", "anus", "mouth"] as const)
            .filter((z) => soreOf(state, z) >= 5)
            .map((z) => (
              <Bar key={z} label={t(`zone.${z}`) + (z !== "mouth" && slick(state, z) ? ` (${t("ui.slick")})` : "")} value={soreOf(state, z)} tone="amber" />
            ))}
          <div className="cap gap">{t("ui.feelings")}</div>
          {feelingsOf(state).length === 0 && <div className="muted small">{t("ui.feelings.none")}</div>}
          {feelingsOf(state).map(([e, v]) => (
            <Bar key={e} label={t(`emotion.${e}`)} value={v} tone={e === "tenderness" || e === "delight" || e === "pride" ? "green" : "amber"} />
          ))}
          <Bar label={t("ui.trust")} value={trustOf(state)} />
          <div className="cap gap">{t("ui.wants")}</div>
          {(Object.entries(wants) as [string, number][]).map(([k, v]) => (
            <Bar key={k} label={t(`want.${k}`)} value={v} tone="pink" />
          ))}
          <Bar label={t("ui.latitude")} value={latitudeOf(state)} />
        </>
      )}
      {open && (
        <>
          <div className="cap gap">{t("ui.character")}</div>
          {(Object.keys(h.traits) as (keyof typeof h.traits)[]).map((k) => {
            const d = h.snap ? h.traits[k] - (h.snap.traits[k] ?? h.traits[k]) : 0;
            return <Bar key={k} label={t(`trait.${k}`) + (Math.abs(d) >= 1 ? ` (${fmt(d)} ${t("ui.drift")})` : "")} value={h.traits[k]} />;
          })}
          <div className="cap gap">{t("ui.attrs")}</div>
          {ATTRS.map((a) => (
            <Bar key={a} label={t(`attr.${a}`)} value={attrOf(state, a)} />
          ))}
          <Bar label={t("stat.sizeTaste")} value={h.sizeTaste} />
        </>
      )}
      {open && h.frustration > 0 && <Bar label={t("stat.frustration")} value={h.frustration} />}
      {open && bs(state).gossip > 0 && <Bar label={t("ui.gossip")} value={bs(state).gossip} />}
      <div className="cap gap">{t("ui.directive")}</div>
      <div>
        {t("ui.outfit")}: <b>{t(`outfit.${h.outfit}`)}{h.bare && h.bare !== "none" ? `, ${t(`dress.${h.bare === "all" ? "naked" : h.bare === "top" ? "topless" : "bottomless"}`)}` : ""}</b> · {t(`directive.${bs(state).directive}`)}
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
      {wearOf(state) !== h.outfit && (!h.bare || h.bare === "none") && (
        <div className="small">
          {t("ui.wear")}: <b>{t(`outfit.${wearOf(state)}`)}</b>
        </div>
      )}
      <div className="cap gap">{t("ui.memory")}</div>
      {days.map((d) => {
        const lines = Object.entries(d.with).filter(([id]) => open || id === HUSBAND || d.seen[id]);
        const label = d.day === state.time.day ? t("ui.memory.today") : d.day === state.time.day - 1 ? t("ui.memory.yesterday") : t("ui.memory.ago", { n: state.time.day - d.day });
        return (
          <div key={d.day} className="small">
            <span className="muted">{label}: </span>
            {lines.length === 0
              ? t("ui.memory.none")
              : lines.map(([id, acts]) => `${who(id)} - ${Object.entries(acts).map(([a, n]) => t(`act.${a}`) + (n > 1 ? ` x${n}` : "")).join(", ")}`).join("; ")}
          </div>
        );
      })}
      {days.length === 0 && <div className="muted small">{t("ui.memory.none")}</div>}
      {open && b.tally && <div className="muted small">{t("ui.tally", { n: Object.values(b.tally.partners).reduce((s, n) => s + n, 0), men: Object.keys(b.tally.partners).length, came: b.tally.came })}</div>}
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
export function CoupleTab({ state, t, lang, open }: Common) {
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
      {(b.wishes?.length ?? 0) > 0 && (
        <div className="small">
          <span className="muted">{t("ui.wishes")}: </span>
          {b.wishes!.map((w) => t(`told.wish.${w}`)).join(" ")}
        </div>
      )}
      {(b.promises?.length ?? 0) > 0 && (
        <div className="small">
          <span className="muted">{t("ui.promises")}: </span>
          {b.promises!.map((p) => `${t(`promise.${p.kind}`)} (${t("ui.day", { day: p.due })})`).join(", ")}
        </div>
      )}
      {open && <Bar label={t("ui.trust")} value={trustOf(state)} />}
      <div className="cap">{t("ui.him")}</div>
      <Bar label={t("stat.energy")} value={himOf(state).energy} />
      <Bar label={t("stat.mood")} value={himOf(state).mood} tone="amber" />
      <Bar label={t("stat.arousal")} value={himOf(state).arousal} tone="pink" />
      {himOf(state).energy < content.day.rhythm.him.tiredBelow && <div className="small bad">{t("ui.him.tired")}</div>}
      {worryOf(state) > 0 && <div className="muted small">{t(`ui.worry.${worryOf(state)}`)}</div>}
      {b.husband.stretch > 0 && <Bar label={t("ui.his.stretch")} value={b.husband.stretch} />}
      {b.denied > 1 && <div className="muted small">{t("ui.denied", { n: b.denied })}</div>}
      {b.secretKnows && <div className="small bad">{t("ui.secret_knows")}</div>}
      <Expectations state={state} t={t} lang={lang} />
      {b.memories.some((m) => m.seen || open) && (
        <>
          <div className="cap gap">{t("ui.memories")}</div>
          <ul className="patrons">
            {[...b.memories]
              .reverse()
              .filter((m) => m.seen || open)
              .slice(0, 12)
              .map((m) => (
                <li key={m.id} className={`small${m.seen ? "" : " muted"}`}>
                  <span className="muted">{t("ui.day", { day: m.day })}</span> {t(m.key, renderParams(m.params, t, lang))}
                </li>
              ))}
          </ul>
        </>
      )}
      <div className="cap gap">{t("ui.things")}</div>
      <div className="muted small">
        {t("ui.things.outfits")}: {b.owned.map((id) => t(`outfit.${id}`)).join(", ")}
      </div>
      {b.upgrades.length > 0 && (
        <div className="muted small">
          {t("ui.things.cafe")}: {b.upgrades.map((id) => t(`upgrade.${id}`)).join(", ")}
        </div>
      )}
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
        <b>{patronName(p.name, lang)}</b> <span className={p.lender ? "bad" : "muted"}>{p.lender ? t("ui.lender") : t(`patron.type.${p.type}`)}</span>
        {p.regular && <span className="star">★</span>}
      </div>
      <div className="muted small">
        {t("ui.patron.line", { age: p.age, build: t(`patron.build.${p.build}`), approach: t(`patron.approach.${p.approach}`) })}
      </div>
      <div className="muted small">
        {t("ui.patron.memory", { visits: p.memory.visits, interest: Math.round(p.memory.interest), affinity: Math.round(p.memory.affinity) })}
        {" · "}
        {far ? t("ui.patron.ladder", { act: t(`act.${far.id}`) }) : t("ui.patron.nothing")}
        {p.memory.sizeKnown && ` · ${t("ui.patron.size", { size: p.size })} (${t(`size.${sizeClass(p.size)}`)})`}
        {p.memory.orgasms > 0 && ` · ${t("ui.patron.came", { n: p.memory.orgasms })}`}
      </div>
    </li>
  );
}

export function GuestsTab({ state, t, lang, open }: Common) {
  const b = bs(state);
  const present = b.shift?.visits ?? [];
  const regulars = Object.values(b.patrons)
    .filter((p) => p.regular && !present.some((v) => v.patron === p.id))
    .sort((a, c) => c.memory.interest - a.memory.interest);
  return (
    <div>
      {Object.keys(b.lodgers).length > 0 && (
        <>
          <div className="cap">{t("ui.zone.hotel")}</div>
          <ul className="patrons">
            {Object.entries(b.lodgers).map(([room, l]) => (
              <li key={room} className="muted small">
                {t(`loc.${room}`)}: <b>{b.patrons[l.patron] ? patronName(b.patrons[l.patron]!.name, lang) : "?"}</b>, {t("ui.nights", { n: l.nights })}
              </li>
            ))}
          </ul>
        </>
      )}
      {b.encounter && (open || husbandSees(state, b.encounter.loc)) && ((b.encounter.crowd?.length ?? 0) > 0 || (b.encounter.men?.length ?? 0) > 0) && (
        <div className="small bad">
          {[
            (b.encounter.men?.length ?? 0) > 0 ? t("ui.men", { names: b.encounter.men!.map((m) => (b.patrons[m.patron] ? patronName(b.patrons[m.patron]!.name, lang) : "?")).join(", ") }) : "",
            (b.encounter.crowd?.length ?? 0) > 0 ? t("ui.crowd", { n: b.encounter.crowd!.length }) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      {b.shift?.group && (
        <div className="small">
          {t("ui.group", { n: b.shift.group.size, heat: Math.round(b.shift.group.heat) })}
          {b.shift.group.herOut !== undefined ? ` · ${t("ui.group.her")}` : b.shift.group.wants !== undefined ? ` · ${t("ui.group.wants")}` : ""}
        </div>
      )}
      <div className="cap">{t("ui.patrons")}</div>
      <ul className="patrons">
        {present.length === 0 && <li className="muted">{t("ui.nobody")}</li>}
        {present.map((v) => (
          <div key={v.patron}>
            <PatronRow p={b.patrons[v.patron]!} t={t} lang={lang} />
            <div className="small muted" style={{ marginLeft: 8 }}>
              {b.encounter?.patron === v.patron ? t("ui.guest.withher") : v.served === 0 ? t("ui.guest.waiting") : t("ui.guest.served", { n: v.served })}
            </div>
            {(v.waited > 0 || (b.patrons[v.patron]!.memory.tier >= 3 && (b.patrons[v.patron]!.likes?.length ?? 0) > 0)) && (
              <div className={`small ${v.waited >= content.balance.shift.maxWaitMinutes * 0.6 ? "bad" : "muted"}`} style={{ marginLeft: 8 }}>
                {v.waited > 0 ? t("ui.waits", { n: v.waited }) : ""}
                {v.waited > 0 && b.patrons[v.patron]!.memory.tier >= 3 && b.patrons[v.patron]!.likes?.length ? " · " : ""}
                {b.patrons[v.patron]!.memory.tier >= 3 && b.patrons[v.patron]!.likes?.length ? `${t("ui.likes")}: ${b.patrons[v.patron]!.likes!.map((a) => t(`act.${a}`)).join(", ")}` : ""}
              </div>
            )}
            {((v.crossed ?? 0) > 0 || b.encounter?.patron === v.patron || b.deal?.patron === v.patron) && (
              <div className="small bad" style={{ marginLeft: 8 }}>
                {[
                  (v.crossed ?? 0) > 0 ? t("ui.guest.crossed", { n: v.crossed! }) : "",
                  b.encounter?.patron === v.patron && (open || husbandSees(state, b.encounter.loc)) ? t("ui.guest.with", { n: (b.shift?.tick ?? 0) - b.encounter.startTick }) : "",
                  b.deal?.patron === v.patron ? t("ui.deal") : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {((v.drunk ?? 0) >= 40 || (v.heat ?? 0) >= 40) && (
              <div className="small muted" style={{ marginLeft: 8 }}>
                {[(v.drunk ?? 0) >= 40 ? `${t("ui.guest.drunk")} ${Math.round(v.drunk ?? 0)}` : "", (v.heat ?? 0) >= 40 ? `${t("ui.guest.heat")} ${Math.round(v.heat ?? 0)}` : ""].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
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
