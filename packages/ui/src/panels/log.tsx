import { useState } from "react";
import { clockText, content, patronName } from "@tc/base";
import type { Lang, T } from "../game";
import { Common } from "./common";

// ---------------------------------------------------------------- log

export const LEWD = new Set(content.acts.filter((a) => a.tier >= 2).map((a) => a.id));
/** What a log line is about, for its colour: money, something lewd, or plain business. */
export function kindOf(key: string, params: Record<string, unknown> | undefined): "money" | "lewd" | "system" {
  const act = /^log\.act\.([a-z_]+)\./.exec(key)?.[1];
  if (act) return LEWD.has(act) ? "lewd" : "system";
  if (/^log\.(enc|bed|came|husband|night|bare|towels|caught|leave|annoyed|approach\.tease|answer\.tease|her\.(starts|compare|stretch|his)|gym\.(met|late|locker))/.test(key)) return "lewd";
  if (/tip|income|rent|loan|buy|supplies|sold|paid|money|salary|market|side_job/.test(key) || ["tip", "money", "income"].some((k) => typeof params?.[k] === "number" && (params[k] as number) > 0)) return "money";
  return "system";
}
export const MONEY_KEYS = new Set(["tip", "money", "cost", "offer", "price", "income", "rent", "amount"]);
/** A log line with its names, acts and sums picked out: every guest has his own colour, acts are pink, money is gold. */
/** Drunk: what she says inside the quotes trails off. The narration around it stays sober. */
export const slur = (text: string) =>
  text.replace(/"([^"]+)"/g, (_m, inner: string) => `"${inner.replace(/, /, "... ").replace(/([^.!?…])[.!]+(\s|$)/g, "$1...$2").replace(/([^.!?…])$/, "$1...")}"`);

export function richLine(e: { key: string; params?: Record<string, unknown>; tags?: string[] }, t: T, lang: Lang) {
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

export type LogFilter = "all" | "people" | "money" | "lewd";
export function Log({ state, t, lang, debug, watch }: Common & { debug: boolean; watch?: boolean }) {
  const [filter, setFilter] = useState<LogFilter>("all");
  // what happens out of his sight is not told to him, but a house is not silent: one line of noise per moment of it
  const visible: typeof state.log = [];
  for (const e of state.log) {
    const thought = e.tags?.includes("thought");
    if (debug || !e.tags?.includes("unseen") || (watch && !thought)) visible.push(e);
    else if (!thought) {
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
