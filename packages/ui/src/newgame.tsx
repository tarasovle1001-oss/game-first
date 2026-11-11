import { useState } from "react";
import { ATTRS, content, TASTES, TASTE_LATENT } from "@tc/base";
import type { BaseSetup } from "@tc/base";
import type { T } from "./game";

const TRAITS = ["openness", "confidence", "fidelity", "honesty", "libido"] as const;

/** New-game screen: a preset to start from, then sliders. How the story goes depends mostly on these. */
export function NewGame({ t, seed, onStart, onCancel }: { t: T; seed: number; onStart(seed: number, setup: BaseSetup): void; onCancel?(): void }) {
  const first = content.presets.find((p) => p.id === "ordinary") ?? content.presets[0]!;
  const [preset, setPreset] = useState(first.id);
  const [traits, setTraits] = useState({ ...first.traits });
  const [attrs, setAttrs] = useState<Record<(typeof ATTRS)[number], number>>({ charm: 50, wit: 50, stamina: 50, composure: 50 });
  const [sizeTaste, setSizeTaste] = useState(first.sizeTaste);
  const [latents, setLatents] = useState<string[] | null>(null); // null = leave to the preset and chance
  const [husband, setHusband] = useState({ size: content.body.husband.size, minutes: content.body.husband.minutes, style: content.body.husband.style });
  const [desire, setDesire] = useState(content.body.husband.desire);
  const [open, setOpen] = useState(false);
  const [seedText, setSeedText] = useState(String(seed));
  const [name, setName] = useState(t("ui.newgame.name.default"));
  const tastesOf = (ls: string[]) => Object.fromEntries(TASTES.map((id) => [id, ls.includes(TASTE_LATENT[id]) ? 85 : 50])) as Record<(typeof TASTES)[number], number>;
  const [tastes, setTastes] = useState(tastesOf(first.latents));
  const tasteLatents = new Set<string>(Object.values(TASTE_LATENT));

  const pick = (id: string) => {
    const p = content.presets.find((x) => x.id === id)!;
    setPreset(id);
    setTraits({ ...p.traits });
    setSizeTaste(p.sizeTaste);
    setLatents(null);
    setTastes(tastesOf(p.latents));
  };
  const slider = (label: string, value: number, set: (v: number) => void, min = 0, max = 100) => (
    <label className="slider" key={label}>
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} />
      <b>{value}</b>
    </label>
  );
  const about = content.presets.find((p) => p.id === preset);

  return (
    <div className="overlay">
      <div className="dialog">
        <h1>{t("ui.newgame.title")}</h1>
        <div className="preset-row">
          {content.presets.map((p) => (
            <button key={p.id} className={p.id === preset ? "on" : ""} onClick={() => pick(p.id)}>
              {t(`preset.${p.id}`)}
            </button>
          ))}
        </div>
        {about && <p className="muted">{t(`preset.${about.id}.about`)}</p>}

        <div className="dialog-cols">
          <div>
            <div className="cap">{t("ui.newgame.her")}</div>
            <label className="slider">
              <span>{t("ui.newgame.name")}</span>
              <input type="text" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            </label>
            {TRAITS.map((k) => slider(t(`trait.${k}`), traits[k], (v) => setTraits({ ...traits, [k]: v })))}
            {slider(t("stat.sizeTaste"), sizeTaste, setSizeTaste)}
            {slider(t("ui.newgame.desire"), desire, setDesire)}
            <div className="cap gap">{t("ui.new.attrs")}</div>
            {ATTRS.map((a) => (
              <div key={a} title={t(`attr.${a}.about`)}>
                {slider(t(`attr.${a}`), attrs[a], (v) => setAttrs({ ...attrs, [a]: v }))}
              </div>
            ))}
            <div className="cap gap">{t("ui.newgame.tastes")}</div>
            {TASTES.map((id) => (
              <div key={id} title={t(`taste.${id}.about`)}>
                {slider(t(`taste.${id}`), tastes[id], (v) => setTastes({ ...tastes, [id]: v }))}
              </div>
            ))}
            <p className="muted small">{t("ui.newgame.tastes.hint")}</p>
            <div className="cap gap">{t("ui.newgame.latents")}</div>
            <label className="check">
              <input type="checkbox" checked={latents === null} onChange={(e) => setLatents(e.target.checked ? null : (about?.latents ?? []))} />
              {t("ui.newgame.latents.random")}
            </label>
            {latents !== null &&
              content.latents.filter((l) => !tasteLatents.has(l.id)).map((l) => (
                <label className="check" key={l.id} title={t(`latent.${l.id}.about`)}>
                  <input
                    type="checkbox"
                    checked={latents.includes(l.id)}
                    onChange={(e) => setLatents(e.target.checked ? [...latents, l.id] : latents.filter((x) => x !== l.id))}
                  />
                  <span>
                    {t(`latent.${l.id}`)}
                    <span className="muted small"> - {t(`latent.${l.id}.about`)}</span>
                  </span>
                </label>
              ))}
          </div>
          <div>
            <div className="cap">{t("ui.newgame.him")}</div>
            {slider(t("ui.newgame.size"), husband.size, (v) => setHusband({ ...husband, size: v }), 6, 26)}
            {slider(t("ui.newgame.minutes"), husband.minutes, (v) => setHusband({ ...husband, minutes: v }), 1, 40)}
            <div className="cap gap">{t("ui.newgame.style")}</div>
            <div className="preset-row">
              {(["naive", "jealous", "encouraging"] as const).map((s) => (
                <button key={s} className={husband.style === s ? "on" : ""} onClick={() => setHusband({ ...husband, style: s })}>
                  {t(`husband.style.${s}`)}
                </button>
              ))}
            </div>
            <div className="cap gap">{t("ui.newgame.mode.title")}</div>
            <div className="switch2">
              <button className={open ? "" : "on"} onClick={() => setOpen(false)}>
                <b>NTR</b>
                <span>{t("ui.newgame.mode.ntr")}</span>
              </button>
              <button className={open ? "on" : ""} onClick={() => setOpen(true)}>
                <b>NTS</b>
                <span>{t("ui.newgame.mode.nts")}</span>
              </button>
            </div>
            <label className="slider gap">
              <span>{t("ui.newgame.seed")}</span>
              <input type="number" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="dialog-actions">
          {onCancel && <button onClick={onCancel}>{t("ui.newgame.cancel")}</button>}
          <button
            className="primary"
            onClick={() =>
              onStart(Number(seedText) || seed, {
                preset,
                traits,
                sizeTaste,
                desire,
                husband,
                name,
                tastes,
                attrs,
                ...(latents === null ? {} : { latents }),
                ...(open ? { mode: "open" as const } : {}),
              })
            }
          >
            {t("ui.newgame.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
