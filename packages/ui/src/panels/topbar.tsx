import { weekdayOf, himOf, bs, clockText, content, installment } from "@tc/base";
import { Common } from "./common";

// ---------------------------------------------------------------- top bar

export function TopBar({ state, t, onMoney }: Common & { onMoney?: () => void }) {
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
      <div className="cell clickable" onClick={onMoney} title={t("ui.money.open")}>
        <span className="cap">{t("ui.money")} ▾</span>
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
