import { fameOf, fameTier, trustOf, himOf, worryOf, bs, clockText, content, expectLevel, fitOf, HUSBAND, patronName, renderParams, WIFE, husbandSees, sizeClass, actOf } from "@tc/base";
import type { Patron } from "@tc/base";
import type { Lang, T } from "../game";
import { Bar, Common } from "./common";
import { WhyLine } from "./scene";

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

/** What he has told or shown her, and what she has made of it. */
export function Expectations({ state, t, lang }: Common) {
  const b = bs(state);
  const known = Object.entries(b.expect)
    .filter(([, v]) => Math.abs(v) >= 15)
    .map(([id, v]) => ({ id, v, ...expectLevel(v), tier: actOf(id)?.tier ?? 0 }))
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

export function PatronRow({ p, t, lang }: { p: Patron; t: T; lang: Lang }) {
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
        <WhyLine key={`${p.day}-${p.tick}-${p.patron}-${i}`} record={p} state={state} t={t} lang={lang} open={debug} folded />
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
