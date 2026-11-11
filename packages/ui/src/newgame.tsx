import { useState } from "react";
import { content } from "@tc/base";
import type { BaseSetup } from "@tc/base";
import type { T } from "./game";

const TRAITS = ["openness", "confidence", "fidelity", "honesty", "libido"] as const;

/** New-game screen: a preset to start from, then sliders. How the story goes depends mostly on these. */
export function NewGame({ t, seed, onStart, onCancel }: { t: T; seed: number; onStart(seed: number, setup: BaseSetup): void; onCancel?(): void }) {
  const first = content.presets.find((p) => p.id === "ordinary") ?? content.presets[0]!;
  const [preset, setPreset] = useState(first.id);
  const [traits, setTraits] = useState({ ...first.traits });
  const [sizeTaste, setSizeTaste] = useState(first.sizeTaste);
  const [latents, setLatents] = useState<string[] | null>(null); // null = leave to the preset and chance
  const [husband, setHusband] = useState({ size: content.body.husband.size, minutes: content.body.husband.minutes, style: content.body.husband.style });
  const [desire, setDesire] = useState(content.body.husband.desire);
  const [open, setOpen] = useState(false);
  const [seedText, setSeedText] = useState(String(seed));

  const pick = (id: string) => {
    const p = content.presets.find((x) => x.id === id)!;
    setPreset(id);
    setTraits({ ...p.traits });
    setSizeTaste(p.sizeTaste);
    setLatents(null);
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
            {TRAITS.map((k) => slider(t(`trait.${k}`), traits[k], (v) => setTraits({ ...traits, [k]: v })))}
            {slider(t("stat.sizeTaste"), sizeTaste, setSizeTaste)}
            {slider(t("ui.newgame.desire"), desire, setDesire)}
            <div className="cap gap">{t("ui.newgame.latents")}</div>
            <label className="check">
              <input type="checkbox" checked={latents === null} onChange={(e) => setLatents(e.target.checked ? null : (about?.latents ?? []))} />
              {t("ui.newgame.latents.random")}
            </label>
            {latents !== null &&
              content.latents.map((l) => (
                <label className="check" key={l.id}>
                  <input
                    type="checkbox"
                    checked={latents.includes(l.id)}
                    onChange={(e) => setLatents(e.target.checked ? [...latents, l.id] : latents.filter((x) => x !== l.id))}
                  />
                  {t(`latent.${l.id}`)}
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
            <label className="check gap">
              <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
              {t("ui.newgame.mode")}
            </label>
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
