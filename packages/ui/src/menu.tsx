// The right-hand column: everything he can do, as one menu with breadcrumbs.
// Root = what the phase offers; "her" = talk, touch, ask, by section; a group = one kind of action with many targets.
// Items are cards with a hotkey, a title and (where the texts have one) a line of explanation.
import { useEffect, useState } from "react";
import { DEAL, WISH, ALLOW, PERMIT, STANCE, DARE, ABOUT, PROMISE, PRESS, ANSWER, BED, TALK, TELL, bs, content, WAIT, PREP_WAIT, NIGHT_WAIT, STRIP, WIFE, HUSBAND, renderLog } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE } from "@tc/core";
import type { Action, GameState } from "@tc/core";
import { engine } from "./game";
import type { Lang, T } from "./game";
import { actionLabel } from "./panels";

type Path = { at: "root" } | { at: "her"; sec: string | null } | { at: "group"; type: string };

const SECTION: Record<string, string> = {
  "base/night-act": "sex", "base/upstairs": "sex", "base/night-self": "sex", "base/night-decline": "sex",
  [STRIP]: "ask", "base/ask-outfit": "ask", "base/outfit-back": "ask",
  [TELL]: "allow", [ALLOW]: "allow", "base/directive": "want", "base/order": "want", [WISH]: "want", [DARE]: "dare",
  [ABOUT]: "about", [STANCE]: "about", [PROMISE]: "about", [PRESS]: "sex",
};
const SECTIONS = ["chat", "touch", "sex", "ask", "want", "dare", "allow", "about"] as const;
const LETTERS = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l"];
const sectionOf = (a: Action) => (a.type === TALK ? (a.payload?.group as string) : SECTION[a.type]);

/** "Clean up (60 min)" -> the title and "60m" for the right edge of the card. */
const splitDuration = (label: string): [string, string] => {
  const m = /^(.*?)\s*\((\d+)\s*(мин|min|ч|h)\.?\)\s*$/.exec(label);
  return m ? [m[1]!, `${m[2]}${m[3] === "ч" || m[3] === "h" ? "h" : "m"}`] : [label, ""];
};

const clip = (s: string, n = 64) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function Item({ hot, title, sub, right, mark, onClick, tone, disabled }: { hot?: string; title: string; sub?: string; right?: string; mark?: string; onClick?: () => void; tone?: string; disabled?: boolean }) {
  return (
    <button className={`mitem${tone ? ` ${tone}` : ""}`} disabled={disabled} onClick={onClick}>
      {hot && <kbd>{hot}</kbd>}
      <span className="mi-body">
        <span className="mi-title">
          {title}
          {mark && <span className="mi-mark"> {mark}</span>}
        </span>
        {sub && <span className="mi-sub">{sub}</span>}
      </span>
      {right && <span className="mi-right">{right}</span>}
    </button>
  );
}

