import { memo, useState, type CSSProperties } from "react";
import worldPaths from "../assets/world-paths.json" with { type: "json" };
import { places, placeIds, type PlaceId } from "../events/model.js";
import { useCountryView } from "./status.js";
import { useSemantic } from "../semantic/provider.js";
import { value } from "../semantic/hooks.js";
import { useFacts } from "../events/provider.js";
import { Icon } from "./Icon.js";
const point = (lon: number, lat: number): [number, number] => [
  ((lon + 180) / 360) * 1000,
  ((84 - lat) / 142) * 440,
];
const labelOffset: Record<PlaceId, [number, number]> = {
  jp: [16, 48],
  kr: [-55, 35],
  cn: [-48, -30],
  us: [-50, 38],
  eu: [-10, -30],
  me: [15, 36],
};
const Marker = memo(function Marker({
  id,
  selected,
  onSelect,
}: {
  id: PlaceId;
  selected: boolean;
  onSelect: (id: PlaceId) => void;
}) {
  const s = useCountryView(id),
    p = places[id],
    [x, y] = point(p.lon, p.lat),
    [dx, dy] = labelOffset[id];
  const r = 4 + s.severity * 2;
  const latest = useFacts((f) =>
    f.events.filter((event) => event.place === id).at(-1),
  );
  return (
    <g
      className={`geo-marker ${selected ? "selected" : ""} ${s.alert ? "alert" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Map: ${p.name}`}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      transform={`translate(${x} ${y})`}
    >
      <title>
        {p.name} · {s.situation ?? "deriving"} · urgency {s.urgency.toFixed(2)}
      </title>
      <circle r="23" className="map-hit" />
      {latest && (
        <g key={latest.id} className="observation-ripples" aria-hidden="true">
          <circle r="10" className="observation-ring" />
          <circle r="10" className="observation-ring delayed" />
        </g>
      )}
      <circle r={r + 7} className="marker-ring" />
      <circle
        key={`${s.ready}:${s.fingerprint}`}
        r={r + 3}
        className={s.ready ? "marker-pulse" : "marker-pending"}
      />
      {selected && (
        <path
          className="selection-bracket"
          d="M-21-12v-9h9M12-21h9v9M21 12v9h-9M-12 21h-9v-9"
        />
      )}
      <circle r={r} className="marker-core" />
      <path d={`M0 0L${dx} ${dy}`} className="label-leader" />
      <text x={dx} y={dy} className="map-label">
        {p.name.toUpperCase()}
      </text>
      <text x={dx} y={dy + 16} className="map-value">
        {s.situation ?? "reading…"}
        {!s.ready && s.situation ? " · updating" : ""}
      </text>
    </g>
  );
});

