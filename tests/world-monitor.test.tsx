// @vitest-environment jsdom
import { StrictMode, memo, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  within,
  fireEvent,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  EventRuntime,
  MockEventSource,
} from "../examples/monitor/events/runtime.js";
import {
  eventSchema,
  initialFacts,
  reduceWorldEvent,
} from "../examples/monitor/events/model.js";
import { scenarios } from "../examples/monitor/events/scenarios.js";
import { EventRuntimeProvider } from "../examples/monitor/events/provider.js";
import {
  SemanticGraphProvider,
  useGraph,
  useSemantic,
  useTransitions,
} from "../examples/monitor/semantic/provider.js";
import { value, type Cell } from "../examples/monitor/semantic/hooks.js";
import { MonitorRuntime } from "../examples/monitor/semantic/runtime.js";
import {
  groups,
  nodeIds,
  monitorRequestSchema,
  questionsFor,
  projectFacts,
  depth,
  normalizeMonitorInput,
  attentionQuestion,
  type MonitorInput,
} from "../examples/monitor/semantic/contract.js";
import { mockMonitor } from "../examples/monitor/semantic/mock.js";
import type { BatchTransport } from "../examples/shared/semantic-runtime.js";
import { useAmbient, type SemanticResult } from "../src/react/index.js";
import { resolveSemanticState } from "../src/react/reference.js";
import type { ScoreAnswer } from "../src/types.js";
import type { JudgmentRequest } from "../src/adapters/adapter.js";

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "#demo");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function tick(ms = 100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function settle() {
  for (let i = 0; i < 25; i++) await tick();
}
const adapter = () =>
  vi.fn<BatchTransport>(async (request) => ({
    answers: mockMonitor(request),
    model: "fixtures",
  }));
function mount(
  transport: BatchTransport = adapter(),
  children?: ReactNode,
  strict = false,
) {
  const events = new EventRuntime(),
    runtime = new MonitorRuntime("mock", transport);
  let cells: Record<string, Cell> = {},
    transitions: ReturnType<typeof useTransitions> = [];
  function Probe() {
    cells = useGraph().cells;
    transitions = useTransitions();
    return null;
  }
  const tree = (
    <EventRuntimeProvider runtime={events}>
      <SemanticGraphProvider runtime={runtime}>
        <Probe />
        {children}
      </SemanticGraphProvider>
    </EventRuntimeProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { events, runtime, cells: () => cells, changes: () => transitions };
}

describe("world events and deterministic facts", () => {
  it("replays all scenarios without inference, retains provenance, and does not mutate the seed", () => {
    for (const scenario of Object.values(scenarios)) {
      const seed = initialFacts();
      const a = scenario.events.reduce(reduceWorldEvent, seed),
        b = scenario.events.reduce(reduceWorldEvent, initialFacts());
      expect(a).toEqual(b);
      expect(seed.events).toHaveLength(0);
      expect(a.events).toHaveLength(scenario.events.length);
      for (const e of a.events)
        expect(eventSchema.safeParse(e).success).toBe(true);
    }
    const facts = scenarios.weather.events
      .slice(0, 3)
      .reduce(reduceWorldEvent, initialFacts());
    expect(facts.countries.jp.transport.current.cancelled).toBe(47);
    expect(facts.countries.jp.transport.provenance.cancelled?.eventId).toBe(
      "weather:3",
    );
    expect(facts.countries.jp.weather.history.at(-1)?.values.warning).toBe(2);
  });
  it("ignores duplicates, retains untouched branch identity, and does not apply older observations over newer facts", () => {
    const seed = initialFacts(),
      old = scenarios.weather.events[0]!,
      next = scenarios.weather.events[1]!;
    const updated = reduceWorldEvent(seed, next);
    expect(updated.countries.us).toBe(seed.countries.us);
    expect(updated.countries.jp.markets).toBe(seed.countries.jp.markets);
    expect(reduceWorldEvent(updated, next)).toBe(updated);
    const reordered = reduceWorldEvent(updated, old);
    expect(reordered.countries.jp.weather.current.warning).toBe(4);
    expect(reordered.events).toHaveLength(2);
  });
  it("uses a bounded 250 ms coalescing window and cancels queued work on reset", async () => {
    const runtime = new EventRuntime();
    runtime.ingest(scenarios.weather.events[0]!);
    await tick(150);
    runtime.ingest(scenarios.weather.events[1]!);
    await tick(99);
    expect(runtime.getSnapshot().facts.events).toHaveLength(0);
    await tick(1);
    expect(runtime.getSnapshot()).toMatchObject({ flushes: 1, lastBurst: 2 });
    expect(
      runtime.getSnapshot().facts.countries.jp.weather.current.warning,
    ).toBe(4);
    runtime.ingest(scenarios.weather.events[2]!);
    runtime.reset();
    await tick(300);
    expect(runtime.getSnapshot().facts.events).toHaveLength(0);
  });
  it("replay source emits immutable scenario IDs in order and cleanup pauses ingestion", async () => {
    const emit = vi.fn(),
      stop = new MockEventSource(scenarios.energy.events, 100).start(emit);
    await tick(220);
    stop();
    await tick(400);
    expect(emit.mock.calls.map(([e]) => e.id)).toEqual([
      "energy:1",
      "energy:2",
    ]);
  });
});

describe("always-running semantic graph", () => {
  it("publishes original composable references through ambient scope under StrictMode", async () => {
    let shared: SemanticResult<ScoreAnswer> | undefined;
    let named: SemanticResult<ScoreAnswer> | undefined;
    let local: SemanticResult<ScoreAnswer> | undefined;
    function AmbientConsumer() {
      shared = useAmbient<SemanticResult<ScoreAnswer>>("pressure");
      named = useAmbient<SemanticResult<ScoreAnswer>>("global.markets.stress");
      local = useAmbient<SemanticResult<ScoreAnswer>>("jp.spillover.pressure");
      return null;
    }
    const transport = adapter();
    const app = mount(transport, <AmbientConsumer />, true);
    await settle();
    expect(shared).toBe(named);
    expect(named).toBe(app.cells()["global.markets.stress"]!.reference);
    // Resolving the entire object catches accidental spreading of the branded reference.
    expect(resolveSemanticState({ shared, local }, app.runtime)).toMatchObject({
      ready: true,
      input: {
        shared: { type: "score", score: 0 },
        local: { type: "score", score: 0 },
      },
      dependencies: [
        { label: "global.markets.stress" },
        { label: "jp.spillover.pressure" },
      ],
    });
    expect(transport).toHaveBeenCalledTimes(21);
    const previous = shared;
    act(() => app.events.ingest(scenarios.markets.events[0]!));
    await settle();
    expect(shared).not.toBe(previous);
    expect(local?.data?.score).toBeCloseTo(1.79);
    expect(
      app.cells()["jp.spillover.pressure"]!.reference.semantic.dependencies,
    ).toEqual(
      app.cells()["eu.spillover.pressure"]!.reference.semantic.dependencies,
    );
    expect(Object.values(app.cells()).every((cell) => cell.ready)).toBe(true);
  });

  it("keeps sibling inference independent and rejects late country publications", async () => {
    let oldRequest: JudgmentRequest | undefined;
    let finishOld:
      | ((result: Awaited<ReturnType<BatchTransport>>) => void)
      | undefined;
    const transport = vi.fn<BatchTransport>(async (request) => {
      const input = request.state as MonitorInput;
      if (
        !oldRequest &&
        input.scopeId === "jp.spillover" &&
        Number(input.inherited["global.markets.stress"]) > 0
      ) {
        oldRequest = request;
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      }
      return { answers: mockMonitor(request), model: "fixtures" };
    });
    const app = mount(transport);
    await settle();
    act(() => app.events.ingest(scenarios.markets.events[0]!));
    await settle();
    expect(finishOld).toBeDefined();
    expect(app.cells()["jp.spillover.pressure"]!.ready).toBe(false);
    expect(app.cells()["country:jp.situation"]!.status).toBe("blocked");
    expect(app.cells()["eu.spillover.pressure"]!.ready).toBe(true);
    expect(
      Number(value(app.cells()["eu.spillover.pressure"]!.data)),
    ).toBeGreaterThan(1);
    act(() => app.events.ingest(scenarios.markets.events[1]!));
    await settle();
    const fresh = app.cells()["jp.spillover.pressure"]!.fingerprint;
    const answer = app.cells()["jp.spillover.pressure"]!.data;
    expect(Object.values(app.cells()).every((cell) => cell.ready)).toBe(true);
    await act(async () =>
      finishOld!({ answers: mockMonitor(oldRequest!), model: "fixtures" }),
    );
    await settle();
    expect(app.cells()["jp.spillover.pressure"]!.fingerprint).toBe(fresh);
    expect(app.cells()["jp.spillover.pressure"]!.data).toBe(answer);
    expect(
      app.runtime
        .getSnapshot()
        .traces.some(
          (trace) => trace.scopeId === "jp.spillover" && trace.discarded,
        ),
    ).toBe(true);
  });

  it("interprets one shared signal into different attention policies without changing local facts", async () => {
    const transport = adapter();
    const app = mount(transport);
    await settle();
    const japanFacts = app.events.getSnapshot().facts.countries.jp.markets;
    const europeFacts = app.events.getSnapshot().facts.countries.eu.markets;
    expect(value(app.cells()["jp.attention.urgent"]!.data)).toBe(0.05);
    act(() => app.events.ingest(scenarios.markets.events[0]!));
    await settle();
    expect(
      Number(value(app.cells()["jp.attention.urgent"]!.data)),
    ).toBeGreaterThanOrEqual(0.8);
    expect(
      Number(value(app.cells()["eu.attention.urgent"]!.data)),
    ).toBeLessThan(0.8);
    expect(app.events.getSnapshot().facts.countries.jp.markets).toBe(
      japanFacts,
    );
    expect(app.events.getSnapshot().facts.countries.eu.markets).toBe(
      europeFacts,
    );
    for (const country of ["jp", "eu"]) {
      const cell = app.cells()[`${country}.attention.urgent`]!;
      expect(cell.dependencies).toEqual(["global.markets.stress"]);
      expect(cell.pass).toBe(2);
      expect(
        monitorRequestSchema.safeParse({ input: cell.input, ids: [cell.id] })
          .success,
      ).toBe(true);
      expect(
        transport.mock.calls.filter(
          ([r]) => (r.state as MonitorInput).scopeId === `${country}.attention`,
        ),
      ).toHaveLength(2);
    }
    for (const event of scenarios.markets.events.slice(1)) {
      act(() => app.events.ingest(event));
      await settle();
    }
    expect(
      Number(value(app.cells()["jp.attention.urgent"]!.data)),
    ).toBeLessThan(0.8);
  });

  it("keeps the concise attention input restricted to fixed questions, exposure and pressure bounds", () => {
    const input = normalizeMonitorInput({ pressure: 2, exposure: 0.85 });
    const body = { input, ids: ["jp.attention.urgent"] };
    expect(monitorRequestSchema.safeParse(body).success).toBe(true);
    expect(
      questionsFor("jp.attention")["jp.attention.urgent"]!.instructions,
    ).toBe(attentionQuestion);
    expect(
      monitorRequestSchema.safeParse({ ...body, ids: ["arbitrary.question"] })
        .success,
    ).toBe(false);
    expect(
      monitorRequestSchema.safeParse({
        ...body,
        input: { ...input, facts: { exposure: 1 } },
      }).success,
    ).toBe(false);
    expect(
      monitorRequestSchema.safeParse({
        ...body,
        input: { ...input, inherited: { "global.markets.stress": 4 } },
      }).success,
    ).toBe(false);
    expect(() => normalizeMonitorInput({ pressure: 2, exposure: 0.4 })).toThrow(
      "Unknown demo exposure",
    );
  });

  it("never activates an obsolete attention answer after a newer source event", async () => {
    let old: JudgmentRequest | undefined;
    let finish:
      | ((result: Awaited<ReturnType<BatchTransport>>) => void)
      | undefined;
    const transport = vi.fn<BatchTransport>(async (request) => {
      const input = request.state as MonitorInput;
      if (
        !old &&
        input.scopeId === "jp.attention" &&
        Number(input.inherited["global.markets.stress"]) > 0
      ) {
        old = request;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return { answers: mockMonitor(request), model: "fixtures" };
    });
    const app = mount(transport);
    await settle();
    act(() => app.events.ingest(scenarios.markets.events[0]!));
    await settle();
    expect(finish).toBeDefined();
    expect(app.cells()["jp.attention.urgent"]!.ready).toBe(false);
    expect(app.cells()["eu.attention.urgent"]!.ready).toBe(true);
    act(() => app.events.ingest(scenarios.markets.events.at(-1)!));
    await settle();
    const fresh = app.cells()["jp.attention.urgent"]!;
    expect(fresh.ready).toBe(true);
    expect(Number(value(fresh.data))).toBeLessThan(0.8);
    await act(async () =>
      finish!({ answers: mockMonitor(old!), model: "fixtures" }),
    );
    await settle();
    expect(app.cells()["jp.attention.urgent"]!.data).toBe(fresh.data);
    expect(
      app.runtime
        .getSnapshot()
        .traces.some((t) => t.scopeId === "jp.attention" && t.discarded),
    ).toBe(true);
  });

  it("settles all nodes without selection and batches compatible weather judgments in one request", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    expect(Object.keys(app.cells())).toHaveLength(nodeIds.length);
    expect(Object.values(app.cells()).every((c) => c.ready)).toBe(true);
    expect(value(app.cells()["global.attention"]?.data)).toBe("normal");
    const requests = transport.mock.calls.map(([r]) => r);
    expect(requests).toHaveLength(Object.keys(groups).length);
    const weather = requests.filter(
      (r) => (r.state as MonitorInput).scopeId === "jp.weather",
    );
    expect(weather).toHaveLength(1);
    expect(Object.keys(weather[0]!.questions)).toHaveLength(3);
    for (const r of requests)
      expect(
        monitorRequestSchema.safeParse({
          input: r.state,
          ids: Object.keys(r.questions),
        }).success,
      ).toBe(true);
  });
  it("propagates a US-only event through shared meaning into Japan and Europe without changing their facts", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    const before = app.events.getSnapshot().facts;
    transport.mockClear();
    act(() => app.events.ingest(scenarios.markets.events[0]!));
    await settle();
    const after = app.events.getSnapshot().facts;
    expect(after.countries.jp).toBe(before.countries.jp);
    expect(after.countries.eu).toBe(before.countries.eu);
    expect(after.events.every((e) => e.place === "us")).toBe(true);
    expect(value(app.cells()["country:jp.situation"]?.data)).toBe("economic");
    expect(value(app.cells()["region:europe.situation"]?.data)).toBe(
      "economic",
    );
    expect(value(app.cells()["global.attention"]?.data)).toBe("elevated");
    expect(
      Number(value(app.cells()["jp.spillover.pressure"]?.data)),
    ).toBeGreaterThan(
      Number(value(app.cells()["eu.spillover.pressure"]?.data)),
    );
    const requests = transport.mock.calls.map(([r]) => r);
    const ids = requests.map((r) => (r.state as MonitorInput).scopeId);
    for (const id of ["global.markets", "jp.spillover", "eu.spillover"]) {
      const batches = requests.filter(
        (r) => (r.state as MonitorInput).scopeId === id,
      );
      expect(batches).toHaveLength(1);
      expect(Object.keys(batches[0]!.questions)).toHaveLength(2);
    }
    expect(ids.indexOf("jp.spillover")).toBeGreaterThan(
      ids.indexOf("global.markets"),
    );
    expect(ids.indexOf("country:jp")).toBeGreaterThan(
      ids.indexOf("jp.spillover"),
    );
    for (const id of [
      "jp.weather",
      "jp.transport",
      "jp.markets",
      "energy",
      "country:kr",
      "country:cn",
    ])
      expect(ids).not.toContain(id);
    expect(
      app.cells()["jp.spillover.pressure"]?.input.inherited[
        "global.markets.stress"
      ],
    ).toBe(value(app.cells()["global.markets.stress"]?.data));
    for (const event of scenarios.markets.events.slice(1)) {
      act(() => app.events.ingest(event));
      await settle();
    }
    expect(app.events.getSnapshot().facts.countries.jp).toBe(
      before.countries.jp,
    );
    expect(value(app.cells()["country:jp.situation"]?.data)).toBe("normal");
    expect(value(app.cells()["region:europe.situation"]?.data)).toBe("normal");
    expect(value(app.cells()["jp.spillover.trend"]?.data)).toBe("improving");
  });

  it("accepts only the fixed scenario exposure and exact upstream dependencies", async () => {
    const app = mount();
    await settle();
    const cell = app.cells()["jp.spillover.pressure"]!;
    const body = { input: cell.input, ids: [cell.id] };
    expect(monitorRequestSchema.safeParse(body).success).toBe(true);
    expect(
      monitorRequestSchema.safeParse({
        ...body,
        input: { ...cell.input, facts: { ...cell.input.facts, exposure: 1 } },
      }).success,
    ).toBe(false);
    expect(
      monitorRequestSchema.safeParse({
        ...body,
        input: { ...cell.input, inherited: {} },
      }).success,
    ).toBe(false);
  });

  it("derives SDK edges that independently match the public endpoint allowlist", async () => {
    const app = mount();
    await settle();
    for (const cell of Object.values(app.cells())) {
      const group = Object.values(groups).find((g) =>
        Object.hasOwn(g.questions, cell.id),
      )!;
      expect([...cell.dependencies].sort()).toEqual(
        [...group.dependencies].sort(),
      );
      expect(cell.pass).toBe(depth(group));
      expect(
        monitorRequestSchema.safeParse({ input: cell.input, ids: [cell.id] })
          .success,
      ).toBe(true);
    }
  });
  it("runs dependent nodes in later passes and tracks real data dependencies", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    const ids = transport.mock.calls.map(
      ([r]) => (r.state as MonitorInput).scopeId,
    );
    expect(ids.indexOf("jp.transport")).toBeGreaterThan(
      ids.indexOf("jp.weather"),
    );
    expect(ids.indexOf("country:jp")).toBeGreaterThan(
      ids.indexOf("jp.transport"),
    );
    expect(ids.indexOf("region:asia")).toBeGreaterThan(
      ids.indexOf("country:jp"),
    );
    expect(ids.indexOf("global")).toBeGreaterThan(ids.indexOf("region:asia"));
    expect(app.cells()["global.attention"]?.pass).toBeGreaterThan(
      app.cells()["country:jp.situation"]!.pass,
    );
  });
  it("invalidates the transport branch after an event without rerunning unrelated weather, markets, Korea, or America", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    transport.mockClear();
    act(() => app.events.ingest(scenarios.weather.events[2]!));
    await settle();
    const ids = transport.mock.calls.map(
      ([r]) => (r.state as MonitorInput).scopeId,
    );
    expect(ids).toContain("jp.transport");
    expect(ids).toContain("country:jp");
    expect(ids).toContain("region:asia");
    expect(ids).toContain("global");
    expect(ids).not.toContain("jp.weather");
    expect(ids).not.toContain("aviation.cost");
    expect(ids).not.toContain("jp.markets");
    expect(ids).not.toContain("country:kr");
    expect(ids).not.toContain("country:us");
    expect(value(app.cells()["country:jp.situation"]?.data)).toBe("transport");
    expect(
      app
        .changes()
        .some(
          (c) =>
            c.semanticId === "country:jp.situation" &&
            c.from === "normal" &&
            c.to === "transport",
        ),
    ).toBe(true);
  });
  it("propagates an energy shock across geography into Japan imports, aviation and Europe", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    transport.mockClear();
    act(() => app.events.ingest(scenarios.energy.events[0]!));
    await settle();
    for (const id of [
      "energy.supplyRisk",
      "jp.imports.pressure",
      "eu.energy.pressure",
      "aviation.cost.pressure",
    ])
      expect(Number(value(app.cells()[id]?.data))).toBeGreaterThan(2);
    expect(value(app.cells()["country:jp.situation"]?.data)).toBe("economic");
    expect(value(app.cells()["region:europe.situation"]?.data)).toBe(
      "economic",
    );
    expect(
      transport.mock.calls.map(([r]) => (r.state as MonitorInput).scopeId),
    ).not.toContain("jp.weather");
  });
  it("settles every step of the energy replay, including the partial restoration", async () => {
    const app = mount();
    await settle();
    for (const event of scenarios.energy.events) {
      act(() => app.events.ingest(event));
      await settle();
      expect(Object.values(app.cells()).every((cell) => cell.ready)).toBe(true);
    }
    expect(app.events.getSnapshot().facts.events).toHaveLength(
      scenarios.energy.events.length,
    );
    expect(
      app.changes().some((c) => c.semanticId === "aviation.cost.pressure"),
    ).toBe(true);
    expect(app.changes().some((c) => c.eventIds.includes("energy:5"))).toBe(
      true,
    );
  });

  it("coalesces five rapid transport observations into one domain batch", async () => {
    const transport = adapter(),
      app = mount(transport);
    await settle();
    transport.mockClear();
    act(() => {
      for (let i = 0; i < 5; i++)
        app.events.ingest({
          ...scenarios.weather.events[2]!,
          id: `storm:${i}`,
          type: "transport_disruption",
          timestamp: `2026-09-20T09:03:0${i}.000Z`,
          payload: { cancelled: 40 + i, delayed: 70 },
        });
    });
    await settle();
    expect(app.events.getSnapshot().lastBurst).toBe(5);
    expect(
      transport.mock.calls.filter(
        ([r]) => (r.state as MonitorInput).scopeId === "jp.transport",
      ),
    ).toHaveLength(1);
    expect(
      app.events.getSnapshot().facts.countries.jp.transport.current.cancelled,
    ).toBe(44);
  });
  it("does not activate late weather answers or let blocked descendants commit old input", async () => {
    let resolveOld:
      | ((r: Awaited<ReturnType<BatchTransport>>) => void)
      | undefined;
    let oldRequest: JudgmentRequest | undefined;
    const transport = vi.fn<BatchTransport>(async (request) => {
      const input = request.state as MonitorInput;
      if (
        input.scopeId === "jp.weather" &&
        (input.facts.slice as any).current.warning === 2
      ) {
        oldRequest = request;
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return { answers: mockMonitor(request), model: "fixture" };
    });
    const app = mount(transport);
    await settle();
    act(() => app.events.ingest(scenarios.weather.events[0]!));
    await tick(450);
    expect(resolveOld).toBeDefined();
    expect(app.cells()["country:jp.situation"]?.status).toBe("blocked");
    act(() => app.events.ingest(scenarios.weather.events[1]!));
    await settle();
    expect(value(app.cells()["jp.weather.severity"]?.data)).toBe(2.4);
    await act(async () =>
      resolveOld!({ answers: mockMonitor(oldRequest!), model: "fixture" }),
    );
    await settle();
    expect(value(app.cells()["jp.weather.severity"]?.data)).toBe(2.4);
    expect(
      app.runtime
        .getSnapshot()
        .traces.some(
          (t) =>
            t.scopeId === "jp.weather" &&
            t.discarded &&
            t.discardedJudgments.length === 3,
        ),
    ).toBe(true);
  });
  it("updates subscribed consumers while unrelated memoized consumers stay stable", async () => {
    let usaRenders = 0;
    const USA = memo(function USA() {
      const cell = useSemantic("country:us.situation");
      usaRenders++;
      return <span>USA {value(cell?.data)}</span>;
    });
    function JP() {
      const cell = useSemantic("country:jp.situation");
      return <output>{value(cell?.data)}</output>;
    }
    const app = mount(
      adapter(),
      <>
        <USA />
        <JP />
      </>,
    );
    await settle();
    const before = usaRenders;
    act(() => app.events.ingest(scenarios.weather.events[2]!));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("transport");
    expect(usaRenders).toBe(before);
  });
  it("runs weather and market replay end-to-end with recovery, trend history and evidence", async () => {
    const app = mount();
    await settle();
    for (const event of scenarios.weather.events) {
      act(() => app.events.ingest(event));
      await settle();
    }
    expect(value(app.cells()["country:jp.situation"]?.data)).toBe("normal");
    expect(app.changes().some((c) => c.to === "improving")).toBe(true);
    expect(
      app
        .changes()
        .some(
          (c) =>
            c.semanticId === "jp.weather.severity" &&
            c.eventIds.includes("weather:5"),
        ),
    ).toBe(true);
    for (const event of scenarios.markets.events) {
      act(() => app.events.ingest(event));
      await settle();
    }
    expect(value(app.cells()["country:us.situation"]?.data)).toBe("normal");
    expect(
      Number(value(app.cells()["country:us.severity"]?.data)),
    ).toBeLessThan(1);
    expect(value(app.cells()["country:us.trend"]?.data)).toBe("improving");
  });
  it("reuses exact cached states after restart and isolates live and mock clients", async () => {
    const transport = adapter(),
      input = {
        kind: "weather",
        scopeId: "jp.weather",
        facts: projectFacts(groups["jp.weather"]!, initialFacts()),
        inherited: {},
      };
    const request = {
      state: input,
      questions: questionsFor("jp.weather"),
    } as JudgmentRequest;
    const mock = new MonitorRuntime("mock", transport),
      live = new MonitorRuntime("live", transport);
    const first = mock.evaluate(request);
    await tick(20);
    await first;
    const second = mock.evaluate(request);
    await tick(20);
    await second;
    expect(transport).toHaveBeenCalledTimes(1);
    const third = live.evaluate(request);
    await tick(20);
    await third;
    expect(transport).toHaveBeenCalledTimes(2);
    expect(mock.getSnapshot().traces[0]?.cached).toBe("browser");
    expect(live.getSnapshot().traces[0]?.source).toBe("jev");
  });
});

