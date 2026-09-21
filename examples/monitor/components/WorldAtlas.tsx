import { useId, useState } from "react";
import worldPaths from "../assets/world-paths.json" with { type: "json" };
import { places, placeIds, type PlaceId } from "../events/model.js";
import { useEventSnapshot } from "../events/provider.js";
import type { ScenarioId } from "../events/scenarios.js";
import { useSemantic } from "../semantic/provider.js";
import { value } from "../semantic/hooks.js";
import { Changed } from "./motion.js";
import { format, useCountryView } from "./status.js";
import { Icon } from "./Icon.js";

const point = (id: PlaceId) => ({
  x: ((places[id].lon + 180) / 360) * 1000,
  y: ((84 - places[id].lat) / 142) * 440,
});
export function atlasNodes(scenario: ScenarioId, localFuel = false) {
  if (scenario === "energy" && localFuel)
    return {
      origin: "jp" as PlaceId,
      signal: "aviation.cost.pressure",
      japan: "jp.transport.disruption",
      europe: "region:asia.attention",
      title: "Aviation fuel pressure",
      label: "Aviation cost pressure",
    };
  return scenario === "markets"
    ? {
        origin: "us" as PlaceId,
        signal: "global.markets.stress",
        japan: "jp.spillover.pressure",
        europe: "eu.spillover.pressure",
        title: "US market pressure",
        label: "Shared pressure",
      }
    : scenario === "energy"
      ? {
          origin: "me" as PlaceId,
          signal: "energy.supplyRisk",
          japan: "jp.imports.pressure",
          europe: "eu.energy.pressure",
          title: "Energy supply pressure",
          label: "Shared supply pressure",
        }
      : {
          origin: "jp" as PlaceId,
          signal: "jp.weather.severity",
          japan: "jp.transport.disruption",
          europe: "region:asia.attention",
          title: "Japan weather",
          label: "Weather severity",
        };
}
function AtlasMarker({
  id,
  selected,
  prominent,
  semanticId,
  source,
  onSelect,
}: {
  id: PlaceId;
  selected: boolean;
  prominent: boolean;
  semanticId: string;
  source: boolean;
  onSelect: (id: string) => void;
}) {
  const country = useCountryView(id);
  const semantic = useSemantic(semanticId);
  const { x, y } = point(id);
  const { facts } = useEventSnapshot();
  const latest = facts.events.filter((e) => e.place === id).at(-1);
  const labelPosition: Partial<
    Record<PlaceId, { x: number; y: number; anchor: "start" | "end" }>
  > = {
    us: { x: -68, y: 74, anchor: "start" },
    jp: { x: 65, y: 85, anchor: "end" },
    eu: { x: -32, y: -45, anchor: "end" },
    me: { x: 20, y: 65, anchor: "start" },
  };
  const offset = labelPosition[id] ?? { x: 0, y: 30, anchor: "start" as const };
  const radius = 5 + Math.min(3, country.severity) * 1.7;
  const hitLeft = Math.min(
    -28,
    offset.anchor === "end" ? offset.x - 155 : offset.x - 8,
  );
  const hitRight = Math.max(
    28,
    offset.anchor === "end" ? offset.x + 8 : offset.x + 155,
  );
  const hitTop = Math.min(-28, offset.y - 22);
  const hitBottom = Math.max(28, offset.y + 24);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Map: ${places[id].name}`}
      aria-pressed={selected}
      className={`atlas-marker ${source ? "is-origin" : ""} ${selected ? "is-selected" : ""} ${prominent ? "is-prominent" : "is-secondary"}`}
      transform={`translate(${x} ${y})`}
      onClick={() => onSelect(semanticId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(semanticId);
        }
      }}
    >
      <title>
        {places[id].name} · {country.situation ?? "updating"} · click to inspect{" "}
        {semanticId}
      </title>
      {prominent ? (
        <rect
          x={hitLeft}
          y={hitTop}
          width={hitRight - hitLeft}
          height={hitBottom - hitTop}
          className="atlas-hit"
        />
      ) : (
        <circle r="26" className="atlas-hit" />
      )}
      {latest && (
        <g key={latest.id} className="atlas-event-wave" aria-hidden="true">
          <circle r="12" />
          <circle r="12" />
        </g>
      )}
      <circle r={radius + 14} className="atlas-marker-aura" />
      <circle r={radius + 7} className="atlas-marker-orbit" />
      {selected && (
        <g className="atlas-reticle">
          <path d="M-25-12v-13h13M12-25h13v13M25 12v13H12M-12 25h-13V12" />
          <circle r="32" />
        </g>
      )}
      <circle r={radius} className="atlas-marker-core" />
      <circle r="2" className="atlas-marker-center" />
      {prominent && (
        <g className="atlas-place-label" textAnchor={offset.anchor}>
          <path
            d={`M${offset.x} ${offset.y - 10}L${offset.x} ${offset.y - 22}L0 ${offset.y > 0 ? 22 : -22}`}
          />
          <text x={offset.x} y={offset.y}>
            {places[id].name.toUpperCase()}
          </text>
          <text x={offset.x} y={offset.y + 18} className="atlas-place-value">
            {semantic?.ready ? format(value(semantic.data)) : "interpreting…"}
            {semantic?.data?.type === "score" ? " / 3" : ""}
          </text>
        </g>
      )}
    </g>
  );
}
function Transmission({
  origin,
  target,
  semanticId,
  sourceId,
  tint,
}: {
  origin: PlaceId;
  target: PlaceId;
  semanticId: string;
  sourceId: string;
  tint: string;
}) {
  const source = useSemantic(sourceId),
    destination = useSemantic(semanticId);
  const { facts } = useEventSnapshot();
  const a = point(origin),
    b = point(target);
  const arch = Math.max(70, Math.abs(a.x - b.x) * 0.28);
  const d = `M${a.x} ${a.y} C${a.x + (b.x - a.x) * 0.25} ${Math.min(a.y, b.y) - arch},${a.x + (b.x - a.x) * 0.75} ${Math.min(a.y, b.y) - arch},${b.x} ${b.y}`;
  const active = Number(value(source?.data)) > 0.1;
  return (
    <g
      className={`atlas-transmission ${active ? "active" : "quiet"}`}
      aria-label={`${places[origin].name} to ${places[target].name} semantic dependency`}
    >
      <title>
        Shared {sourceId} becomes input to {semanticId}. Interpretation, not an
        observed incident or physical route.
      </title>
      <path d={d} className="atlas-arc-halo" />
      <path d={d} stroke={`url(#${tint})`} className="atlas-arc" />
      {facts.events.length > 0 && destination?.ready && (
        <path
          key={`${source?.fingerprint}:${destination.fingerprint}`}
          d={d}
          pathLength="1"
          className="atlas-arc-packet"
        />
      )}
    </g>
  );
}
function MeaningChip({
  id,
  title,
  selected,
  onSelect,
  name,
}: {
  id: string;
  title: string;
  selected: string;
  onSelect: (id: string) => void;
  name: string;
}) {
  const semantic = useSemantic(id);
  return (
    <button
      className={`atlas-meaning-chip ${selected === id ? "selected" : ""}`}
      aria-label={name}
      aria-pressed={selected === id}
      onClick={() => onSelect(id)}
    >
      <span>{title}</span>
      <strong>
        <Changed value={value(semantic?.data)}>
          {semantic?.data ? format(value(semantic.data)) : "…"}
        </Changed>
        {semantic?.data?.type === "score" && <small> / 3</small>}
      </strong>
      <small>
        {semantic?.ready ? "Inspect meaning ↗" : "Updating meaning…"}
      </small>
    </button>
  );
}
export function WorldAtlas({
  scenario,
  selected,
  onSelect,
}: {
  scenario: ScenarioId;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { facts } = useEventSnapshot();
  const latest = facts.events.at(-1);
  const config = atlasNodes(scenario, latest?.place === "jp");
  const local = config.origin === "jp";
  const attention = useSemantic("global.attention");
  const [zoom, setZoom] = useState(false);
  const uid = useId().replaceAll(":", "");
  const relevantPlace: PlaceId = selected.includes("jp")
    ? "jp"
    : selected.includes("europe") || selected.startsWith("eu")
      ? "eu"
      : selected.startsWith("country:kr")
        ? "kr"
        : selected.startsWith("country:cn")
          ? "cn"
          : config.origin;
  const focus = point(relevantPlace);
  const toSemantic = (id: PlaceId) =>
    id === config.origin
      ? config.signal
      : id === "jp"
        ? config.japan
        : id === "eu" && !local
          ? config.europe
          : `${places[id].scope}.situation`;
  return (
    <section className="world-atlas" aria-label="World semantic map">
      <div className="atlas-heading">
        <div>
          <span className="atlas-eyebrow">WORLD / SEMANTIC FIELD</span>
          <h2>
            {scenario === "markets"
              ? "One signal. Across borders."
              : scenario === "energy"
                ? "Connected by supply."
                : "Weather becomes world context."}
          </h2>
        </div>
        <button
          className="atlas-attention"
          aria-label="Inspect World · attention"
          onClick={() => onSelect("global.attention")}
        >
          <i className={attention?.ready ? "ready" : ""} />
          <span>
            WORLD ATTENTION<strong>{format(value(attention?.data))}</strong>
          </span>
        </button>
      </div>
      <div className="atlas-stage">
        <div className="atlas-map-controls">
          <button
            aria-label="Focus selected region"
            aria-pressed={zoom}
            onClick={() => setZoom((v) => !v)}
          >
            <Icon name={zoom ? "reset" : "target"} size={14} />
            {zoom ? "Full world" : "Focus"}
          </button>
        </div>
        <svg
          className="atlas-world"
          viewBox="0 0 1000 440"
          role="img"
          aria-label="Geographic world map with semantic propagation"
        >
          <defs>
            <radialGradient id={`${uid}-ocean`}>
              <stop stopColor="#162d42" />
              <stop offset="1" stopColor="#080f18" />
            </radialGradient>
            <linearGradient id={`${uid}-land`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#354c60" />
              <stop offset=".5" stopColor="#22384b" />
              <stop offset="1" stopColor="#152636" />
            </linearGradient>
            <linearGradient id={`${uid}-beam`}>
              <stop stopColor="#ddbb79" />
              <stop offset=".35" stopColor="#b9d9ed" />
              <stop offset="1" stopColor="#8cbfee" />
            </linearGradient>
            <pattern
              id={`${uid}-dots`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2.5" cy="2.5" r=".65" fill="#96bdd7" opacity=".25" />
            </pattern>
            <pattern
              id={`${uid}-grid`}
              width="83.333"
              height="62"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M83.333 0H0V62"
                fill="none"
                stroke="#7794aa"
                strokeWidth=".5"
                opacity=".12"
              />
            </pattern>
            <g id={`${uid}-coast`}>
              {worldPaths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <clipPath id={`${uid}-land-clip`}>
              <use href={`#${uid}-coast`} />
            </clipPath>
            <clipPath id={`${uid}-frame`}>
              <rect x="0" y="-65" width="1000" height="550" />
            </clipPath>
          </defs>
          <rect
            x="0"
            y="-65"
            width="1000"
            height="550"
            fill={`url(#${uid}-ocean)`}
          />
          <g clipPath={`url(#${uid}-frame)`}>
            <g
              className="atlas-camera"
              style={{
                transform: zoom
                  ? `translate(${500 - focus.x * 1.5}px, ${195 - focus.y * 1.5}px) scale(1.5)`
                  : "translate(0px,0px) scale(1)",
              }}
            >
              <rect
                x="0"
                y="-65"
                width="1000"
                height="550"
                fill={`url(#${uid}-grid)`}
              />
              <use
                href={`#${uid}-coast`}
                fill={`url(#${uid}-land)`}
                stroke="#8cafc4"
                strokeWidth=".55"
                strokeOpacity=".35"
              />
              <rect
                width="1000"
                height="440"
                fill={`url(#${uid}-dots)`}
                clipPath={`url(#${uid}-land-clip)`}
              />
              <path d="M0 260.3H1000" className="atlas-equator" />
              <g className="atlas-ocean-labels">
                <text x="45" y="325">
                  PACIFIC OCEAN
                </text>
                <text x="405" y="252">
                  ATLANTIC
                </text>
                <text x="665" y="390">
                  INDIAN OCEAN
                </text>
                <text x="12" y="255">
                  0° EQUATOR
                </text>
              </g>
              {!local && (
                <>
                  <Transmission
                    origin={config.origin}
                    target="jp"
                    semanticId={config.japan}
                    sourceId={config.signal}
                    tint={`${uid}-beam`}
                  />
                  <Transmission
                    origin={config.origin}
                    target="eu"
                    semanticId={config.europe}
                    sourceId={config.signal}
                    tint={`${uid}-beam`}
                  />
                </>
              )}
              {placeIds.map((id) => (
                <AtlasMarker
                  key={id}
                  id={id}
                  prominent={
                    id === config.origin ||
                    id === "jp" ||
                    (!local && id === "eu")
                  }
                  source={id === config.origin}
                  selected={selected === toSemantic(id)}
                  semanticId={toSemantic(id)}
                  onSelect={onSelect}
                />
              ))}
            </g>
          </g>
        </svg>
        <div className="atlas-coordinate">
          <span>
            {places[relevantPlace].lat.toFixed(2)}° N /{" "}
            {Math.abs(places[relevantPlace].lon).toFixed(2)}°{" "}
            {places[relevantPlace].lon < 0 ? "W" : "E"}
          </span>
          <span>6 MONITORED SCOPES</span>
        </div>
      </div>
      <button
        className={`atlas-event-strip ${latest ? "has-event" : ""}`}
        aria-label="Inspect source event"
        onClick={() => onSelect("event")}
      >
        <span className="atlas-event-icon">
          <Icon name="activity" size={16} />
        </span>
        <span>
          <small>
            {latest
              ? `OBSERVATION / ${places[latest.place].name.toUpperCase()}`
              : "AWAITING FIRST OBSERVATION"}
          </small>
          <strong>
            {latest
              ? Object.entries(latest.payload)
                  .slice(0, 2)
                  .map(
                    ([k, v]) =>
                      `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v}`,
                  )
                  .join(" · ")
              : "Send an event. Watch its meaning travel."}
          </strong>
        </span>
        <span className="atlas-event-tag">FACT ↗</span>
      </button>
      <div className="atlas-meaning-strip" aria-label="Follow the meaning">
        <MeaningChip
          id={config.signal}
          title={`${scenario === "markets" ? "02" : "01"} / ${config.label}`}
          selected={selected}
          onSelect={onSelect}
          name={
            scenario === "weather"
              ? "Inspect Weather · severity"
              : "Inspect Shared pressure"
          }
        />
        <span aria-hidden="true">↗</span>
        <MeaningChip
          id={config.japan}
          title={
            local
              ? "02 / Japan transport"
              : `${scenario === "markets" ? "03" : "02"} / Japan pressure`
          }
          selected={selected}
          onSelect={onSelect}
          name="Inspect Japan · pressure"
        />
        <MeaningChip
          id={config.europe}
          title={
            local
              ? "03 / Asia attention"
              : `${scenario === "markets" ? "03" : "02"} / Europe pressure`
          }
          selected={selected}
          onSelect={onSelect}
          name="Inspect Europe · pressure"
        />
      </div>
      <div className="atlas-legend">
        <span>
          <i />
          Observation origin
        </span>
        <span>
          <i />
          Derived meaning
        </span>
        <small>Arcs show semantic dependencies, not physical routes.</small>
      </div>
    </section>
  );
}
