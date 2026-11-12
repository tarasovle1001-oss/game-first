import { useState } from "react";
import { CONSENT_FORMULA, verdictOf, describeScene, bs, clockText, content, fitOf, HUSBAND, patronName, pleasureFor, WIFE, husbandSees, sizeClass, pictureFrames, actById, actOf } from "@tc/base";
import type { ConsentInput, ProposalRecord } from "@tc/base";
import type { SceneDesc } from "@tc/core";
import { renderSchematic } from "@tc/schematics";
import { engine } from "../game";
import { layoutFor } from "../pack";
import type { Shot } from "../pack";
import { Bar, Common } from "./common";

// ---------------------------------------------------------------- scene

/** Men standing around and looking on: drawn at the edges of whatever the picture is. */
export const WATCHERS = [
  { role: "watcher", pose: "stand" as const, x: -106, flip: false },
  { role: "watcher", pose: "stand" as const, x: 106, flip: true },
];

/** A pack picture: alone, or her portrait with up to three close-ups beside it. A click on a close-up brings it to the middle. */
export function Photo({ main, inserts, alt, veiled, children }: { main: Shot; inserts: Shot[]; alt: string; veiled?: boolean; children?: React.ReactNode }) {
  const [front, setFront] = useState<string | null>(null);
  const shots = [main, ...inserts];
  const big = shots.find((x) => x.key === front) ?? main;
  const side = shots.filter((x) => x !== big);
  return (
    <div className={`picture photo${veiled ? " veiled" : ""}`}>
      <div className={`frames n${side.length}`}>
        <img className="main" src={big.url} alt={alt} />
        {side.length > 0 && (
          <div className="inserts">
            {side.map((x) => (
              <img key={x.key} src={x.url} alt="" onClick={() => setFront(x === main ? null : x.key)} />
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function ScenePanel({ state, t, lang, scene, open, watch }: Common & { scene: SceneDesc | null; watch?: boolean }) {
  const clear = !!open || !!watch; // the picture is not blurred; numbers still need `open`
  const pick = state.time.day * 7 + state.turn;
  const picture = scene ? layoutFor(pictureFrames(state, scene), pick) : null;
  const b = bs(state);
  const layout = scene ? (content.scenes.find((s) => s.id === scene.type) ?? content.scenes.find((s) => s.id === "idle")!) : null;
  const wifeHere = state.where[WIFE] === state.where[HUSBAND];
  // She is somewhere he cannot see: the panel still shows her. Clear in transparent mode, behind a blur otherwise.
  const wifeShown = !!scene?.participants.some((p) => p.id === WIFE);
  const enc = b.encounter;
  const away: SceneDesc | null =
    scene && !wifeShown && state.time.phase !== "summary"
      ? enc
        ? { type: actById(enc.act).scene, location: enc.loc, participants: [{ id: WIFE, role: "wife" }, { id: enc.patron, role: "patron" }], tags: {} }
        : { type: "idle", location: state.where[WIFE] ?? "", participants: [{ id: WIFE, role: "wife" }], tags: {} }
      : null;
  const awayLayout = away ? content.scenes.find((x) => x.id === away.type) : null;
  const awayPicture = away ? layoutFor(pictureFrames(state, away), pick) : null;
  const awaySvg = away
    ? renderSchematic(away.type === "idle" || !awayLayout ? [{ role: "wife", pose: "stand" as const, x: 0 }] : awayLayout.figures, {
        title: clear ? t(`scene.${awayLayout?.id ?? "idle"}`) : t("ui.scene.unseen"),
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
          <Photo main={awayPicture.main} inserts={awayPicture.inserts} alt="" veiled={!clear} />
        ) : (
          <div className={`picture${clear ? "" : " veiled"}`} dangerouslySetInnerHTML={{ __html: awaySvg }} />
        )
      ) : picture && scene && layout ? (
        <Photo main={picture.main} inserts={picture.inserts} alt={t(`scene.${layout.id}`)}>
          <div className="photo-cap">
            <b>{t(`scene.${layout.id}`)}</b> · {t(`loc.${scene.location}`)}
            {open && (picture.split || !picture.main.exact) && <span className="muted"> · {[picture.main, ...picture.inserts].map((x) => x.key).join(" + ")}</span>}
          </div>
        </Photo>
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
export function SizeLine({ state, t, open }: Common) {
  const b = bs(state);
  const sex = b.night?.sex;
  const enc = b.encounter;
  const seen = enc ? husbandSees(state, enc.loc) || !!open : false;
  const p = enc ? b.patrons[enc.patron] : undefined;
  const actId = sex?.act ?? (enc && enc.hisRate > 0 && seen && p ? enc.act : undefined);
  const act = actId ? actOf(actId) : undefined;
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

export function fmt(v: number) {
  return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toString();
}

/** One line "who, what, verdict" + the three biggest reasons; the full table opens on click. */
export function WhyLine({ record, state, t, lang, open: transparent, folded }: Common & { record: ProposalRecord; folded?: boolean }) {
  // a card, not a line: every reason on its own row, biggest first, with a bar for its weight
  const [open, setOpen] = useState(!folded);
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
