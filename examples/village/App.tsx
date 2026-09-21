import { useEffect, useMemo, useRef, useState } from "react";
import { SimulationProvider, useSimulation } from "./simulation/provider.js";
import {
  actions,
  scenario,
  eventLabel,
  scopeName,
} from "./simulation/world.js";
import {
  RuntimeProvider,
  VillageSemantics,
  useMeaning,
  answerValue,
  useRuntime,
  useSemanticTrace,
} from "./semantic/providers.js";
import { SemanticRuntime, liveTransport } from "./semantic/runtime.js";
import { LensProvider, useLens } from "./scene/lens.js";
import { VillageScene } from "./scene/VillageScene.js";
import { InspectorHost, LensPortal } from "./inspector/Inspector.js";
import { Usage } from "../react/usage.js";
import type { DemoUsage } from "../shared/usage.js";

function QuickStart() {
  const { dispatch } = useSimulation();
  const lens = useLens();
  return (
    <nav className="quick-start" aria-label="Try the cascade">
      <span>TRY A RIPPLE</span>
      <button onClick={() => dispatch("raise-tax")}>
        <b>01</b> Raise taxes
      </button>
      <i>→</i>
      <button onClick={() => lens.pin("district:market")}>
        <b>02</b> Inspect Market
      </button>
      <i>→</i>
      <button onClick={() => lens.pin("person:mara")}>
        <b>03</b> Meet Mara
      </button>
    </nav>
  );
}
function TopStatus() {
  const mood = useMeaning("village.mood"),
    concern = useMeaning("village.concern"),
    trust = useMeaning("village.trust");
  return (
    <div className="top-semantics" aria-label="Village meaning">
      <div>
        <span>VILLAGE MOOD</span>
        <strong>{answerValue(mood?.data) ?? "Reading the village…"}</strong>
        {mood?.pending && <i className="pending-dot" />}
      </div>
      <div>
        <span>SHARED CONCERN</span>
        <strong>{answerValue(concern?.data) ?? "…"}</strong>
      </div>
      <div>
        <span>TRUST IN COUNCIL</span>
        <strong>
          {trust?.data?.type === "score"
            ? `${Math.round((trust.data.score / 2) * 100)} / 100`
            : "…"}
        </strong>
      </div>
      <p>
        Three hooks.
        <br />
        <b>One shared interpretation.</b>
      </p>
    </div>
  );
}
function ActionBar() {
  const { world, dispatch } = useSimulation();
  const trust = answerValue(useMeaning("village.trust")?.data);
  const [step, setStep] = useState(0);
  return (
    <section className="action-bar" aria-label="Village actions">
      <div className="section-title">
        <div>
          <span className="eyebrow">01 / CHANGE A FACT</span>
          <h2>A small decision. A wider ripple.</h2>
        </div>
        <button
          className="scenario-button"
          onClick={() => {
            dispatch(scenario[step % scenario.length]!);
            setStep((s) => s + 1);
          }}
        >
          Demo scenario <span>{(step % scenario.length) + 1}/5 →</span>
        </button>
      </div>
      <p className="action-guidance">
        {typeof trust === "number" && trust < 1
          ? "Trust is fragile. Try a material improvement and watch meaning change."
          : "Change a policy, then inspect a household. All resource changes are deterministic."}
      </p>
      <div className="actions-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            disabled={world.treasury < (action.cost ?? 0)}
            onClick={() => dispatch(action.id)}
          >
            <span>{action.label}</span>
            <small>{action.detail}</small>
          </button>
        ))}
      </div>
      <div className="raw-status" aria-label="Raw village facts">
        <span>
          DAY <b>{world.day}</b>
        </span>
        <span>
          FOOD <b>{world.foodSupply}</b>
        </span>
        <span>
          TAX <b>{Math.round(world.taxRate * 100)}%</b>
        </span>
        <span>
          TREASURY <b>{world.treasury}</b>
        </span>
        <span>
          CRIME <b>{Math.round(world.crime * 100)}%</b>
        </span>
        <button
          onClick={() => {
            dispatch("reset");
            setStep(0);
          }}
        >
          Reset world
        </button>
      </div>
    </section>
  );
}
function Timeline() {
  const { world } = useSimulation();
  const runtime = useRuntime();
  const mood = useMeaning("village.mood"),
    concern = useMeaning("village.concern"),
    trust = useMeaning("village.trust");
  const [history, setHistory] = useState<{ day: number; changes: string[] }[]>(
    [],
  );
  const previous = useRef<Record<string, string | number> | null>(null);
  const values = {
    mood: answerValue(mood?.data),
    concern: answerValue(concern?.data),
    trust: answerValue(trust?.data),
  };
  const signature = JSON.stringify(values);
  const ready = [mood, concern, trust].every(
    (cell) => cell?.data && !cell.pending && !cell.stale && !cell.error,
  );
  useEffect(() => {
    if (!ready) return;
    const next = JSON.parse(signature) as Record<string, string | number>;
    const format = (value: string | number | undefined) =>
      typeof value === "number" ? value.toFixed(2) : (value ?? "unread");
    const changes = Object.entries(next)
      .filter(([key, value]) => previous.current?.[key] !== value)
      .map(
        ([key, value]) =>
          `${key}: ${format(previous.current?.[key])} → ${format(value)}`,
      );
    previous.current = next;
    if (changes.length)
      setHistory((h) => [{ day: world.day, changes }, ...h].slice(0, 10));
  }, [signature, ready, world.day]);
  useEffect(() => {
    if (world.day === 1) setHistory([]);
  }, [world.day]);
  const days = [
    ...new Set([
      world.day,
      ...world.recentEvents.map((e) => e.day),
      ...history.map((h) => h.day),
    ]),
  ]
    .sort((a, b) => b - a)
    .slice(0, 4);
  return (
    <section className="timeline" aria-label="Facts and interpretations">
      <div className="section-title">
        <div>
          <span className="eyebrow">THE RIPPLE LOG</span>
          <h2>What happened. What it means.</h2>
        </div>
        <span className="concern-tag">{values.concern ?? "…"}</span>
      </div>
      {days.map((day) => (
        <div className="timeline-day" key={day}>
          <span className="day-label">DAY {day}</span>
          <div>
            {world.recentEvents
              .filter((e) => e.day === day)
              .map((event) => (
                <p key={event.id}>
                  <small>FACT</small>
                  {eventLabel(event)}
                </p>
              ))}
            {history
              .filter((item) => item.day === day)
              .map((item, i) => (
                <div className="interpretation" key={i}>
                  <small>
                    INTERPRETATION ·{" "}
                    {runtime.source === "mock" ? "SIMULATED" : "JEV"}
                  </small>
                  {item.changes.map((change) => (
                    <p key={change}>{change}</p>
                  ))}
                </div>
              ))}
            {day === world.day && !ready && (
              <p className="timeline-pending">
                Facts committed. Waiting for meaning…
              </p>
            )}
            {day === 1 && (
              <p className="initial-fact">
                15 residents, 12% taxes, a full market. A quiet starting point.
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
function CascadeStrip({ dev }: { dev: boolean }) {
  const { world } = useSimulation(),
    snapshot = useSemanticTrace(),
    lens = useLens();
  const trace = snapshot.traces[0];
  return (
    <div
      className={`cascade-strip ${trace?.status ?? "idle"}`}
      key={trace?.id}
      aria-live="polite"
    >
      <span className="eyebrow">
        {dev ? "LIVE DEPENDENCY TRACE" : "02 / WATCH MEANING CASCADE"}
      </span>
      <div>
        <span>
          {world.recentEvents.at(-1)
            ? eventLabel(world.recentEvents.at(-1)!)
            : "Explicit facts"}
        </span>
        <i>→</i>
        <span>
          {trace?.invalidated.length
            ? `${trace.invalidated.length} hooks invalidated`
            : "Jev hooks"}
        </span>
        <i>→</i>
        <b>
          {trace
            ? `${trace.cached !== "none" ? `${trace.cached} cache` : trace.status === "pending" ? "deriving…" : `${Object.keys(trace.questions).length} judgments / 1 batch`}`
            : "Waiting for effects"}
        </b>
        <i>→</i>
        <span>{scopeName(lens.selected, world)} context</span>
      </div>
      {dev && trace && (
        <small>
          {trace.id} · pass {trace.pass} · {trace.stateFingerprint} ·{" "}
          {trace.durationMs} ms · {trace.model}
        </small>
      )}
    </div>
  );
}
function VillageLayout({
  dev,
  setDev,
  mode,
  setMode,
  liveAvailable,
  notice,
  usage,
  usageUnavailable,
}: {
  dev: boolean;
  setDev: (value: boolean) => void;
  mode: "mock" | "live";
  setMode: (mode: "mock" | "live") => void;
  liveAvailable: boolean;
  notice: string;
  usage: DemoUsage | null;
  usageUnavailable: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <InspectorHost target={target} dev={dev}>
      <main className="village-app">
        <header className="village-header">
          <a className="village-wordmark" href="/">
            jev-hooks <span>/ field notes no. 02</span>
          </a>
          <div className="header-controls">
            <label className={`mode-selector ${mode}`}>
              <i />
              <select
                aria-label="Inference mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "mock" | "live")}
              >
                <option value="mock">SIMULATED</option>
                <option value="live" disabled={!liveAvailable}>
                  LIVE JEV
                </option>
              </select>
            </label>
            <div className="view-toggle" aria-label="View mode">
              <button aria-pressed={!dev} onClick={() => setDev(false)}>
                PLAY
              </button>
              <button aria-pressed={dev} onClick={() => setDev(true)}>
                DEV
              </button>
            </div>
          </div>
        </header>
        <section className="village-intro">
          <div>
            <p className="eyebrow">AN EXPERIMENT IN AMBIENT SEMANTIC STATE</p>
            <h1>
              Semantic <em>Village.</em>
            </h1>
            <p>
              The simulation knows what happened.
              <br />
              Jev derives what it means. <b>Meaning propagates like state.</b>
            </p>
          </div>
          <div className="thesis">
            <span>React made UI a function of state.</span>
            <strong>
              What if meaning
              <br />
              was part of that state?
            </strong>
            <div>
              <code>facts</code>
              <i>→</i>
              <code>meaning</code>
              <i>→</i>
              <code>behavior</code>
            </div>
          </div>
        </section>
        {notice && <p className="mode-notice">{notice}</p>}
        <TopStatus />
        <QuickStart />
        <div className="village-workspace">
          <div className="world-column">
            <VillageScene />
            <CascadeStrip dev={dev} />
            <ActionBar />
          </div>
          <aside
            className="semantic-inspector"
            aria-label="Semantic inspector"
            ref={setTarget}
          />
        </div>
        <LensPortal scopeId="village" />
        <div className="village-bottom">
          <Timeline />
          <section className="field-guide">
            <span className="eyebrow">TRY THE SEMANTIC LENS</span>
            <h2>
              One world.
              <br />
              Many ways to read it.
            </h2>
            <ol>
              <li>
                <b>Raise taxes.</b> Facts change in code. Three root hooks share
                one batch.
              </li>
              <li>
                <b>Hover Market.</b> Village meaning is inherited; local meaning
                is derived.
              </li>
              <li>
                <b>Click Mara.</b> Read the family → person cascade. Open DEV to
                see the actual questions.
              </li>
            </ol>
            <p>
              No cursor psychology. No generated dialogue. Just typed meaning,
              React scope, and deterministic behavior.
            </p>
          </section>
        </div>
        <Usage
          usage={usage}
          unavailable={usageUnavailable}
          callNote="typed judgments, batched"
        />
        <footer className="village-footer">
          <span>jev-hooks · semantic state is ambient</span>
          <span>
            {mode === "mock"
              ? "Simulated fixtures. No model calls from this mode."
              : "Live Jev · fixed questions · server-side inference"}
          </span>
          <a
            href="https://docs.typesafe.ai/models"
            target="_blank"
            rel="noreferrer"
          >
            About Jev ↗
          </a>
        </footer>
      </main>
    </InspectorHost>
  );
}
export function App() {
  const [mode, setMode] = useState<"mock" | "live">("mock"),
    [dev, setDev] = useState(false),
    [liveAvailable, setLiveAvailable] = useState(false),
    [notice, setNotice] = useState("");
  const [usage, setUsage] = useState<DemoUsage | null>(null),
    [usageUnavailable, setUsageUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/village/config", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (controller.signal.aborted) return;
        setLiveAvailable(config?.live === true);
        if (config?.live && import.meta.env.VITE_JEV_LIVE === "true")
          setMode("live");
        else if (!config?.live)
          setNotice(
            "Simulated semantics · live inference is unavailable on this server. The complete experiment works locally.",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice(
            "Simulated semantics · start the local API server to enable live Jev.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const r = await fetch("/api/usage", { signal: controller.signal });
        if (!r.ok) throw new Error();
        const next = (await r.json()) as DemoUsage;
        if (typeof next.requests !== "number") throw new Error();
        setUsage((prev) =>
          prev &&
          prev.since === next.since &&
          (prev.requests > next.requests ||
            prev.meteredCalls > next.meteredCalls)
            ? prev
            : next,
        );
        setUsageUnavailable(false);
      } catch {
        if (!controller.signal.aborted) setUsageUnavailable(true);
      } finally {
        running = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);
  const runtime = useMemo(
    () =>
      new SemanticRuntime(
        mode,
        mode === "live"
          ? liveTransport((next) => {
              setUsage((prev) =>
                prev &&
                prev.since === next.since &&
                prev.requests > next.requests
                  ? prev
                  : next,
              );
              setUsageUnavailable(false);
            })
          : undefined,
      ),
    [mode],
  );
  return (
    <SimulationProvider>
      <RuntimeProvider key={mode} runtime={runtime}>
        <VillageSemantics>
          <LensProvider>
            <VillageLayout
              dev={dev}
              setDev={setDev}
              mode={mode}
              setMode={(next) => {
                setMode(next);
                setNotice("");
              }}
              liveAvailable={liveAvailable}
              notice={notice}
              usage={usage}
              usageUnavailable={usageUnavailable}
            />
          </LensProvider>
        </VillageSemantics>
      </RuntimeProvider>
    </SimulationProvider>
  );
}