export function ActionMenu({ state, t, lang, act }: { state: GameState; t: T; lang: Lang; act(a: Action): void }) {
  const [path, setPath] = useState<Path>({ at: "root" });
  const b = bs(state);
  const phase = state.time.phase;
  const all = engine.listActions(state);
  const isWait = (a: Action) => a.type === WAIT || a.type === PREP_WAIT || a.type === NIGHT_WAIT;
  const waits = all.filter(isWait);
  const advance = all.find((a) => a.type === CORE_ADVANCE);
  const bed = all.filter((a) => a.type === BED);
  const answers = all.filter((a) => a.type === ANSWER || a.type === PERMIT || a.type === DEAL);
  const withHer = all.filter((a) => sectionOf(a) !== undefined);
  const herSecs = SECTIONS.filter((g) => withHer.some((a) => sectionOf(a) === g));
  const herName = b.heroine.name ?? t("role.wife");
  const herNear = state.where[WIFE] === state.where[HUSBAND];
  const other = all.filter((a) => !isWait(a) && a.type !== CORE_ADVANCE && a.type !== CORE_MOVE && a.type !== BED && a.type !== ANSWER && a.type !== PERMIT && a.type !== DEAL && sectionOf(a) === undefined);
  const groups = [...other.reduce((map, a) => map.set(a.type, [...(map.get(a.type) ?? []), a]), new Map<string, Action[]>())];
  const direct = groups.filter(([, list]) => list.length < 3).flatMap(([, list]) => list);
  const folders = groups.filter(([, list]) => list.length >= 3);

  // where the menu really is: a section or a group that has just emptied falls back a level
  const here: Path =
    path.at === "her" ? (withHer.length === 0 ? { at: "root" } : path.sec && !herSecs.includes(path.sec as never) ? { at: "her", sec: null } : path) : path.at === "group" ? (folders.some(([type]) => type === path.type) ? path : { at: "root" }) : path;
  const back = () => setPath(here.at === "her" && here.sec ? { at: "her", sec: null } : { at: "root" });

  const label = (a: Action) => actionLabel(a, t, lang);
  // an explanation under the title, where the texts have one for this very action
  const hintOf = (a: Action): string | undefined => {
    const d = engine.actionDef(a.type)!.describe?.(a);
    const key = `${d?.key ?? engine.actionDef(a.type)!.labelKey}.hint`;
    const s = t(key);
    return s === key ? undefined : s;
  };
  const markOf = (a: Action): string | undefined => (a.type === WISH && b.wishes?.includes(a.payload?.id as string) ? t("ui.said.today") : undefined);

  // what the digits mean right now, top to bottom on the screen
  const sceneActs = bed.filter((a) => !a.payload?.to);
  const sceneSwitch = bed.filter((a) => a.payload?.to);
  const listed: Action[] =
    answers.length > 0
      ? answers
      : bed.length > 0
        ? [...sceneActs, ...sceneSwitch]
        : here.at === "her" && here.sec
          ? withHer.filter((a) => sectionOf(a) === here.sec && a.type !== TELL && a.type !== ALLOW)
          : here.at === "group"
            ? (folders.find(([type]) => type === here.type)?.[1] ?? [])
            : [];
  const digitsFree = answers.length === 0 && bed.length === 0 && here.at === "root";
  // root cards that take a letter: her, then the plain actions, then the folders
  const rootCards: (() => void)[] = [];
  if (withHer.length > 0) rootCards.push(() => setPath({ at: "her", sec: null }));
  for (const a of direct) rootCards.push(() => act(a));
  for (const [type] of folders) rootCards.push(() => setPath({ at: "group", type }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      const letter = LETTERS.indexOf(e.key.toLowerCase());
      if (e.key === "Escape" && here.at !== "root" && answers.length === 0 && bed.length === 0) back();
      else if (e.key === "Enter" && advance && answers.length === 0) act(advance);
      else if (n >= 1 && n <= 9) {
        if (digitsFree) {
          if (n <= waits.length) act(waits[n - 1]!);
        } else if (here.at === "her" && !here.sec && answers.length === 0 && bed.length === 0) {
          if (n <= herSecs.length) setPath({ at: "her", sec: herSecs[n - 1]! });
        } else if (n <= listed.length) act(listed[n - 1]!);
      } else if (letter >= 0 && digitsFree && letter < rootCards.length) rootCards[letter]!();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const num = (i: number) => (i < 9 ? String(i + 1) : undefined);
  const item = (a: Action, i: number, tone?: string) => {
    const [title, dur] = splitDuration(label(a));
    return <Item key={i} hot={num(i)} title={title} sub={hintOf(a)} right={dur} mark={markOf(a)} tone={tone} onClick={() => act(a)} />;
  };
  const crumbs = (...parts: string[]) => (
    <div className="crumbs2">
      <button className="crumb" onClick={() => setPath({ at: "root" })}>
        {t(`base.phase.${phase}`)}
      </button>
      {parts.map((p, i) => (
        <span key={i}>
          <span className="sep">›</span>
          {i === parts.length - 1 ? <b>{p}</b> : <button className="crumb" onClick={back}>{p}</button>}
        </span>
      ))}
    </div>
  );
  const tail = (deep: boolean) => (
    <>
      <Item title={t("ui.menu.back")} hot="Esc" tone="quiet" onClick={back} />
      {deep && <Item title={t("ui.menu.never")} tone="quiet" onClick={() => setPath({ at: "root" })} />}
    </>
  );

  // --- she, a guest or the room wants an answer: nothing else until he gives one
  if (answers.length > 0) {
    const lines = state.log.filter((e) => e.turn === state.turn && !e.tags?.includes("unseen")).slice(-2);
    return (
      <div className="menu2">
        <div className="m-title warn">{t("ui.situation")}</div>
        <div className="m-context">{lines.length > 0 ? lines.map((e, i) => <p key={i}>{renderLog(e, t, lang)}</p>) : t("ui.her.came")}</div>
        {answers.map((a, i) => (
          <Item key={i} hot={num(i)} title={t(`action.answer.${a.payload!.kind}.${a.payload!.say}`)} onClick={() => act(a)} />
        ))}
      </div>
    );
  }

  // --- in bed: the column is the scene
  if (bed.length > 0) {
    const sex = b.night?.sex;
    return (
      <div className="menu2">
        <div className="m-title pink">{herName}</div>
        {sex && (
          <div className="m-context">
            {t(`act.${sex.act}`)} · {sex.turns * content.body.bed.minutesPerTurn} {t("ui.min")}
            {sex.asks && <div className="bad small">{sex.asks === "finish" ? t("ui.bed.asks.finish") : t("ui.bed.asks", { act: t(`act.${sex.asks}`) })}</div>}
          </div>
        )}
        {sceneActs.map((a, i) => item(a, i, a.payload?.do === "finish" ? "strong" : undefined))}
        {sceneSwitch.length > 0 && <div className="m-section">{t("ui.bed.switch")}</div>}
        {sceneSwitch.map((a, i) => (
          <Item key={`s${i}`} hot={num(sceneActs.length + i)} title={t(`act.${a.payload!.to}`)} onClick={() => act(a)} />
        ))}
      </div>
    );
  }

  // --- her: sections, then one section
  if (here.at === "her") {
    if (!here.sec)
      return (
        <div className="menu2">
          {crumbs(herName)}
          <div className="m-context">{t(herNear ? "ui.ctx.near" : "ui.ctx.far", { name: herName, where: t(`loc.${state.where[HUSBAND]}`) })}</div>
          {herSecs.map((g, i) => (
            <Item key={g} hot={num(i)} title={t(`ui.her.sec.${g}`)} sub={t(`ui.her.sec.${g}.hint`)} onClick={() => setPath({ at: "her", sec: g })} />
          ))}
          {tail(false)}
        </div>
      );
    const sec = here.sec;
    return (
      <div className="menu2">
        {crumbs(herName, t(`ui.her.sec.${sec}`))}
        <div className="m-context">{t(`ui.her.sec.${sec}.hint`)}</div>
        {sec === "allow" && (
          <div className="stack sub">
            {content.terms.items.map((it) => {
              const now = b.perm?.[it.id];
              return (
                <div key={it.id} className="tell-row">
                  <span>
                    {t(`item.${it.id}`)}
                    {now && <span className="mi-mark"> {t(now === "allow" ? "ui.said.allow" : "ui.said.forbid")}</span>}
                  </span>
                  <button className={now === "allow" ? "on" : ""} disabled={now === "allow"} onClick={() => act({ type: ALLOW, payload: { item: it.id, say: "allow" } })}>
                    {t("ui.tell.allow")}
                  </button>
                  <button className={`deny${now === "forbid" ? " on" : ""}`} disabled={now === "forbid"} onClick={() => act({ type: ALLOW, payload: { item: it.id, say: "forbid" } })}>
                    {t("ui.tell.forbid")}
                  </button>
                </div>
              );
            })}
            <div className="muted small">{t("ui.allow.groups")}</div>
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
        {listed.map((a, i) => item(a, i))}
        {tail(true)}
      </div>
    );
  }

  // --- one kind of action with many targets
  if (here.at === "group") {
    const title = t(engine.actionDef(here.type)!.labelKey);
    return (
      <div className="menu2">
        {crumbs(title)}
        {listed.map((a, i) => item(a, i))}
        {tail(false)}
      </div>
    );
  }

  // --- root: what this phase offers
  let letter = 0;
  const hot = () => (letter < LETTERS.length ? LETTERS[letter++]!.toUpperCase() : undefined);
  return (
    <div className="menu2">
      <div className="m-title">{t(`base.phase.${phase}`)}</div>
      <div className="muted small m-hint">
        {phase === "prep" && b.day?.busy ? t("ui.busy", { what: t(`day.${b.day.busy.id}`), minutes: b.day.busy.left }) : phase === "shift" && waits.length === 0 && advance ? t("ui.closing") : t(`ui.act.hint.${phase}`)}
      </div>
      {waits.length > 0 && (
        <div className="mwait">
          <div className="mi-title">{t("ui.wait")}</div>
          <div className="mi-sub">{t("ui.wait.hint")}</div>
          <div className="mwait-row">
            {waits.map((a, i) => (
              <button key={i} className={a.payload?.until ? "wide" : ""} onClick={() => act(a)}>
                <kbd>{i + 1}</kbd>
                {label(a)}
              </button>
            ))}
          </div>
        </div>
      )}
      {withHer.length > 0 ? (
        <Item hot={hot()} tone="her" title={herName} sub={t(herNear ? "ui.her.card.near" : "ui.her.card.far")} onClick={() => setPath({ at: "her", sec: null })} />
      ) : (
        phase !== "summary" && !herNear && <Item tone="her" disabled title={herName} sub={t("ui.her.far", { name: herName, where: t(`loc.${state.where[WIFE]}`) })} />
      )}
      {(direct.length > 0 || folders.length > 0) && <div className="m-section">{t(`ui.todo.${phase}`)}</div>}
      {direct.map((a, i) => {
        const [title, dur] = splitDuration(label(a));
        return <Item key={`d${i}`} hot={hot()} title={title} sub={hintOf(a)} right={dur} onClick={() => act(a)} />;
      })}
      {folders.map(([type, list]) => (
        <Item key={type} hot={hot()} title={t(engine.actionDef(type)!.labelKey)} sub={clip(list.map((a) => splitDuration(label(a))[0]).join(" · "))} right={`${list.length} ›`} onClick={() => setPath({ at: "group", type })} />
      ))}
      {advance && (
        <button className="primary madvance" onClick={() => act(advance)}>
          <kbd>↵</kbd> {phase === "night" ? t("action.sleep.default", { hour: content.day.rhythm.wake[0]! }) : label(advance)}
        </button>
      )}
    </div>
  );
}
