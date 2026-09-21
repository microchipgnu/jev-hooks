import { useState } from "react";
import { useGraph, useTrace } from "../semantic/provider.js";
import { groups, groupForNode, evidenceIds } from "../semantic/contract.js";
import { value } from "../semantic/hooks.js";
import { useEventSnapshot } from "../events/provider.js";
import { eventLabel } from "../events/model.js";
import { format } from "./status.js";
import attentionSource from "../semantic/attention.ts?raw";
import marketsSource from "../semantic/markets.tsx?raw";
import hooksSource from "../semantic/hooks.ts?raw";
import { DemoErrorNotice, useRetrySeconds } from "../../react/error-notice.js";
import { Changed } from "./motion.js";
import { Icon } from "./Icon.js";
export function DependencyStrip({
  energy,
  markets = false,
  onInspect,
}: {
  energy: boolean;
  markets?: boolean;
  onInspect: (id: string) => void;
}) {
  const { cells } = useGraph();
  const ids = energy
    ? [
        "energy.supplyRisk",
        "eu.energy.pressure",
        "region:europe.situation",
        "global.attention",
      ]
    : markets
      ? [
          "global.markets.stress",
          "jp.spillover.pressure",
          "country:jp.situation",
          "region:asia.attention",
          "global.attention",
        ]
      : [
          "jp.weather.severity",
          "jp.transport.disruption",
          "country:jp.situation",
          "region:asia.attention",
          "global.attention",
        ];
  return (
    <section className="dependency-strip" aria-label="Semantic propagation">
      <div className="propagation-label">
        <span className="kicker">
          <Icon name="graph" size={14} /> FOLLOW THE MEANING
        </span>
        <small>
          {energy
            ? "Energy → Europe branch · Japan and aviation consume the same signal"
            : markets
              ? "US → Japan branch · Europe consumes the same market pressure"
              : "A weather judgment becomes input to the next hook."}
        </small>
      </div>
      <div className="propagation-chain">
        {ids.map((id, i) => {
          const cell = cells[id]!;
          return (
            <div className="chain-item" key={id}>
              {i > 0 && (
                <span
                  className={`chain-arrow ${cell.status}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 32 12">
                    <path d="M0 6H29m-5-4 5 4-5 4" className="connector-base" />
                    {cell.ready && (
                      <path
                        key={cell.fingerprint}
                        d="M0 6H29"
                        pathLength="1"
                        className="connector-packet"
                      />
                    )}
                  </svg>
                </span>
              )}
              <button
                className={`node ${cell.status}`}
                onClick={() => onInspect(id)}
                title={id}
              >
                {cell.ready && (
                  <i
                    key={cell.fingerprint}
                    className="node-completion"
                    aria-hidden="true"
                  />
                )}
                <small>
                  <i className={`node-indicator ${cell.status}`} />
                  {(
                    {
                      "jp.weather.severity": "Weather",
                      "jp.transport.disruption": "Transport",
                      "country:jp.situation": "Japan",
                      "region:asia.attention": "Asia",
                      "global.attention": "World",
                      "energy.supplyRisk": "Energy supply",
                      "eu.energy.pressure": "Europe pressure",
                      "region:europe.situation": "Europe",
                      "country:us.severity": "United States",
                      "global.markets.stress": "US pressure",
                      "jp.spillover.pressure": "Japan exposure",
                    } as Record<string, string>
                  )[id] ?? id}
                </small>
                <b>
                  <Changed value={value(cell.data)}>
                    {format(value(cell.data))}
                  </Changed>
                </b>
                <span>
                  {cell.status === "dirty"
                    ? "RECOMPUTING"
                    : cell.status === "blocked"
                      ? "WAITING ON DEPENDENCIES"
                      : `PASS ${cell.pass} · ${cell.status.toUpperCase()}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function Code({ kind }: { kind: string }) {
  const fn = (
    {
      weather: "useJapanWeatherSemantic",
      transport: "useJapanTransportSemantic",
      market: "useJapanMarketSemantic",
      "market-spillover": "useGlobalMarketSemantic",
      "market-exposure": "MarketCountry",
      news: "useJapanNewsSemantic",
      country: "useCountrySituation",
      aggregate: "useRegionalAttention",
      pressure: "usePressureSemantic",
      energy: "useEnergySemantic",
    } as Record<string, string>
  )[kind]!;
  const market = kind === "market-spillover" || kind === "market-exposure";
  const source =
    kind === "market-attention"
      ? attentionSource
      : market
        ? marketsSource
        : hooksSource;
  const selectedFunction =
    kind === "market-attention"
      ? "useMarketAttention"
      : kind === "market-spillover"
        ? "MarketScope"
        : kind === "market-exposure"
          ? "MarketCountry"
          : fn;
  const start = source.indexOf(`export function ${selectedFunction}`),
    end = source.indexOf("\n}", start) + 2;
  return (
    <>
      <p className="inspector-caption">
        Exact source · semantic/
        {kind === "market-attention"
          ? "attention.ts"
          : market
            ? "markets.tsx"
            : "hooks.ts"}
      </p>
      <p className="inspector-caption">
        Pass a hook result into state to connect it. The SDK waits, batches,
        caches and updates dependents. select() narrows the answer while keeping
        its dependency. Labels and the endpoint’s audited IDs are for inspection
        and transport, not dependency wiring.
      </p>
      {kind === "market-exposure" && (
        <p className="focus-note">
          Two sibling instances run this component: Japan and Europe. Both read
          the same ambient reference; their local exposure differs.
          usePublishCountry only makes results available to the monitor’s
          inspector and regional aggregates.
        </p>
      )}
      <pre aria-label="Running semantic source">{source.slice(start, end)}</pre>
      {market && (
        <details>
          <summary>Shared hook, input projection & sibling composition</summary>
          <pre>
            {hooksSource.slice(
              hooksSource.indexOf("export function useGlobalMarketSemantic"),
              hooksSource.indexOf("export type MarketExposure"),
            )}
          </pre>
          <pre>{marketsSource}</pre>
        </details>
      )}
      <details>
        <summary>Composition of the whole graph</summary>
        <pre>
          {hooksSource.slice(
            hooksSource.indexOf("export function useWorldSemanticGraph"),
          )}
        </pre>
      </details>
    </>
  );
}
export function DevInspector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { cells, runtime } = useGraph(),
    snapshot = useTrace(),
    events = useEventSnapshot();
  const [tab, setTab] = useState<"meaning" | "trace" | "code">("meaning");
  const [allBatches, setAllBatches] = useState(false);
  const cell = cells[selected] ?? cells["country:jp.situation"]!,
    group = groupForNode(cell.id),
    question = group.questions[cell.id]!;
  const trace = snapshot.traces.find(
    (t) => t.scopeId === group.id && t.stateFingerprint === cell.fingerprint,
  );
  const seconds = useRetrySeconds(cell.error);
  const distribution =
    cell.data && "probabilities" in cell.data
      ? cell.data.probabilities
      : cell.data?.type === "noul"
        ? { yes: cell.data.noul, no: 1 - cell.data.noul }
        : undefined;
  const evidence = new Set<string>();
  const seen = new Set<string>();
  function collect(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const c = cells[id];
    if (!c) return;
    evidenceIds(c.input).forEach((id) => evidence.add(id));
    c.dependencies.forEach(collect);
  }
  collect(cell.id);
  const downstream = Object.values(groups).filter((g) =>
    g.dependencies.includes(cell.id),
  );
  const statuses = Object.values(cells);
  return (
    <section className="dev-inspector" aria-label="Developer inspector">
      <div className="panel-heading">
        <h2>Inspect a live value</h2>
        <span>{runtime.mode === "mock" ? "SIMULATED" : "LIVE JEV"}</span>
      </div>
      <div className="runtime-counters">
        <span>
          <b>{events.queued.length}</b> QUEUED
        </span>
        <span>
          <b>{statuses.filter((c) => c.status === "dirty").length}</b> DIRTY /
          READY TO RUN
        </span>
        <span>
          <b>{statuses.filter((c) => c.status === "blocked").length}</b> BLOCKED
        </span>
        <span>
          <b>{snapshot.cacheHits}</b> CACHE
        </span>
        <span>
          <b>{snapshot.traces.filter((t) => t.discarded).length}</b> STALE
          RESULTS
        </span>
      </div>
      <label className="node-select">
        Inspect a semantic value
        <select
          aria-label="Semantic value"
          value={cell.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {Object.values(groups).map((g) => (
            <optgroup key={g.id} label={g.label}>
              {Object.keys(g.questions).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="inspector-title">
        <div>
          <code>{cell.id}</code>
          <h3>{format(value(cell.data))}</h3>
        </div>
        <div>
          <span className={`node-state ${cell.status}`}>{cell.status}</span>
          <small>
            {question.type} · pass {cell.pass}
          </small>
        </div>
      </div>
      {cell.error && (
        <DemoErrorNotice
          error={cell.error}
          seconds={seconds}
          onRetry={() =>
            Object.values(cells)
              .filter((c) => c.error)
              .forEach((c) => c.refetch())
          }
        />
      )}
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Inspector views"
      >
        {(["meaning", "trace", "code"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "code" ? (
        <Code kind={group.kind} />
      ) : tab === "trace" ? (
        <div className="trace-view">
          <div className="trace-scope-heading">
            <strong>{allBatches ? "Whole graph" : group.label}</strong>
            <button
              aria-pressed={allBatches}
              onClick={() => setAllBatches((show) => !show)}
            >
              {allBatches ? "This value only" : "All batches"}
            </button>
          </div>
          <p>
            Session: {snapshot.requests} adapter batches · {snapshot.cacheHits}{" "}
            reused · {events.flushes} event flushes · last burst{" "}
            {events.lastBurst}
          </p>
          <p className="inspector-caption">
            Aborted subscriptions leave answers cached under their original
            fingerprint. Discarded results cannot become current meaning.
          </p>
          {snapshot.traces
            .filter((t) => allBatches || t.scopeId === group.id)
            .slice(0, 40)
            .map((t) => (
              <details
                key={t.id}
                className={`trace-entry ${t.discarded ? "discarded" : t.status}`}
              >
                <summary>
                  <span>
                    {t.id} · {t.scopeId}
                  </span>
                  <b>
                    {t.discarded
                      ? "STALE / NOT ACTIVATED"
                      : t.cached !== "none"
                        ? `${t.cached} cache`
                        : t.status}
                  </b>
                </summary>
                <div className="trace-meta">
                  PASS {t.pass} · GENERATION {t.generation} · {t.durationMs} ms
                  · {Object.keys(t.questions).length} judgments · {t.model}
                </div>
                {t.invalidated.length > 0 && (
                  <p>Invalidated: {t.invalidated.join(", ")}</p>
                )}
                <pre>{JSON.stringify(t, null, 2)}</pre>
              </details>
            ))}
        </div>
      ) : (
        <div className="meaning-inspector">
          <div className="inspector-section">
            <h4>Dependencies</h4>
            <div className="dependency-tags">
              {cell.dependencies.length
                ? cell.dependencies.map((id) => (
                    <button key={id} onClick={() => onSelect(id)}>
                      {id}
                      <b>{format(value(cells[id]?.data))}</b>
                    </button>
                  ))
                : group.facts.map((path) => (
                    <span key={path}>FACT · {path}</span>
                  ))}
            </div>
          </div>
          <div className="inspector-section">
            <h4>Typed judgment · {question.type}</h4>
            {!cell.ready && cell.data && (
              <p className="inspector-caption">
                Previous valid answer · current dependencies are still settling.
                It is not activated as fresh downstream meaning.
              </p>
            )}
            <p>{question.instructions}</p>
            {distribution && (
              <div className="distribution">
                {Object.entries(distribution).map(([id, probability]) => (
                  <div key={id}>
                    <span>{id}</span>
                    <i>
                      <b style={{ width: `${probability * 100}%` }} />
                    </i>
                    <strong>{probability.toFixed(3)}</strong>
                  </div>
                ))}
              </div>
            )}
            {cell.data &&
              "confidence" in cell.data &&
              cell.data.confidence !== undefined && (
                <p className="inspector-caption">
                  Returned confidence {cell.data.confidence.toFixed(2)} ·{" "}
                  {runtime.mode === "mock"
                    ? "authored fixture"
                    : "provider value"}
                </p>
              )}
            <details>
              <summary>Exact criteria & full answer</summary>
              <pre>
                {JSON.stringify({ question, answer: cell.data }, null, 2)}
              </pre>
            </details>
          </div>
          <div className="inspector-section">
            <h4>Evidence lineage · facts, not reasoning</h4>
            {events.facts.events
              .filter((e) => evidence.has(e.id))
              .reverse()
              .map((e) => (
                <article className="evidence-event" key={e.id}>
                  <time>{e.timestamp.slice(11, 16)} UTC</time>
                  <b>{eventLabel(e)}</b>
                  <span>
                    {e.id} · {e.source.label}
                  </span>
                </article>
              ))}
            {!evidence.size && (
              <p className="inspector-caption">
                Deterministic scenario baseline. No external observation has
                changed these inputs.
              </p>
            )}
            <details>
              <summary>
                {cell.ready
                  ? "Exact consumed fact snapshot"
                  : "Current declared input · awaiting derivation"}
              </summary>
              <pre>{JSON.stringify(cell.input, null, 2)}</pre>
            </details>
          </div>
          <div className="inspector-section">
            <h4>Downstream meaning & React consumers</h4>
            <p className="inspector-caption">
              Declared readers for this question group. Visible consumers depend
              on the current view; this is not a live React profiler.
            </p>
            <div className="consumer-tags">
              {downstream.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelect(Object.keys(g.questions)[0]!)}
                >
                  {g.label} →
                </button>
              ))}
              {group.consumers.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
          <div className="last-computation">
            <span>
              {trace?.id ?? "Awaiting batch"} · pass {cell.pass} ·{" "}
              {trace?.durationMs ?? 0} ms
            </span>
            <code>{cell.fingerprint}</code>
            <span>{trace?.model ?? "Waiting for dependencies"}</span>
            <small>
              {trace?.cached === "browser"
                ? "0 network calls · browser cache"
                : trace
                  ? `${Object.keys(trace.questions).length} judgments · 1 batch · ${trace.cached === "none" ? "fresh inference" : trace.cached + " cache"}`
                  : "Not requested yet"}
            </small>
          </div>
        </div>
      )}
    </section>
  );
}
