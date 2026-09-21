import { CausalStory } from "./CausalStory.js";
import { WorldAtlas } from "./WorldAtlas.js";
import { useState } from "react";
import { useEventSnapshot } from "../events/provider.js";
import { eventLabel } from "../events/model.js";
import type { ScenarioId } from "../events/scenarios.js";
import {
  useGraph,
  useSemantic,
  useTrace,
  useTransitions,
} from "../semantic/provider.js";
import { groupForNode } from "../semantic/contract.js";
import { value } from "../semantic/hooks.js";
import { format } from "./status.js";
import { Changed } from "./motion.js";
import { Code, DevInspector } from "./Inspector.js";
import { Timeline } from "./Timeline.js";
import { Usage } from "../../react/usage.js";
import type { DemoUsage } from "../../shared/usage.js";
import { DemoErrorNotice, useRetrySeconds } from "../../react/error-notice.js";

type GraphNode = { id: string; label: string; x: number; y: number };
const node = (id: string, label: string, x: number, y: number): GraphNode => ({
  id,
  label,
  x,
  y,
});
const diagrams: Record<
  ScenarioId,
  { nodes: GraphNode[]; edges: [string, string][] }
> = {
  markets: {
    nodes: [
      node("event", "US observation", 50, 7),
      node("global.markets.stress", "Shared market pressure", 50, 24),
      node("jp.spillover.pressure", "Japan · pressure", 25, 41),
      node("eu.spillover.pressure", "Europe · pressure", 75, 41),
      node("country:jp.situation", "Japan · situation", 25, 58),
      node("region:europe.situation", "Europe · situation", 75, 58),
      node("region:asia.attention", "Asia · attention", 25, 75),
      node("global.attention", "World · attention", 50, 92),
    ],
    edges: [
      ["event", "global.markets.stress"],
      ["global.markets.stress", "jp.spillover.pressure"],
      ["global.markets.stress", "eu.spillover.pressure"],
      ["jp.spillover.pressure", "country:jp.situation"],
      ["eu.spillover.pressure", "region:europe.situation"],
      ["country:jp.situation", "region:asia.attention"],
      ["region:asia.attention", "global.attention"],
      ["region:europe.situation", "global.attention"],
    ],
  },
  weather: {
    nodes: [
      node("event", "Japan observation", 50, 7),
      node("jp.weather.severity", "Weather · severity", 50, 24),
      node("jp.transport.disruption", "Transport · disruption", 50, 41),
      node("country:jp.situation", "Japan · situation", 50, 58),
      node("region:asia.attention", "Asia · attention", 50, 75),
      node("global.attention", "World · attention", 50, 92),
    ],
    edges: [
      ["event", "jp.weather.severity"],
      ["jp.weather.severity", "jp.transport.disruption"],
      ["jp.transport.disruption", "country:jp.situation"],
      ["country:jp.situation", "region:asia.attention"],
      ["region:asia.attention", "global.attention"],
    ],
  },
  energy: {
    nodes: [
      node("event", "Supply observation", 50, 7),
      node("energy.supplyRisk", "Shared supply pressure", 50, 24),
      node("jp.imports.pressure", "Japan · import pressure", 25, 41),
      node("eu.energy.pressure", "Europe · energy pressure", 75, 41),
      node("country:jp.situation", "Japan · situation", 25, 58),
      node("region:europe.situation", "Europe · situation", 75, 58),
      node("region:asia.attention", "Asia · attention", 25, 75),
      node("global.attention", "World · attention", 50, 92),
    ],
    edges: [
      ["event", "energy.supplyRisk"],
      ["energy.supplyRisk", "jp.imports.pressure"],
      ["energy.supplyRisk", "eu.energy.pressure"],
      ["jp.imports.pressure", "country:jp.situation"],
      ["eu.energy.pressure", "region:europe.situation"],
      ["country:jp.situation", "region:asia.attention"],
      ["region:asia.attention", "global.attention"],
      ["region:europe.situation", "global.attention"],
    ],
  },
};
function label(id: string) {
  if (id === "jp.attention.urgent") return "Japan · attention";
  if (id === "eu.attention.urgent") return "Europe · attention";
  if (id === "global.markets.trend") return "Shared market trend";
  return (
    Object.values(diagrams)
      .flatMap((d) => d.nodes)
      .find((n) => n.id === id)?.label ?? id
  );
}
function SemanticNode({
  item,
  selected,
  onSelect,
}: {
  item: GraphNode;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const cell = useSemantic(item.id);
  const { cells } = useGraph();
  const waitingFor = cell?.dependencies.find((id) => !cells[id]?.ready);
  const changes = useTransitions();
  const { facts } = useEventSnapshot();
  const previous = changes.find(
    (c) =>
      c.semanticId === item.id &&
      c.from !== null &&
      c.timestamp === facts.events.at(-1)?.timestamp,
  );
  return (
    <button
      className={`journey-node ${cell?.status} ${selected === item.id ? "selected" : ""}`}
      style={{ left: `${item.x}%`, top: `${item.y}%` }}
      aria-label={`Inspect ${item.label}`}
      aria-pressed={selected === item.id}
      onClick={() => onSelect(item.id)}
    >
      <span className="journey-node-label">{item.label}</span>
      <strong>
        <Changed value={value(cell?.data)}>
          {cell?.data ? format(value(cell.data)) : "…"}
        </Changed>
        {cell?.data?.type === "score" && <small> / 3</small>}
      </strong>
      <span className="journey-node-state">
        {cell?.status === "error"
          ? "Request failed · inspect"
          : !cell?.ready
            ? cell?.status === "blocked"
              ? `Waiting: ${waitingFor ? label(waitingFor) : "upstream meaning"}`
              : "Interpreting facts…"
            : previous
              ? `${format(previous.from)} → ${format(previous.to)}`
              : "Ready · click to inspect"}
      </span>
    </button>
  );
}
function PropagationGraph({
  scenario,
  selected,
  onSelect,
}: {
  scenario: ScenarioId;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { cells } = useGraph();
  const { facts } = useEventSnapshot();
  const event = facts.events.at(-1);
  const diagram =
    scenario === "energy" && event?.place === "jp"
      ? {
          nodes: [
            node("event", "Japan fuel observation", 50, 7),
            node("aviation.cost.pressure", "Aviation · cost pressure", 50, 24),
            node("jp.transport.disruption", "Transport · disruption", 50, 41),
            node("country:jp.situation", "Japan · situation", 50, 58),
            node("region:asia.attention", "Asia · attention", 50, 75),
            node("global.attention", "World · attention", 50, 92),
          ],
          edges: [
            ["event", "aviation.cost.pressure"],
            ["aviation.cost.pressure", "jp.transport.disruption"],
            ["jp.transport.disruption", "country:jp.situation"],
            ["country:jp.situation", "region:asia.attention"],
            ["region:asia.attention", "global.attention"],
          ] as [string, string][],
        }
      : diagrams[scenario];
  // The weather replay also includes transport observations, which enter that branch directly.
  const edges = diagram.edges.map(([from, to]): [string, string] =>
    from === "event" &&
    event?.type === "transport_disruption" &&
    scenario === "weather"
      ? [from, "jp.transport.disruption"]
      : [from, to],
  );
  const eventNode = diagram.nodes[0]!;
  return (
    <section className="journey-canvas" aria-label="Event dependency graph">
      <div className="journey-canvas-heading">
        <span>01 EVENT → 02 MEANING → 03 REACT</span>
        <small>Click a node to inspect →</small>
      </div>
      <div className="journey-graph">
        <svg
          className="journey-wires"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {edges.map(([from, to]) => {
            const a = diagram.nodes.find((n) => n.id === from)!;
            const b = diagram.nodes.find((n) => n.id === to)!;
            const cell = cells[to]!;
            const d =
              from === "event" && b.y - a.y > 25
                ? `M ${a.x + 12} ${a.y} C 85 ${a.y}, 85 ${b.y}, ${b.x + 10} ${b.y}`
                : `M ${a.x} ${a.y + 5} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - 5}`;
            return (
              <g
                key={`${from}:${to}`}
                className={
                  selected === to || selected === from ? "wire-selected" : ""
                }
              >
                <path d={d} className="wire-base" />
                {event && cell.ready && (
                  <path
                    key={cell.fingerprint}
                    d={d}
                    pathLength="1"
                    className="wire-packet"
                  />
                )}
              </g>
            );
          })}
        </svg>
        <button
          className={`journey-node event-node ${selected === "event" ? "selected" : ""}`}
          style={{ left: `${eventNode.x}%`, top: `${eventNode.y}%` }}
          aria-label="Inspect source event"
          aria-pressed={selected === "event"}
          onClick={() => onSelect("event")}
        >
          <span className="journey-node-label">FACT · {eventNode.label}</span>
          <strong>
            {event
              ? event.type === "market_move"
                ? `${event.payload.changePct ?? event.payload.oilChangePct}% market move`
                : event.type.replaceAll("_", " ")
              : "No event yet"}
          </strong>
          <span className="journey-node-state">
            {event
              ? `${event.timestamp.slice(11, 16)} · ${event.source.label}`
              : "Send an event above to begin"}
          </span>
        </button>
        {diagram.nodes.slice(1).map((item) => (
          <SemanticNode
            key={item.id}
            item={item}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p className="journey-caption">
        {scenario === "markets"
          ? "Only US facts change. Japan and Europe inherit meaning, not new observations."
          : "Events change facts. Each downstream hook reads fresh upstream meaning."}
        <small>
          Focused branch · other declared dependencies remain active.
        </small>
      </p>
    </section>
  );
}
function explanation(id: string) {
  if (id.endsWith(".attention.urgent"))
    return "This Noul hook combines shared pressure with local exposure. Ordinary code raises an on-screen alert at 0.80; the model does not choose the UI action.";
  if (id.includes("spillover"))
    return `${id.startsWith("jp") ? "Japan’s" : "Europe’s"} local observations haven’t changed. This hook combines shared US market pressure with the scope’s declared exposure.`;
  if (id === "global.markets.stress")
    return "Two typed hooks interpret the same US observations. Their answers become inputs to Japan and Europe.";
  if (id === "global.attention")
    return "The world overview consumes regional meaning. No new event is needed here: changed upstream answers trigger this hook.";
  if (id === "region:asia.attention")
    return "Asia reads Japan, Korea and China’s situation values. A changed Japanese interpretation can update this regional view.";
  return "This hook reads only its declared facts and upstream meanings. When those inputs change, React requests a fresh typed answer.";
}
function FocusInspector({
  selected,
  onSelect,
  initialCode = false,
}: {
  selected: string;
  onSelect: (id: string) => void;
  initialCode?: boolean;
}) {
  const { cells, runtime } = useGraph();
  const { facts } = useEventSnapshot();
  const trace = useTrace();
  const [tab, setTab] = useState<"Inputs" | "Answer" | "Code">(
    initialCode ? "Code" : "Inputs",
  );
  const cell = cells[selected];
  if (!cell)
    return (
      <div className="focus-event">
        <span className="eyebrow">IMMUTABLE OBSERVATION</span>
        <h2>The source event</h2>
        <p>
          The reducer changes facts. Jev does not create or calculate these
          observations.
        </p>
        <pre>
          {JSON.stringify(
            facts.events.at(-1) ?? {
              status: "Scenario baseline. Send an event to begin.",
            },
            null,
            2,
          )}
        </pre>
      </div>
    );
  const group = groupForNode(selected),
    question = group.questions[selected]!;
  const batch = trace.traces.find(
    (t) => t.scopeId === group.id && t.stateFingerprint === cell.fingerprint,
  );
  const exposure = selected.includes("spillover");
  const local =
    facts.countries[selected.startsWith("jp") ? "jp" : "eu"].markets;
  const distribution =
    cell.data && "probabilities" in cell.data
      ? cell.data.probabilities
      : cell.data?.type === "noul"
        ? { yes: cell.data.noul, no: 1 - cell.data.noul }
        : undefined;
  return (
    <>
      <div className="focus-heading">
        <span className="eyebrow">
          {exposure ? "WHY DID THIS CHANGE?" : "SELECTED MEANING"}
        </span>
        <h2>{label(selected)}</h2>
        <div className="focus-value">
          <strong>{format(value(cell.data))}</strong>
          <span>
            {question.type === "score"
              ? "pressure / 3"
              : question.type.toUpperCase()}{" "}
            ·{" "}
            {cell.ready
              ? "ready"
              : cell.status === "error"
                ? "request failed"
                : cell.data
                  ? "previous answer · updating"
                  : "waiting for inputs"}
          </span>
        </div>
        <p>{explanation(selected)}</p>
      </div>
      <div
        className="focus-tabs"
        role="tablist"
        aria-label="Inspect selected value"
      >
        {(["Inputs", "Answer", "Code"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="focus-content" role="tabpanel" aria-label={tab}>
        {tab === "Inputs" ? (
          <>
            <h3>
              {cell.dependencies.length
                ? "Inherited meaning"
                : "Observed facts"}
            </h3>
            {cell.dependencies.length ? (
              <div className="focus-dependencies">
                {cell.dependencies.map((id) => (
                  <button key={id} onClick={() => onSelect(id)}>
                    <span>{label(id)}</span>
                    <b>{format(value(cells[id]?.data))} ↗</b>
                  </button>
                ))}
              </div>
            ) : (
              <pre>
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(cell.input.facts).map(([key, v]) => [
                      key,
                      v && typeof v === "object" && "current" in v
                        ? v.current
                        : v,
                    ]),
                  ),
                  null,
                  2,
                )}
              </pre>
            )}
            {exposure && (
              <>
                <h3>Local facts · unchanged by US events</h3>
                <dl className="focus-facts">
                  <div>
                    <dt>Observed market move</dt>
                    <dd>{String(local.current.changePct)}%</dd>
                  </div>
                  <div>
                    <dt>Local reports</dt>
                    <dd>{local.eventIds.length}</dd>
                  </div>
                  <div>
                    <dt>Declared exposure</dt>
                    <dd>{String(cell.input.facts.exposure)} / 1</dd>
                  </div>
                </dl>
                <p className="focus-note">
                  Exposure is a fictional scenario assumption. Derived pressure
                  is not a report of losses abroad.
                </p>
              </>
            )}
            <details>
              <summary>Exact input & question</summary>
              <pre>
                {JSON.stringify({ state: cell.input, question }, null, 2)}
              </pre>
            </details>
          </>
        ) : tab === "Answer" ? (
          <>
            <span className="eyebrow">
              {runtime.mode === "mock"
                ? "SIMULATED INTERPRETATION"
                : "LIVE JEV INTERPRETATION"}
            </span>
            <p>{question.instructions}</p>
            {!cell.ready && (
              <p className="focus-note">
                Updating. Any answer shown is the previous result, not fresh
                meaning.
              </p>
            )}
            {distribution && (
              <div className="distribution">
                {Object.entries(distribution).map(([key, p]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <i>
                      <b style={{ width: `${p * 100}%` }} />
                    </i>
                    <strong>{p.toFixed(3)}</strong>
                  </div>
                ))}
              </div>
            )}
            <details>
              <summary>Full answer & criteria</summary>
              <pre>
                {JSON.stringify({ question, answer: cell.data }, null, 2)}
              </pre>
            </details>
            <h3>Who reacts to this?</h3>
            <p className="focus-note">
              Declared consumers · the graph and this inspector also subscribe.
            </p>
            <p>{group.consumers.join(" · ")}</p>
          </>
        ) : (
          <>
            <p className="focus-note">
              Running source. Hooks compose through semantic references. The SDK
              handles dependencies, waiting, batching, caching and scoped
              subscriptions.
            </p>
            <Code kind={group.kind} />
          </>
        )}
      </div>
      <div
        className="execution-state"
        aria-label="Current execution"
        data-status={cell.status}
      >
        <span>FACTS COMMITTED</span>
        <i>→</i>
        <span>
          {cell.status === "blocked"
            ? "WAITING ON MEANING"
            : cell.ready
              ? "MEANING READY"
              : cell.status === "error"
                ? "REQUEST FAILED"
                : "HOOK COMPUTING"}
        </span>
        <i>→</i>
        <span>
          {cell.ready
            ? "UI UPDATED"
            : cell.data
              ? "UI KEEPS LAST ANSWER"
              : "UI WAITING"}
        </span>
      </div>
      <div className="focus-receipt" aria-live="polite">
        {batch ? (
          <>
            <b>
              {Object.keys(batch.questions).length} questions ·{" "}
              {batch.status === "pending"
                ? "in flight"
                : batch.status === "error"
                  ? "request failed"
                  : batch.cached === "browser"
                    ? "browser cache · no request"
                    : batch.cached === "server"
                      ? "1 cached request"
                      : runtime.mode === "mock"
                        ? "1 simulated batch"
                        : "1 Jev request"}
            </b>
            <span>
              {batch.id} · depth {cell.pass} ·{" "}
              {batch.status === "pending"
                ? "awaiting response"
                : `${Math.round(batch.durationMs)} ms`}
              {batch.model ? ` · ${batch.model}` : ""}
            </span>
          </>
        ) : (
          <b>{cell.ready ? "Cached meaning" : "Waiting for current inputs…"}</b>
        )}
      </div>
    </>
  );
}
export function Journey({
  scenario,
  selected,
  onSelect,
  usage,
  unavailable,
  initialCode,
}: {
  scenario: ScenarioId;
  selected: string;
  onSelect: (id: string) => void;
  usage: DemoUsage | null;
  unavailable: boolean;
  initialCode: boolean;
}) {
  const [experiment, setExperiment] = useState(!initialCode);
  const story = scenario === "markets" && experiment;
  const [showCode, setShowCode] = useState(initialCode);
  const [surface, setSurface] = useState<"map" | "graph">("map");
  const [mobileView, setMobileView] = useState<"graph" | "inspect">("graph");
  const [panel, setPanel] = useState<"focus" | "history" | "trace" | "usage">(
    "focus",
  );
  const { cells } = useGraph();
  const trace = useTrace();
  const events = useEventSnapshot();
  const pending = Object.values(cells).filter((c) => !c.ready).length;
  const error = Object.values(cells).find((c) => c.error)?.error;
  const seconds = useRetrySeconds(error);
  const inspect = (id: string) => {
    setShowCode(false);
    onSelect(id);
    setPanel("focus");
    setMobileView("inspect");
  };
  const teach = (id: string, code: boolean) => {
    inspect(id);
    setShowCode(code);
  };
  return (
    <div className="journey-shell">
      {scenario === "markets" && (
        <div className="story-view-switch" role="group" aria-label="Demo view">
          <button aria-pressed={story} onClick={() => setExperiment(true)}>
            The experiment
          </button>
          <button aria-pressed={!story} onClick={() => setExperiment(false)}>
            Explore full monitor
          </button>
          <span>FACTS → MEANING → CONSEQUENCES</span>
        </div>
      )}
      {story ? (
        <CausalStory
          onInspect={(id) => {
            setExperiment(false);
            inspect(id);
          }}
        />
      ) : (
        <>
          <div
            className="journey-mobile-switch"
            role="group"
            aria-label="Compact workspace"
          >
            <button
              aria-pressed={mobileView === "graph"}
              onClick={() => setMobileView("graph")}
            >
              Event flow
            </button>
            <button
              aria-pressed={mobileView === "inspect"}
              onClick={() => setMobileView("inspect")}
            >
              Inspect selected value
            </button>
          </div>
          {scenario === "markets" && (
            <nav className="composition-steps" aria-label="How the SDK works">
              <button
                onClick={() => teach("event", false)}
                aria-current={selected === "event" ? "step" : undefined}
              >
                <span>01</span>
                <div>
                  <strong>An event changes facts</strong>
                  <small>US market drops. Local facts stay local.</small>
                </div>
                <code>reducer(event)</code>
              </button>
              <button
                onClick={() => teach("global.markets.stress", true)}
                aria-current={
                  selected.startsWith("global.markets") ? "step" : undefined
                }
              >
                <span>02</span>
                <div>
                  <strong>Meaning becomes ambient</strong>
                  <small>One shared interpretation, available below.</small>
                </div>
                <code>SemanticScope</code>
              </button>
              <button
                onClick={() => teach("jp.spillover.pressure", true)}
                aria-current={
                  selected.includes("spillover") ? "step" : undefined
                }
              >
                <span>03</span>
                <div>
                  <strong>Components interpret it</strong>
                  <small>
                    Japan + Europe. Same signal, different exposure.
                  </small>
                </div>
                <code>useAmbient → useScore</code>
              </button>
            </nav>
          )}
          <div className="journey-workspace" data-mobile-view={mobileView}>
            <div className="journey-visual">
              <div
                className="atlas-view-tabs"
                role="tablist"
                aria-label="World visualization"
              >
                <button
                  role="tab"
                  aria-selected={surface === "map"}
                  onClick={() => setSurface("map")}
                >
                  World map
                </button>
                <button
                  role="tab"
                  aria-selected={surface === "graph"}
                  onClick={() => setSurface("graph")}
                >
                  Dependency graph
                </button>
                <span>SELECT A REGION TO INSPECT ITS MEANING</span>
              </div>
              {surface === "map" ? (
                <WorldAtlas
                  scenario={scenario}
                  selected={selected}
                  onSelect={inspect}
                />
              ) : (
                <PropagationGraph
                  scenario={scenario}
                  selected={selected}
                  onSelect={inspect}
                />
              )}
            </div>
            <aside
              className="journey-inspector"
              aria-label="Permanent inspector"
            >
              <div className="inspector-toolbar">
                <span>
                  {panel === "focus"
                    ? "INSPECT · SELECT A NODE"
                    : panel.toUpperCase()}
                </span>
                {panel !== "focus" && (
                  <button onClick={() => setPanel("focus")}>
                    ← Back to value
                  </button>
                )}
                <button
                  aria-label="Open full trace"
                  onClick={() => {
                    setPanel("trace");
                    setMobileView("inspect");
                  }}
                >
                  Diagnostics ↗
                </button>
              </div>
              {panel === "focus" ? (
                <FocusInspector
                  key={`${selected}:${showCode}`}
                  selected={selected}
                  onSelect={inspect}
                  initialCode={showCode}
                />
              ) : (
                <div className="inspector-utility">
                  {panel === "history" ? (
                    <Timeline onInspect={inspect} />
                  ) : panel === "usage" ? (
                    <Usage
                      usage={usage}
                      unavailable={unavailable}
                      callNote="typed judgments, batched"
                    />
                  ) : (
                    <DevInspector
                      selected={
                        selected === "event"
                          ? "jp.spillover.pressure"
                          : selected
                      }
                      onSelect={onSelect}
                    />
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
      {error && (
        <DemoErrorNotice
          error={error}
          seconds={seconds}
          onRetry={() =>
            Object.values(cells)
              .filter((c) => c.error)
              .forEach((c) => c.refetch())
          }
        />
      )}
      <footer className="journey-footer">
        <div className="journey-health" aria-live="polite">
          <i className={pending ? "pending" : ""} />
          <span>
            {pending ? `${pending} values updating` : "Graph settled"}
          </span>
          <small>
            {events.facts.events.length} events · {trace.requests} batches ·{" "}
            {trace.cacheHits} reused
          </small>
        </div>
        <button
          aria-pressed={panel === "history"}
          onClick={() => {
            setExperiment(false);
            setPanel(panel === "history" ? "focus" : "history");
            setMobileView("inspect");
          }}
        >
          History ↗
        </button>
        <button
          className="journey-totals"
          aria-label="Inspect shared usage"
          onClick={() => {
            setExperiment(false);
            setPanel(panel === "usage" ? "focus" : "usage");
            setMobileView("inspect");
          }}
        >
          <span>ALL VISITORS</span>
          <b>{usage?.requests.toLocaleString() ?? "—"}</b> requests{" "}
          <b>{usage?.inferenceCalls.toLocaleString() ?? "—"}</b> model calls{" "}
          <b>{usage ? `$${usage.estimatedCostUsd.toFixed(6)}` : "—"}</b> est. ↗
        </button>
      </footer>
    </div>
  );
}
