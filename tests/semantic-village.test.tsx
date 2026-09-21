// @vitest-environment jsdom
import { memo, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JevProvider,
  SemanticScope,
  useAmbient,
  useChoice,
} from "../src/react/index.js";
import {
  SemanticRuntime,
  type BatchTransport,
} from "../examples/village/semantic/runtime.js";
import { mockSemantics } from "../examples/village/semantic/mock.js";
import {
  questions,
  questionsFor,
  villageInput,
  districtInput,
  familyInput,
  personInput,
  villageRequestSchema,
} from "../examples/village/semantic/contract.js";
import { useVillageSemantics } from "../examples/village/semantic/providers.js";
import {
  reduceWorld,
  scenario,
  seedWorld,
} from "../examples/village/simulation/world.js";
import { useLensController } from "../examples/village/scene/lens.js";
import type { JudgmentRequest } from "../src/adapters/adapter.js";
import type { RuntimeAnswer } from "../src/types.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function tick(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const ancestors = {
  "village.mood": "stable",
  "village.concern": "none",
  "village.trust": 1.7,
};
const wrap =
  (runtime: SemanticRuntime) =>
  ({ children }: { children: ReactNode }) => (
    <JevProvider client={runtime}>{children}</JevProvider>
  );
const adapter = () =>
  vi.fn<BatchTransport>(async (request) => ({
    answers: mockSemantics(request),
    model: "test-fixtures",
  }));
async function evaluate(
  runtime: SemanticRuntime,
  input: ReturnType<typeof villageInput>,
) {
  const promise = runtime.evaluate({
    state: input,
    questions: questionsFor(input.kind),
  });
  await tick();
  return promise;
}

describe("ambient lexical scopes", () => {
  it("inherits, adds, shadows deterministically, and cleans up on unmount", () => {
    function Consumer() {
      return (
        <output>
          {useAmbient<string>("village.mood")}/
          {useAmbient<string>("district.mood") ?? "absent"}
        </output>
      );
    }
    function View({ inner }: { inner: boolean }) {
      return (
        <SemanticScope values={{ "village.mood": "anxious" }}>
          {inner ? (
            <SemanticScope values={{ "district.mood": "angry" }}>
              <Consumer />
            </SemanticScope>
          ) : (
            <Consumer />
          )}
          <SemanticScope values={{ "village.mood": "hopeful" }}>
            <Consumer />
          </SemanticScope>
        </SemanticScope>
      );
    }
    const { rerender, unmount } = render(<View inner />);
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual([
      "anxious/angry",
      "hopeful/absent",
    ]);
    rerender(<View inner={false} />);
    expect(screen.getAllByRole("status")[0]!.textContent).toBe(
      "anxious/absent",
    );
    unmount();
    render(<Consumer />);
    expect(screen.getByRole("status").textContent).toBe("/absent");
  });
  it("updates consumers of the changed key without notifying an unrelated memoized consumer", () => {
    const rendered = vi.fn();
    const Consumer = memo(function Consumer() {
      rendered();
      return <output>{useAmbient<string>("village.mood")}</output>;
    });
    const { rerender } = render(
      <SemanticScope values={{ "village.mood": "stable", "person.health": 90 }}>
        <Consumer />
      </SemanticScope>,
    );
    rerender(
      <SemanticScope values={{ "village.mood": "stable", "person.health": 60 }}>
        <Consumer />
      </SemanticScope>,
    );
    expect(rendered).toHaveBeenCalledTimes(1);
    rerender(
      <SemanticScope
        values={{ "village.mood": "anxious", "person.health": 60 }}
      >
        <Consumer />
      </SemanticScope>,
    );
    expect(screen.getByRole("status").textContent).toBe("anxious");
  });
});

