import { useAmbient, type SemanticResult } from "../../../src/react/index.js";
import type { RuntimeAnswer } from "../../../src/types.js";
import { value } from "../semantic/hooks.js";
import { CountryScope, useTransitions } from "../semantic/provider.js";
import { useFacts } from "../events/provider.js";
import { places, type PlaceId } from "../events/model.js";
import { severityLabel, format } from "./status.js";
import { Changed } from "./motion.js";
function Detail({
  id,
  onInspect,
}: {
  id: PlaceId;
  onInspect: (id: string) => void;
}) {
  const situation = useAmbient<SemanticResult<RuntimeAnswer>>("situation"),
    severity = useAmbient<SemanticResult<RuntimeAnswer>>("severity"),
    urgency = useAmbient<SemanticResult<RuntimeAnswer>>("urgency"),
    trend = useAmbient<SemanticResult<RuntimeAnswer>>("trend");
  const facts = useFacts((f) => f.countries[id]),
    transitions = useTransitions();
  const latest = transitions.find((t) =>
    t.semanticId.startsWith(places[id].scope + "."),
  );
  const systems = [
    Number(facts.weather.current.warning) > 0 && "Weather",
    (Number(facts.transport.current.cancelled) > 0 ||
      Number(facts.transport.current.delayed) > 0) &&
      "Aviation",
    Number(facts.transport.current.railWarnings) > 0 && "Rail",
    Math.abs(Number(facts.markets.current.changePct)) > 1 && "Markets",
    Number(facts.news.current.supplyOfflinePct) > 0 && "Supply",
    Number(facts.news.current.infrastructureOutages) > 0 && "Infrastructure",
  ].filter(Boolean);
  return (
    <section className="situation-detail">
      <div className="panel-heading">
        <h2>
          {places[id].name} <span>/ situation detail</span>
        </h2>
        <span>
          {latest ? latest.timestamp.slice(11, 16) + " REPLAY UTC" : "BASELINE"}
        </span>
      </div>
      <div className="detail-overview">
        <div>
          <span className="kicker">JEV INTERPRETATION</span>
          <h3>
            <Changed value={value(situation?.data)}>
              {format(value(situation?.data))}
            </Changed>
          </h3>
          <small>
            {situation?.semantic.status === "ready"
              ? "Current meaning"
              : "Previous meaning retained while the graph settles"}
          </small>
        </div>
        <div className="detail-metrics">
          {[
            ["Severity", severity],
            ["Urgency", urgency],
            ["Trend", trend],
          ].map(([label, item]) => {
            const c = item as SemanticResult<RuntimeAnswer>;
            return (
              <button
                key={String(label)}
                onClick={() => onInspect(c.semantic.label!)}
              >
                <span>{String(label)}</span>
                <strong>
                  {label === "Severity" && c.data
                    ? severityLabel(Number(value(c.data)))
                    : format(value(c.data))}
                </strong>
                <small>
                  {label === "Severity"
                    ? `${format(value(c.data))} / 3`
                    : c.semantic.status}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="affected">
        <span>AFFECTED SYSTEMS / OBSERVED</span>
        {systems.length ? (
          systems.map((s) => <b key={String(s)}>{s}</b>)
        ) : (
          <b>No reported local disruption</b>
        )}
      </div>
      <div className="detail-facts">
        <span className="kicker">FACTS / DETERMINISTIC</span>
        <dl>
          <div>
            <dt>Weather warning</dt>
            <dd>
              {facts.weather.current.warning}
              <small> / 5</small>
            </dd>
          </div>
          <div>
            <dt>Cancelled flights</dt>
            <dd>{facts.transport.current.cancelled}</dd>
          </div>
          <div>
            <dt>Rail warnings</dt>
            <dd>{facts.transport.current.railWarnings}</dd>
          </div>
          <div>
            <dt>Market change</dt>
            <dd>{facts.markets.current.changePct}%</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
export function SituationDetail({
  id,
  onInspect,
}: {
  id: PlaceId;
  onInspect: (id: string) => void;
}) {
  return (
    <CountryScope scope={places[id].scope}>
      <Detail key={id} id={id} onInspect={onInspect} />
    </CountryScope>
  );
}
