import { useCallback, useEffect, useMemo, useState } from "react";
import { EventRuntimeProvider } from "./events/provider.js";
import { EventRuntime, MockEventSource } from "./events/runtime.js";
import { scenarios, type ScenarioId } from "./events/scenarios.js";
import { SemanticGraphProvider } from "./semantic/provider.js";
import { MonitorRuntime, liveTransport } from "./semantic/runtime.js";
import type { DemoUsage } from "../shared/usage.js";
import { Journey } from "./components/Journey.js";
import { eventLabel } from "./events/model.js";
export function App() {
  const events = useMemo(() => new EventRuntime(), []);
  const [scenario, setScenario] = useState<ScenarioId>("markets"),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [generation, setGeneration] = useState(0);
  const [mode, setMode] = useState<"mock" | "live">("mock"),
    [available, setAvailable] = useState(false),
    [node, setNode] = useState("jp.spillover.pressure");
  const initialCode =
    typeof window !== "undefined" && window.location.hash === "#dev";
  const [usage, setUsage] = useState<DemoUsage | null>(null),
    [unavailable, setUnavailable] = useState(false);
  const [motion, setMotion] = useState(true);
  const updateUsage = useCallback((next: DemoUsage) => {
    setUsage((prev) =>
      !prev ||
      next.requests > prev.requests ||
      (next.requests === prev.requests &&
        next.meteredCalls >= prev.meteredCalls)
        ? next
        : prev,
    );
    setUnavailable(false);
  }, []);
  const runtime = useMemo(
    () =>
      new MonitorRuntime(
        mode,
        mode === "live"
          ? liveTransport(updateUsage, "/api/monitor")
          : undefined,
      ),
    [mode, updateUsage],
  );
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/monitor/config", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!controller.signal.aborted) setAvailable(c?.live === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/usage", { signal: controller.signal });
        if (!r.ok) throw Error();
        const body = (await r.json()) as DemoUsage;
        if (!controller.signal.aborted && typeof body.requests === "number")
          updateUsage(body);
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [updateUsage]);
  useEffect(() => {
    if (!playing || index >= scenarios[scenario].events.length) return;
    const source = new MockEventSource(
      scenarios[scenario].events.slice(index),
      6000 / speed,
    );
    return source.start((event) => {
      events.ingest(event);
      setIndex((i) => i + 1);
      if (index + 1 >= scenarios[scenario].events.length) setPlaying(false);
    });
  }, [playing, index, scenario, speed, events]);
  useEffect(() => () => events.dispose(), [events]);
  const restart = (id: ScenarioId) => {
    events.reset();
    setScenario(id);
    setPlaying(false);
    setIndex(0);
    setGeneration((g) => g + 1);
    setNode(
      id === "energy"
        ? "energy.supplyRisk"
        : id === "markets"
          ? "jp.spillover.pressure"
          : "jp.weather.severity",
    );
  };
  const next = () => {
    const event = scenarios[scenario].events[index];
    if (event) {
      events.ingest(event);
      setIndex((i) => i + 1);
      if (index + 1 === scenarios[scenario].events.length) setPlaying(false);
    }
  };
  const upcoming = scenarios[scenario].events[index];
  const action = !upcoming
    ? "Replay complete"
    : scenario === "markets"
      ? index === 0
        ? "Send US market drop →"
        : index < 3
          ? "Escalate pressure →"
          : index === 3
            ? "Send support notice →"
            : "Send recovery →"
      : "Send next event →";
  return (
    <EventRuntimeProvider runtime={events}>
      <main className="journey-app" data-motion={motion ? "on" : "off"}>
        <header className="journey-header">
          <a className="journey-brand" href="#demo">
            WORLDLINE <span>JEV HOOKS / INTERACTIVE EXPLANATION</span>
          </a>
          <div className="journey-header-tools">
            <a className="journey-docs-link" href="/docs/">
              SDK docs ↗
            </a>
            <select
              aria-label="Scenario"
              value={scenario}
              onChange={(e) => restart(e.target.value as ScenarioId)}
            >
              {Object.entries(scenarios).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              aria-label="Semantic mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "mock" | "live")}
            >
              <option value="mock">Simulated Jev</option>
              <option value="live" disabled={!available}>
                Live Jev
              </option>
            </select>
            <button
              aria-label="Reduce interface motion"
              aria-pressed={!motion}
              onClick={() => setMotion((m) => !m)}
            >
              Motion {motion ? "on" : "off"}
            </button>
          </div>
        </header>
        <section className="journey-controls" aria-label="Replay controls">
          <div>
            <h1>
              {scenario === "markets"
                ? "One fact. Different consequences."
                : scenario === "weather"
                  ? "One warning. A chain of meaning."
                  : "One disruption. Connected systems."}
            </h1>
            <p>
              A US event changes shared meaning. Japan and Europe react.{" "}
              <strong>Their local facts stay the same.</strong>
            </p>
            <span className="journey-fiction">
              FICTIONAL REPLAY ·{" "}
              {mode === "mock" ? "SIMULATED ANSWERS" : "LIVE JEV ANSWERS"} · SIX
              MONITORED SCOPES
            </span>
          </div>
          <div className="journey-actions">
            <div>
              <button
                className="journey-primary"
                aria-label="Next event"
                disabled={!upcoming}
                onClick={next}
              >
                {action}
              </button>
              <button
                aria-label="Restart scenario"
                onClick={() => restart(scenario)}
              >
                ↺ Reset
              </button>
              <details className="journey-playback">
                <summary>Replay</summary>
                <div>
                  <button
                    disabled={!upcoming && !playing}
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? "Pause" : "Auto play"}
                  </button>
                  <select
                    aria-label="Replay speed"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value="1">1×</option>
                    <option value="2">2×</option>
                    <option value="4">4×</option>
                  </select>
                </div>
              </details>
            </div>
            <small>
              {playing ? "PLAYING" : "PAUSED"} · {index}/
              {scenarios[scenario].events.length}{" "}
              {upcoming ? `· ${eventLabel(upcoming)}` : "· Reset to replay"}
            </small>
          </div>
        </section>
        <SemanticGraphProvider runtime={runtime} key={`${mode}:${generation}`}>
          <Journey
            scenario={scenario}
            selected={node}
            onSelect={setNode}
            usage={usage}
            unavailable={unavailable}
            initialCode={initialCode}
          />
        </SemanticGraphProvider>
      </main>
    </EventRuntimeProvider>
  );
}