describe("React hook batching, caching and races", () => {
  it("batches village Choice/Choice/Score declarations into one adapter call", async () => {
    const transport = adapter(),
      runtime = new SemanticRuntime("mock", transport);
    const { result } = renderHook(
      () => useVillageSemantics(villageInput(seedWorld())),
      { wrapper: wrap(runtime) },
    );
    await tick(150);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(Object.keys(transport.mock.calls[0]![0].questions).sort()).toEqual(
      Object.keys(questions.village).sort(),
    );
    expect(result.current["village.mood"].data?.choice).toBe("stable");
    expect(runtime.getSnapshot().traces[0]).toMatchObject({
      pass: 1,
      status: "ready",
      source: "mock",
    });
  });
  it("does not invalidate village concern when only a person's health changes", async () => {
    const transport = adapter(),
      runtime = new SemanticRuntime("mock", transport),
      world = seedWorld();
    const { rerender } = renderHook(
      ({ state }) => useVillageSemantics(villageInput(state)),
      { wrapper: wrap(runtime), initialProps: { state: world } },
    );
    await tick(150);
    const next = structuredClone(world);
    next.people.mara!.health = 20;
    rerender({ state: next });
    await tick(150);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(villageInput(next)).toEqual(villageInput(world));
  });
  it("reuses Market after Docks, then invalidates the affected branch after a tax change", async () => {
    const transport = adapter(),
      runtime = new SemanticRuntime("mock", transport),
      world = seedWorld();
    await evaluate(runtime, districtInput(world, "market", ancestors));
    await evaluate(runtime, districtInput(world, "docks", ancestors));
    await evaluate(runtime, districtInput(world, "market", ancestors));
    expect(transport).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().traces[0]?.cached).toBe("browser");
    const taxed = reduceWorld(world, "raise-tax");
    const root = await evaluate(runtime, villageInput(taxed));
    const project = (answer: RuntimeAnswer) =>
      answer.type === "choice"
        ? answer.choice
        : answer.type === "score"
          ? answer.score
          : answer.noul;
    const market = await evaluate(
      runtime,
      districtInput(
        taxed,
        "market",
        Object.fromEntries(
          Object.entries(root).map(([key, value]) => [key, project(value)]),
        ),
      ),
    );
    expect(market["district.mood"]).toMatchObject({ choice: "angry" });
    expect(runtime.getSnapshot().traces[0]?.invalidated).toEqual(
      expect.arrayContaining(["district.mood", "district.pressure"]),
    );
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("caches a late Market answer without replacing a newly selected Docks result", async () => {
    const releases = new Map<string, () => void>();
    const transport: BatchTransport = (request) =>
      new Promise((resolve) => {
        releases.set((request.state as { scopeId: string }).scopeId, () =>
          resolve({ answers: mockSemantics(request) }),
        );
      });
    const runtime = new SemanticRuntime("mock", transport),
      world = seedWorld(),
      q = questions.district["district.mood"];
    const { result, rerender } = renderHook(
      ({ input }) =>
        useChoice(
          "district.mood",
          { state: input, question: q.instructions, options: q.criteria },
          { debounceMs: 0 },
        ),
      {
        wrapper: wrap(runtime),
        initialProps: { input: districtInput(world, "market", ancestors) },
      },
    );
    await tick();
    const docks = districtInput(world, "docks", {
      ...ancestors,
      "village.mood": "hopeful",
    });
    rerender({ input: docks });
    await tick();
    await act(async () => releases.get("district:docks")!());
    expect(result.current.data?.choice).toBe("optimistic");
    await act(async () => releases.get("district:market")!());
    expect(result.current.data?.choice).toBe("optimistic");
    rerender({ input: districtInput(world, "market", ancestors) });
    await tick();
    expect(result.current.data?.choice).toBe("calm");
    expect(runtime.getSnapshot().traces[0]?.cached).toBe("browser");
  });
  it("keeps mock/live cache instances separate and preserves full distributions", async () => {
    const transport = adapter(),
      mock = new SemanticRuntime("mock", transport),
      live = new SemanticRuntime("live", transport);
    const input = villageInput(seedWorld());
    await evaluate(mock, input);
    await evaluate(live, input);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(mock.getSnapshot().traces[0]?.source).toBe("mock");
    expect(live.getSnapshot().traces[0]?.source).toBe("jev");
    expect(
      live.getSnapshot().traces[0]?.result?.["village.trust"],
    ).toHaveProperty("probabilities");
  });
  it("does not call the adapter for a scope abandoned before its batch starts", async () => {
    const transport = adapter(),
      runtime = new SemanticRuntime("mock", transport),
      controller = new AbortController();
    const promise = runtime.evaluate(
      { state: villageInput(seedWorld()), questions: questionsFor("village") },
      { signal: controller.signal },
    );
    const caught = promise.catch((error) => error);
    controller.abort();
    await tick();
    await caught;
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("deterministic world and semantic lens", () => {
  it("has fifteen named residents and a deterministic crisis/recovery scenario with valid server inputs", () => {
    const first = seedWorld(),
      original = structuredClone(first);
    expect(Object.keys(first.people)).toHaveLength(15);
    const stages = scenario.reduce(
      (states, action) => [...states, reduceWorld(states.at(-1)!, action)],
      [first],
    );
    expect(first).toEqual(original);
    expect(stages[1]!.taxRate).toBe(0.24);
    expect(stages[4]!.foodSupply).toBe(20);
    expect(stages[5]!.foodSupply).toBe(44);
    for (const world of stages)
      expect(
        villageRequestSchema.safeParse({
          input: villageInput(world),
          ids: Object.keys(questions.village),
        }).success,
      ).toBe(true);
    expect(reduceWorld(seedWorld(), "raise-tax")).toEqual(stages[1]);
  });
  it("passes projected ancestor meaning down a four-pass scenario without putting semantics into facts", async () => {
    const runtime = new SemanticRuntime("mock", adapter()),
      world = reduceWorld(seedWorld(), "raise-tax");
    const root = await evaluate(runtime, villageInput(world));
    const project = (answers: Readonly<Record<string, RuntimeAnswer>>) =>
      Object.fromEntries(
        Object.entries(answers).map(([key, a]) => [
          key,
          a.type === "choice"
            ? a.choice
            : a.type === "score"
              ? a.score
              : a.noul,
        ]),
      );
    let inherited = project(root);
    inherited = {
      ...inherited,
      ...project(
        await evaluate(runtime, districtInput(world, "market", inherited)),
      ),
    };
    inherited = {
      ...inherited,
      ...project(
        await evaluate(runtime, familyInput(world, "venn", inherited)),
      ),
    };
    const person = await evaluate(
      runtime,
      personInput(world, "mara", inherited),
    );
    expect(person["person.attitude"]).toMatchObject({ type: "choice" });
    expect(person["person.secure"]).toMatchObject({ type: "noul" });
    expect(runtime.getSnapshot().traces.map((t) => t.pass)).toEqual([
      4, 3, 2, 1,
    ]);
    expect(world).not.toHaveProperty("mood");
    expect(world.people.mara).not.toHaveProperty("attitude");
  });
  it("makes hover immediate visually, deliberate semantically, and pinning independent of raw state", async () => {
    const world = seedWorld(),
      snapshot = JSON.stringify(world);
    const { result, unmount } = renderHook(useLensController);
    act(() => result.current.hover("district:market"));
    expect(result.current.hovered).toBe("district:market");
    expect(result.current.selected).toBe("village");
    await tick(160);
    expect(result.current.selected).toBe("district:market");
    act(() => result.current.hover("person:mara"));
    await tick(160);
    expect(result.current.selected).toBe("person:mara");
    act(() => result.current.pin("person:mara"));
    act(() => result.current.hover("district:docks"));
    await tick(300);
    expect(result.current.selected).toBe("person:mara");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(result.current.selected).toBe("village");
    expect(JSON.stringify(world)).toBe(snapshot);
    unmount();
  });
});

describe("selected-scope inspector portal", () => {
  it("keeps Mara pinned while clicking the actual trace and code panels", async () => {
    const { App } = await import("../examples/village/App.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/config")
          ? Response.json({ live: false })
          : Response.json({}, { status: 503 }),
      ),
    );
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByRole("button", { name: "03 Meet Mara" }));
    for (let i = 0; i < 5; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
    fireEvent.click(screen.getByRole("button", { name: "DEV" }));
    fireEvent.click(screen.getByRole("tab", { name: "trace" }));
    expect(screen.getByRole("heading", { name: "Mara" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "trace" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "code" }));
    expect(screen.getByRole("heading", { name: "Mara" })).toBeTruthy();
    expect(screen.getByText(/export function usePersonSemantics/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Village" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pin lens" }));
    expect(screen.getByRole("button", { name: "Unpin lens" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("img", { name: "Interactive Semantic Village map" }),
    );
    expect(screen.getByRole("button", { name: "Pin lens" })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
