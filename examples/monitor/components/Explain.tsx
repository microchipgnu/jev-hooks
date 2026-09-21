import { useState } from "react";
import { useEventSnapshot } from "../events/provider.js";
import { eventLabel, places, type PlaceId } from "../events/model.js";
import type { ScenarioId } from "../events/scenarios.js";
import {
  useGraph,
  useSemantic,
  useTrace,
  useTransitions,
} from "../semantic/provider.js";
import { groupForNode, groups, marketExposure } from "../semantic/contract.js";
import { value } from "../semantic/hooks.js";
import { Changed } from "./motion.js";
import { format, useCountryView } from "./status.js";
import { Code } from "./Inspector.js";
import marketsSource from "../semantic/markets.tsx?raw";

const labels: Record<string, string> = {
  severity: "Severity",
  urgency: "Needs attention",
  trend: "Trend",
  disruption: "Disruption",
  supplyRisk: "Supply pressure",
  pressure: "Pressure",
  stress: "Market stress",
  situation: "Situation",
  warning: "Warning level",
  windKph: "Wind, km/h",
  rainMm: "Rain, mm",
  cancelled: "Cancelled flights",
  delayed: "Delayed flights",
  railWarnings: "Rail warnings",
  supplyOfflinePct: "Capacity offline, %",
  infrastructureOutages: "Outages",
  changePct: "Market move, %",
  volatility: "Volatility",
  oilChangePct: "Oil move, %",
  shippingDelayHours: "Shipping delay, hours",
  fuelSurchargePct: "Fuel surcharge, %",
  notice: "Notice",
};

export function useDemoFocus(scenario: ScenarioId) {
  const { facts } = useEventSnapshot();
  const event = facts.events.at(-1);
  const id =
    scenario === "energy"
      ? event?.place === "jp"
        ? "aviation.cost"
        : "energy"
      : scenario === "markets"
        ? "global.markets"
        : event?.type === "transport_disruption"
          ? "jp.transport"
          : "jp.weather";
  return { group: groups[id]!, event, facts };
}

