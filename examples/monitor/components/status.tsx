import { memo } from "react";
import { places, type PlaceId } from "../events/model.js";
import { useSemantic } from "../semantic/provider.js";
import { value } from "../semantic/hooks.js";
import { Changed, useAnimatedOrder } from "./motion.js";
import { Icon } from "./Icon.js";
export const severityLabel = (score: number) =>
  score < 0.6
    ? "Normal"
    : score < 1.6
      ? "Elevated"
      : score < 2.6
        ? "Significant"
        : "Severe";
export const format = (v: unknown) =>
  typeof v === "number" ? v.toFixed(2) : String(v ?? "Awaiting meaning");
export function useCountryView(id: PlaceId) {
  const scope = places[id].scope;
  const situation = useSemantic(`${scope}.situation`),
    severity = useSemantic(`${scope}.severity`),
    urgency = useSemantic(`${scope}.urgency`),
    trend = useSemantic(`${scope}.trend`);
  const ready = [situation, severity, urgency, trend].every((c) => c?.ready);
  return {
    id,
    scope,
    name: places[id].name,
    situation: value(situation?.data),
    severity: Number(value(severity?.data) ?? 0),
    urgency: Number(value(urgency?.data) ?? 0),
    trend: value(trend?.data),
    ready,
    alert:
      ready &&
      Number(value(urgency?.data)) >= 0.8 &&
      Number(value(severity?.data)) >= 2,
    fingerprint: situation?.fingerprint,
  };
}
export function useSituations() {
  const jp = useCountryView("jp"),
    kr = useCountryView("kr"),
    cn = useCountryView("cn"),
    us = useCountryView("us"),
    eu = useCountryView("eu"),
    me = useCountryView("me");
  return [jp, kr, cn, us, eu, me];
}
export const GlobalStatus = memo(function GlobalStatus() {
  const attention = useSemantic("global.attention"),
    theme = useSemantic("global.theme"),
    asia = useSemantic("region:asia.attention"),
    situations = useSituations();
  const active = situations.filter(
      (s) => s.situation && s.situation !== "normal",
    ),
    alerts = situations.filter((s) => s.alert);
  return (
    <section className="global-status" aria-label="World status">
      <div className="main-status">
        <span className="kicker">MONITORED WORLD / INTERPRETATION</span>
        <h1>
          <i
            className={`status-light ${value(attention?.data) ?? "pending"}`}
          />
          <Changed value={value(attention?.data)}>
            {attention?.data
              ? `${value(attention.data)} attention`
              : "Reading the world"}
          </Changed>
          <small>{!attention?.ready ? "UPDATING" : "SETTLED"}</small>
        </h1>
        <p>
          Events update facts. Jev updates meaning. Meaning propagates
          downstream.
        </p>
      </div>
      <div className="status-measure">
        <span>DOMINANT THEME</span>
        <strong>
          <Changed value={value(theme?.data)}>
            {value(theme?.data) ?? "—"}
          </Changed>
        </strong>
        <small>Within six monitored scopes</small>
      </div>
      <div className="status-measure">
        <span>ACTIVE SITUATIONS</span>
        <strong>
          <Changed value={active.length}>
            {active.length.toString().padStart(2, "0")}
          </Changed>
          <em> / 06</em>
        </strong>
        <small>Derived from situation values</small>
      </div>
      <div className="status-measure">
        <span>ATTENTION POLICY</span>
        <strong>
          <Changed value={alerts.length}>{alerts.length}</Changed>
          <em> alerts</em>
        </strong>
        <small>Asia: {value(asia?.data) ?? "pending"}</small>
      </div>
    </section>
  );
});
export const ActiveSituations = memo(function ActiveSituations({
  selected,
  onSelect,
}: {
  selected: PlaceId;
  onSelect: (id: PlaceId) => void;
}) {
  const all = useSituations();
  const sorted = [...all].sort(
    (a, b) => b.severity - a.severity || a.id.localeCompare(b.id),
  );
  const listRef = useAnimatedOrder(sorted.map((s) => s.id).join(":"));
  return (
    <section className="situations">
      <div className="panel-heading">
        <h2>
          <Icon name="layers" size={14} /> Monitored objects
        </h2>
        <span>
          {all.filter((s) => s.situation && s.situation !== "normal").length}{" "}
          ACTIVE
        </span>
      </div>
      <p className="panel-note">
        Jev interpretations · all scopes update automatically
      </p>
      <div className="object-columns">
        <span>OBJECT / SITUATION</span>
        <span>SEVERITY</span>
        <span>URGENCY</span>
      </div>
      <div className="object-list" ref={listRef}>
        {sorted.map((s) => (
          <button
            key={s.id}
            data-object-id={s.id}
            className={`situation-row ${selected === s.id ? "selected" : ""}`}
            onClick={() => onSelect(s.id)}
            aria-label={`Inspect ${s.name}`}
            aria-pressed={selected === s.id}
          >
            <span
              className={`country-code ${s.situation !== "normal" && s.situation ? "object-active" : ""}`}
            >
              {s.id.toUpperCase()}
            </span>
            <span className="situation-name">
              <b>{s.name}</b>
              <small>
                <Changed value={s.situation}>
                  {s.situation ?? "Deriving"}
                </Changed>
                {!s.ready && s.situation ? " · updating" : ""}
              </small>
            </span>
            <span className={`severity-pill level-${Math.round(s.severity)}`}>
              {s.situation ? severityLabel(s.severity) : "Pending"}
            </span>
            <span className="situation-meta">
              <b>
                <Changed value={s.urgency}>
                  {s.situation ? s.urgency.toFixed(2) : "—"}
                </Changed>
              </b>
              <small>{s.trend ?? "—"}</small>
            </span>
            {s.alert && (
              <span
                className="alert-dot"
                title="Policy: urgency ≥ 0.80 and severity ≥ 2"
              />
            )}
          </button>
        ))}
      </div>
      <div className="board-footer">
        <i /> Urgency ≥ 0.80 + severity ≥ 2 triggers an alert.
      </div>
    </section>
  );
});
export const CrossDomain = memo(function CrossDomain({
  onInspect,
}: {
  onInspect: (id: string) => void;
}) {
  const energy = useSemantic("energy.supplyRisk"),
    jp = useSemantic("jp.imports.pressure"),
    eu = useSemantic("eu.energy.pressure"),
    aviation = useSemantic("aviation.cost.pressure");
  return (
    <section className="cross-domain">
      <div>
        <span className="kicker">CROSS-DOMAIN PROPAGATION</span>
        <h3>One signal. Three exposed systems.</h3>
      </div>
      <button onClick={() => onInspect("energy.supplyRisk")}>
        <span>Energy supply</span>
        <b>
          <Changed value={value(energy?.data)}>
            {format(value(energy?.data))}
          </Changed>
        </b>
      </button>
      <span className="branch-arrow">→</span>
      {[
        ["Japan imports", jp],
        ["Europe energy", eu],
        ["Aviation costs", aviation],
      ].map(([label, raw]) => {
        const c = raw as typeof jp;
        return (
          <button key={String(label)} onClick={() => onInspect(c!.id)}>
            <span>{String(label)}</span>
            <b>
              <Changed value={value(c?.data)}>{format(value(c?.data))}</Changed>
              <small> / 3</small>
            </b>
          </button>
        );
      })}
    </section>
  );
});