describe("single-screen event journey", () => {
  it("shows the actual hook, contrasting consequences, unchanged facts and a separate attention queue by default", async () => {
    const { App } = await import("../examples/monitor/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    expect(
      screen.getByRole("region", { name: "Facts to consequences experiment" }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Running attention hook").textContent,
    ).toContain("state: { pressure, exposure }");
    expect(
      screen.getByRole("status", { name: "Attention queue" }).textContent,
    ).toContain("0 regions to review");
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    await settle();
    expect(screen.getByText("Review Japan exposure")).toBeTruthy();
    expect(screen.getByText("Keep Europe on watch")).toBeTruthy();
    expect(screen.getAllByText("FACTS UNCHANGED")).toHaveLength(2);
    expect(
      screen.getByRole("status", { name: "Attention queue" }).textContent,
    ).toContain("1 region to review");
    const count = screen.getByText(/1 events · .* batches/).textContent;
    fireEvent.click(
      screen.getByRole("button", { name: "Explain Europe attention" }),
    );
    expect(
      screen.getByRole("heading", { name: "Europe interprets the signal." }),
    ).toBeTruthy();
    await settle();
    expect(screen.getByText(/1 events · .* batches/).textContent).toBe(count);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Inspect evidence, distribution & execution ↗",
      }),
    );
    expect(
      screen.getByRole("complementary", { name: "Permanent inspector" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "The experiment" }));
    fireEvent.click(screen.getByRole("button", { name: "History ↗" }));
    expect(
      screen.getByRole("complementary", { name: "Permanent inspector" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "The experiment" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart scenario" }));
    await settle();
    expect(
      screen.getByRole("status", { name: "Attention queue" }).textContent,
    ).toContain("0 regions to review");
  });

  it("links the three teaching steps to actual evidence and ambient component source without inference", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { App } = await import("../examples/monitor/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore full monitor" }),
    );
    const steps = within(
      screen.getByRole("navigation", { name: "How the SDK works" }),
    );
    const before = screen.getByText(/0 events · .* batches/).textContent;
    fireEvent.click(
      steps.getByRole("button", { name: /Meaning becomes ambient/ }),
    );
    expect(
      screen.getByLabelText("Running semantic source").textContent,
    ).toContain(
      "values={{ pressure: market.stress, marketTrend: market.trend }}",
    );
    fireEvent.click(
      steps.getByRole("button", { name: /Components interpret it/ }),
    );
    expect(
      screen.getByLabelText("Running semantic source").textContent,
    ).toContain("useAmbient<SemanticResult<ScoreAnswer>>");
    expect(
      screen.getByLabelText("Running semantic source").textContent,
    ).toContain("useScore(");
    expect(screen.getByLabelText("Current execution").textContent).toContain(
      "UI UPDATED",
    );
    fireEvent.click(
      steps.getByRole("button", { name: /An event changes facts/ }),
    );
    expect(
      screen.getByRole("heading", { name: "The source event" }),
    ).toBeTruthy();
    await settle();
    expect(screen.getByText(/0 events · .* batches/).textContent).toBe(before);
    expect(
      screen.getByRole("img", {
        name: "Geographic world map with semantic propagation",
      }),
    ).toBeTruthy();
  });

  it("keeps the graph beside an inspector; selection, answers, source, diagnostics and history do not launch inference", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { App } = await import("../examples/monitor/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore full monitor" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Inspect Japan · pressure" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const inspector = within(
      screen.getByRole("complementary", { name: "Permanent inspector" }),
    );
    expect(
      inspector
        .getByRole("tab", { name: "Inputs" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      inspector.getByText("Local facts · unchanged by US events"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    await settle();
    expect(
      screen.getByRole("button", { name: "Inspect Japan · pressure" })
        .textContent,
    ).toContain("1.79");
    expect(inspector.getByText("0%")).toBeTruthy();
    const count = screen.getByText(/1 events · .* batches/).textContent;
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Europe · pressure" }),
    );
    expect(
      inspector.getByRole("heading", { name: "Europe · pressure" }),
    ).toBeTruthy();
    fireEvent.click(inspector.getByRole("tab", { name: "Answer" }));
    expect(
      inspector.getByText(
        /How much potential economic pressure reaches Europe/,
        { selector: "p" },
      ),
    ).toBeTruthy();
    fireEvent.click(inspector.getByRole("tab", { name: "Code" }));
    expect(
      inspector.getByLabelText("Running semantic source").textContent,
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect source event" }),
    );
    expect(inspector.getByText(/markets:1/, { selector: "pre" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Japan · pressure" }),
    );
    fireEvent.click(inspector.getByRole("button", { name: "Open full trace" }));
    fireEvent.click(inspector.getByRole("tab", { name: "trace" }));
    expect(
      inspector.getAllByText(/jp.spillover/, { selector: "summary span" })
        .length,
    ).toBeGreaterThan(0);
    fireEvent.click(inspector.getByRole("button", { name: "← Back to value" }));
    fireEvent.click(screen.getByRole("button", { name: "History ↗" }));
    expect(
      screen.getByRole("region", { name: "Event and semantic timeline" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect shared usage" }),
    );
    expect(
      screen.getByRole("region", { name: "Shared demo usage" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "World semantic map" }),
    ).toBeTruthy();
    await settle();
    expect(screen.getByText(/1 events · .* batches/).textContent).toBe(count);
  });

  it("keeps map selection, focus, keyboard activation and graph switching free of inference", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { App } = await import("../examples/monitor/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore full monitor" }),
    );
    expect(
      screen
        .getByRole("tab", { name: "World map" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("img", {
        name: "Geographic world map with semantic propagation",
      }),
    ).toBeTruthy();
    const before = screen.getByText(/0 events · 21 batches/).textContent;
    fireEvent.keyDown(screen.getByRole("button", { name: "Map: Europe" }), {
      key: "Enter",
    });
    expect(
      screen.getByRole("heading", { name: "Europe · pressure" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Focus selected region" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Focus selected region" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Dependency graph" }));
    expect(
      screen.getByRole("region", { name: "Event dependency graph" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Inspect Europe · pressure" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "World map" }));
    fireEvent.click(screen.getByRole("button", { name: "Map: Japan" }));
    expect(
      screen.getByRole("heading", { name: "Japan · pressure" }),
    ).toBeTruthy();
    await settle();
    expect(screen.getByText(/0 events · 21 batches/).textContent).toBe(before);
  });

  it("opens legacy #dev links in the inline Code tab without removing the graph", async () => {
    const { App } = await import("../examples/monitor/App.js");
    window.history.replaceState(null, "", "#dev");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore full monitor" }),
    );
    expect(
      screen.getByRole("tab", { name: "Code" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("region", { name: "World semantic map" }),
    ).toBeTruthy();
  });

  it("starts paused, resets the selected branch, and stops old replay timers on scenario changes", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { App } = await import("../examples/monitor/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ live: false })),
    );
    render(<App />);
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Explore full monitor" }),
    );
    await tick(6500);
    expect(screen.getByText(/0 events · 21 batches/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Reduce interface motion" }),
    );
    expect(screen.getByRole("main").getAttribute("data-motion")).toBe("off");
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Restart scenario" }));
    await settle();
    expect(screen.getByText(/0 events · .* batches/)).toBeTruthy();
    fireEvent.click(screen.getByText("Replay", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto play" }));
    await tick(1000);
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario" }), {
      target: { value: "weather" },
    });
    await tick(6500);
    expect(screen.getByText(/0 events · .* batches/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Inspect Weather · severity" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Auto play" }));
    await tick(6500);
    await settle();
    expect(screen.getByText(/1 events · .* batches/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "History ↗" }));
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(
      screen.getByText(/Japan weather bulletin/, { selector: "strong" }),
    ).toBeTruthy();
  });
});
