import { useState } from "react";
import { charmOf, annoyedLevel, soreOf, wearOf, slick, ATTRS, attrOf, faceOf, feelingsOf, latitudeOf, trustOf, wantsOf, annoyanceOf, bs, content, HUSBAND, patronName, WIFE, husbandSees } from "@tc/base";
import { Bar, Common, reasonLabel, who } from "./common";
import { fmt } from "./scene";
import { richLine } from "./log";

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