export function DemoStory({
  scenario,
  onInspect,
}: {
  scenario: ScenarioId;
  onInspect: (id: string) => void;
}) {
  const { group, event } = useDemoFocus(scenario);
  const { cells, runtime } = useGraph();
  const trace = useTrace();
  const transitions = useTransitions();
  const ids = Object.keys(group.questions);
  const first = cells[ids[0]!]!;
  const batch = trace.traces.find(
    (t) => t.scopeId === group.id && t.stateFingerprint === first.fingerprint,
  );
  const changes = transitions.filter(
    (t) => t.from !== null && t.timestamp === event?.timestamp,
  );
  const ready = ids.every((id) => cells[id]?.ready);
  const payload = event ? Object.entries(event.payload).slice(0, 3) : [];
  return (
    <aside className="demo-story" aria-label="What just happened">
      <div className="story-heading">
        <span className="kicker">THE DEMO, EXPLAINED</span>
        <h2>
          {scenario === "markets"
            ? "One event. A worldwide ripple."
            : event
              ? "What just happened?"
              : "Start with one event."}
        </h2>
      </div>
      <section className="story-step">
        <span className="step-number">1</span>
        <div>
          <h3>
            Your code updates facts <span>DETERMINISTIC</span>
          </h3>
          <p key={event?.id} className="story-event">
            {event
              ? eventLabel(event)
              : "Send the first event above. The reducer will update ordinary application state."}
          </p>
          {payload.length > 0 && (
            <dl className="story-facts">
              {payload.map(([key, v]) => (
                <div key={key}>
                  <dt>{labels[key] ?? key}</dt>
                  <dd>
                    <Changed value={v}>{String(v)}</Changed>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>
      <section className="story-step">
        <span className="step-number">2</span>
        <div>
          <h3>
            Jev hooks derive meaning{" "}
            <span>{runtime.mode === "mock" ? "SIMULATED" : "LIVE JEV"}</span>
          </h3>
          <p>Same input, narrow questions. Each hook returns a typed answer.</p>
          <div className="story-judgments">
            {ids.map((id) => {
              const cell = cells[id]!;
              const type = group.questions[id]!.type;
              const previous = transitions.find(
                (t) =>
                  t.semanticId === id &&
                  t.from !== null &&
                  t.timestamp === event?.timestamp,
              );
              return (
                <button key={id} onClick={() => onInspect(id)}>
                  <span>
                    {labels[id.split(".").at(-1)!] ?? id}
                    <small>use{type[0]!.toUpperCase() + type.slice(1)}</small>
                  </span>
                  <b>
                    {previous && <del>{format(previous.from)} → </del>}
                    <Changed value={value(cell.data)}>
                      {cell.data ? format(value(cell.data)) : "…"}
                    </Changed>
                  </b>
                </button>
              );
            })}
          </div>
          <div className={`batch-receipt ${ready ? "ready" : "pending"}`}>
            <i />
            {!ready
              ? "Deriving current meaning…"
              : batch?.cached === "browser"
                ? `${Object.keys(batch.questions).length} judgments reused · no request`
                : batch
                  ? `${Object.keys(batch.questions).length} judgments · 1 ${batch.cached === "server" ? "cached request" : runtime.mode === "mock" ? "simulated batch" : "Jev request"}`
                  : "Waiting for a batch"}
          </div>
        </div>
      </section>
      <section className="story-step">
        <span className="step-number">3</span>
        <div>
          <h3>
            {scenario === "markets"
              ? "Meaning crosses borders"
              : "React responds"}
          </h3>
          {scenario === "markets" && (
            <p>
              US pressure becomes input to Japan and Europe, weighted by their
              explicit exposure. Their local facts stay unchanged.
            </p>
          )}
          <p>
            {changes.length
              ? `${changes.length} semantic values changed in this update. The map and summaries read that shared meaning.`
              : "Components subscribe to meaning. The map and summaries update as answers arrive."}
          </p>
          <button className="text-action" onClick={() => onInspect(ids[0]!)}>
            See the hooks behind this →
          </button>
        </div>
      </section>
    </aside>
  );
}

export function MarketRipple({
  onInspect,
}: {
  onInspect: (id: string) => void;
}) {
  const { facts } = useEventSnapshot();
  const { cells } = useGraph();
  const start = marketsSource.indexOf("export function MarketComposition(");
  const end = marketsSource.indexOf("\n}", start) + 2;
  return (
    <section className="market-ripple" aria-label="How a US event travels">
      <div className="ripple-intro">
        <span className="kicker">SAME SIGNAL. DIFFERENT EXPOSURE.</span>
        <h2>Why does a US event matter elsewhere?</h2>
        <p>
          Shared markets connect these scopes. We model that connection
          explicitly; Jev interprets the pressure it carries.
        </p>
      </div>
      <div className="ripple-branches">
        {(["jp", "eu"] as const).map((id) => {
          const cell = cells[`${id}.spillover.pressure`]!;
          return (
            <button key={id} onClick={() => onInspect(cell.id)}>
              <span className="kicker">
                US PRESSURE → {places[id].name.toUpperCase()}
              </span>
              <strong>
                <Changed value={value(cell.data)}>
                  {cell.ready ? format(value(cell.data)) : "Updating…"}
                </Changed>
                <small> / 3 potential pressure</small>
              </strong>
              <span>Scenario exposure: {marketExposure[id]} / 1</span>
              <span className="ripple-fact">
                Local observed market move:{" "}
                {String(facts.countries[id].markets.current.changePct)}% ·{" "}
                {facts.countries[id].markets.eventIds.length} local reports
              </span>
            </button>
          );
        })}
      </div>
      <details className="ripple-code">
        <summary>See the code: one value becomes another hook’s input</summary>
        <p>
          Exact running source · semantic/markets.tsx. No event handler manually
          recomputes Japan or Europe.
        </p>
        <pre>{marketsSource.slice(start, end)}</pre>
        <button
          className="text-action"
          onClick={() => onInspect("jp.spillover.pressure")}
        >
          Inspect the exposure hook and its actual inputs →
        </button>
      </details>
      <p className="ripple-caveat">
        Fictional exposure assumptions for this demo. Derived pressure is not a
        report of losses abroad. “World” covers our six monitored scopes.
      </p>
    </section>
  );
}

export function ConsumerSummary({
  id,
  onInspect,
}: {
  id: PlaceId;
  onInspect: (id: string) => void;
}) {
  const country = useCountryView(id);
  const attention = useSemantic("global.attention");
  return (
    <div className="consumer-summary" aria-label="React consumers">
      <button onClick={() => onInspect(`${places[id].scope}.situation`)}>
        <span>{places[id].name}</span>
        <b>
          <Changed value={country.situation}>
            {country.situation ?? "Deriving…"}
          </Changed>
        </b>
      </button>
      <button onClick={() => onInspect("global.attention")}>
        <span>World attention</span>
        <b>
          <Changed value={value(attention?.data)}>
            {value(attention?.data) ?? "Deriving…"}
          </Changed>
        </b>
      </button>
      <div>
        <span>Alert policy</span>
        <b>
          {country.ready
            ? country.alert
              ? "Attention required"
              : "No alert"
            : "Updating…"}
        </b>
      </div>
    </div>
  );
}

export function SDKGuide({ selected }: { selected: string }) {
  const { cells } = useGraph();
  const cell = cells[selected] ?? cells["jp.weather.severity"]!;
  const group = groupForNode(cell.id);
  const [section, setSection] = useState<"hooks" | "scope">("hooks");
  const scopeStart = marketsSource.indexOf("export function MarketScope(");
  const scopeEnd = marketsSource.indexOf("\n}", scopeStart) + 2;
  return (
    <section className="sdk-guide" aria-label="How the SDK works">
      <span className="kicker">READ THE CODE. FOLLOW THE VALUE.</span>
      <h2>Meaning is derived state.</h2>
      <p>
        Your state stays yours. A Jev hook asks a bounded question about it.
        When the input changes, the hook requests a new answer and React reacts.
      </p>
      <div className="sdk-steps">
        <div>
          <b>01</b>
          <p>
            <strong>Pass focused state</strong>Only the facts and upstream
            meanings a judgment needs become its input.
          </p>
        </div>
        <div>
          <b>02</b>
          <p>
            <strong>Read a typed answer</strong>
            <code>useChoice</code> selects an option. <code>useScore</code>{" "}
            returns a bounded score. <code>useNoul</code> returns a probability.
          </p>
        </div>
        <div>
          <b>03</b>
          <p>
            <strong>Compose and subscribe</strong>Downstream hooks wait for
            fresh inputs. Components explicitly read shared values through{" "}
            <code>useAmbient</code>.
          </p>
        </div>
      </div>
      <div
        className="source-tabs"
        role="tablist"
        aria-label="SDK source examples"
      >
        <button
          role="tab"
          aria-selected={section === "hooks"}
          onClick={() => setSection("hooks")}
        >
          The actual hook
        </button>
        <button
          role="tab"
          aria-selected={section === "scope"}
          onClick={() => setSection("scope")}
        >
          Share with React
        </button>
      </div>
      {section === "hooks" ? (
        <div className="guide-source">
          <Code kind={group.kind} />
        </div>
      ) : (
        <div className="guide-source">
          <p className="inspector-caption">
            Exact source · semantic/markets.tsx
          </p>
          <pre>{marketsSource.slice(scopeStart, scopeEnd)}</pre>
          <p>
            Each component names the value it consumes. Nested scopes inherit
            values and can override a key.
          </p>
        </div>
      )}
      <details className="sdk-boundary">
        <summary>
          What belongs to the SDK, and what belongs to this demo?
        </summary>
        <dl>
          <div>
            <dt>Jev Hooks SDK</dt>
            <dd>
              Nameless typed hooks, reference-based dependencies, automatic
              waiting, cross-hook batching, caching, stale-response protection,
              traces, and scoped subscriptions.
            </dd>
          </div>
          <div>
            <dt>This demo’s client</dt>
            <dd>
              Audited question IDs at the public API boundary, simulated
              fixtures, source provenance, and persistent all-visitors usage
              accounting.
            </dd>
          </div>
          <div>
            <dt>Your application</dt>
            <dd>
              Events, reducers, composed semantic hooks, alert policies, and
              presentation. No reducer or global store is required by the SDK.
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