function SemanticLinks({ source = "me" }: { source?: "me" | "us" }) {
  const signal = useSemantic(
    source === "us" ? "global.markets.stress" : "energy.supplyRisk",
  );
  const jp = useSemantic(
    source === "us" ? "jp.spillover.pressure" : "jp.imports.pressure",
  );
  const eu = useSemantic(
    source === "us" ? "eu.spillover.pressure" : "eu.energy.pressure",
  );
  const [x, y] = point(places[source].lon, places[source].lat);
  const active = Number(value(signal?.data)) > 0.1;
  return (
    <g
      className="semantic-map-links"
      aria-label={`Declared ${source === "us" ? "US market" : "energy"} semantic dependencies`}
    >
      {(
        [
          ["jp", jp],
          ["eu", eu],
        ] as const
      ).map(([id, cell]) => {
        const [tx, ty] = point(places[id].lon, places[id].lat);
        const d = `M${x} ${y}Q${(x + tx) / 2} ${Math.min(y, ty) - 55} ${tx} ${ty}`;
        return (
          <g key={id} className={active ? "link-active" : "link-quiet"}>
            <title>
              {source === "us" ? "US market" : "Energy supply"} interpretation →{" "}
              {places[id].name} pressure. Semantic dependency, not an observed
              incident or transport route.
            </title>
            <path d={d} className="semantic-link-base" />
            {active && cell?.ready && (
              <path
                key={`${signal?.fingerprint}:${cell.fingerprint}`}
                d={d}
                pathLength="1"
                className="semantic-link-travel"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
export const WorldMap = memo(function WorldMap({
  selected,
  onSelect,
}: {
  selected: PlaceId;
  onSelect: (id: PlaceId) => void;
}) {
  const attention = useSemantic("global.attention");
  const [zoom, setZoom] = useState(1);
  const [focused, setFocused] = useState(false);
  const [layers, setLayers] = useState({
    grid: true,
    links: true,
    labels: true,
  });
  const [showLayers, setShowLayers] = useState(false);
  const [cx, cy] = focused
    ? point(places[selected].lon, places[selected].lat)
    : [500, 220];
  const tx = Math.min(0, Math.max(1000 * (1 - zoom), 500 - cx * zoom));
  const ty = Math.min(0, Math.max(440 * (1 - zoom), 220 - cy * zoom));
  return (
    <section className="world-map">
      <div className="panel-heading">
        <h2>
          <Icon name="globe" size={14} /> A world that reacts to meaning
        </h2>
        <span>REACT CONSUMER</span>
      </div>
      <div className="map-stage">
        <div className="map-toolbar">
          <button
            aria-label="Map layers"
            aria-expanded={showLayers}
            onClick={() => setShowLayers((v) => !v)}
          >
            <Icon name="layers" size={14} /> Layers <span>03</span>
          </button>
          <span className="map-mode-label">SEMANTIC OVERLAY</span>
        </div>
        {showLayers && (
          <div
            className="map-layer-menu"
            role="group"
            aria-label="Visible map layers"
          >
            {(
              [
                ["grid", "Coordinate grid"],
                ["links", "Semantic dependencies"],
                ["labels", "Object labels"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                />
                {label}
              </label>
            ))}
            <small>
              Links describe semantic dependencies, not physical routes.
            </small>
          </div>
        )}
        <div className="map-navigation" aria-label="Map navigation">
          <button
            aria-label="Zoom in"
            disabled={zoom >= 2.5}
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            aria-label="Focus selected scope"
            aria-pressed={focused}
            onClick={() => {
              setFocused(true);
              setZoom(2);
            }}
          >
            <Icon name="target" size={16} />
          </button>
          <button
            aria-label="Reset map view"
            onClick={() => {
              setFocused(false);
              setZoom(1);
            }}
          >
            <Icon name="reset" size={16} />
          </button>
        </div>
        <div className="map-compass" aria-hidden="true">
          <span>N</span>
          <i />
        </div>
        <svg
          className={`map-canvas ${!layers.labels ? "hide-object-labels" : ""}`}
          viewBox="0 0 1000 440"
          role="img"
          aria-label="Geographic map of monitored world scopes"
        >
          <defs>
            <pattern
              id="map-grid"
              width="83.33"
              height="62"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M83.33 0H0V62"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              />
            </pattern>
            <clipPath id="map-clip">
              <rect width="1000" height="440" />
            </clipPath>
          </defs>
          <g clipPath="url(#map-clip)">
            <g
              className="map-camera"
              style={
                {
                  transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
                  "--map-zoom": zoom,
                } as CSSProperties
              }
            >
              <rect
                width="1000"
                height="440"
                fill="url(#map-grid)"
                className={`map-grid ${!layers.grid ? "hidden-layer" : ""}`}
              />
              <g className="land">
                {worldPaths.map((d, i) => (
                  <path d={d} key={i} />
                ))}
              </g>
              <path d="M0 260.3H1000" className="equator" />
              <text x="12" y="255" className="coordinate-label">
                0° EQUATOR
              </text>
              <text x="720" y="405" className="ocean-label">
                INDIAN OCEAN
              </text>
              <text x="350" y="230" className="ocean-label">
                ATLANTIC
              </text>
              <text x="50" y="315" className="ocean-label">
                PACIFIC OCEAN
              </text>
              {layers.links && (
                <>
                  <SemanticLinks />
                  <SemanticLinks source="us" />
                </>
              )}
              {placeIds.map((id) => (
                <Marker
                  id={id}
                  selected={selected === id}
                  onSelect={onSelect}
                  key={id}
                />
              ))}
            </g>
          </g>
        </svg>
        <div className="map-coordinate">
          <span>
            {places[selected].lat.toFixed(2)}° N ·{" "}
            {Math.abs(places[selected].lon).toFixed(2)}°{" "}
            {places[selected].lon < 0 ? "W" : "E"}
          </span>
          <b>{zoom.toFixed(1)}×</b>
        </div>
      </div>
      <div className="map-footer">
        <span>
          <i className="legend-mark" /> Monitored object
        </span>
        <span>
          <i className="legend-link" /> Semantic dependency
        </span>
        <span className="map-disclaimer">
          Interpretation: {value(attention?.data) ?? "pending"} · unmonitored
          areas unclassified
        </span>
      </div>
    </section>
  );
});
