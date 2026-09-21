// @vitest-environment jsdom
import { StrictMode, memo, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJevClient,
  JevProvider,
  useScore,
  useNoul,
  useChoice,
  SemanticScope,
  useAmbient,
  type SemanticResult,
  type ScoreAnswer,
  type JevClient,
  BatchedJevClient,
} from "../src/react/index.js";
import { MockJudgmentAdapter } from "../src/adapters/mock.js";
import type { JudgmentRequest } from "../src/adapters/adapter.js";
import type { RuntimeAnswer } from "../src/types.js";
const options = { debounceMs: 0 };
const score = (state: unknown) => ({
  state,
  question: "Pressure?",
  levels: ["Normal", "Severe"] as const,
});
const noul = (state: unknown) => ({ state, question: "Attention?" });
const wrapper = (client: JevClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StrictMode>
        <JevProvider client={client}>{children}</JevProvider>
      </StrictMode>
    );
  };
async function tick(ms = 20) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function settle() {
  for (let i = 0; i < 5; i++) await tick();
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function answers(
  request: JudgmentRequest,
  n = 0.7,
): Record<string, RuntimeAnswer> {
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, q]) => [
      id,
      q.type === "score"
        ? { type: "score", score: n }
        : q.type === "noul"
          ? { type: "noul", noul: n }
          : { type: "choice", choice: Object.keys(q.criteria)[0]! },
    ]),
  );
}

describe("nameless semantic composition", () => {
  it("batches independent unnamed hooks and discovers nested references in later passes", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      () => {
        const pressure = useScore(score({ move: -4 }), options);
        const urgent = useNoul(noul({ move: -4 }), options);
        const outlook = useChoice(
          {
            state: { evidence: [{ pressure, urgent }] },
            question: "Outlook?",
            options: { watch: "Watch", calm: "Calm" },
          },
          options,
        );
        const choice: "watch" | "calm" | undefined = outlook.data?.choice;
        return { pressure, urgent, outlook, choice };
      },
      { wrapper: wrapper(createJevClient({ adapter })) },
    );
    expect(hook.result.current.outlook.semantic.status).toBe("blocked");
    await settle();
    expect(adapter.calls).toHaveLength(2);
    expect(
      Object.values(adapter.calls[0]!.questions)
        .map((q) => q.type)
        .sort(),
    ).toEqual(["noul", "score"]);
    expect(adapter.calls[1]!.state).toEqual({
      evidence: [
        {
          pressure: hook.result.current.pressure.data,
          urgent: hook.result.current.urgent.data,
        },
      ],
    });
    expect(
      hook.result.current.outlook.semantic.dependencies.map((d) => d.id),
    ).toEqual([
      hook.result.current.pressure.semantic.id,
      hook.result.current.urgent.semantic.id,
    ]);
    expect(hook.result.current.outlook.semantic.pass).toBe(2);
    expect(hook.result.current.choice).toBe("calm");
  });

  it("can compose a reference as the entire state without a placeholder or enabled flag", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      () => {
        const pressure = useScore(score({}), options);
        const urgency = useNoul(noul(pressure), options);
        return { pressure, urgency };
      },
      { wrapper: wrapper(createJevClient({ adapter })) },
    );
    expect(hook.result.current.urgency.semantic.status).toBe("blocked");
    await settle();
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]!.state).toEqual(hook.result.current.pressure.data);
    expect(hook.result.current.urgency.semantic.status).toBe("ready");
  });

  it("keeps identity stable, treats labels as annotations, and reuses an equivalent remounted judgment", async () => {
    const adapter = new MockJudgmentAdapter();
    const client = createJevClient({ adapter });
    const hook = renderHook(
      ({ label, n }) => useScore({ ...score({ n }), label }, options),
      { wrapper: wrapper(client), initialProps: { label: "A", n: 1 } },
    );
    await settle();
    const id = hook.result.current.semantic.id;
    hook.rerender({ label: "B", n: 1 });
    await settle();
    expect(hook.result.current.semantic.id).toBe(id);
    expect(hook.result.current.semantic.label).toBe("B");
    expect(adapter.calls).toHaveLength(1);
    hook.unmount();
    const next = renderHook(() => useScore(score({ n: 1 }), options), {
      wrapper: wrapper(client),
    });
    await settle();
    expect(next.result.current.semantic.id).not.toBe(id);
    expect(next.result.current.data?.score).toBe(1);
    expect(adapter.calls).toHaveLength(1);
  });

  it("does not merge identities because labels match, and only updates the changed branch", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      ({ n }) => {
        const a = useScore({ ...score({ n }), label: "same" }, options);
        const b = useScore({ ...score({ n: 8 }), label: "same" }, options);
        return { a, b };
      },
      {
        wrapper: wrapper(createJevClient({ adapter })),
        initialProps: { n: 1 },
      },
    );
    await settle();
    const b = hook.result.current.b;
    expect(hook.result.current.a.semantic.id).not.toBe(b.semantic.id);
    hook.rerender({ n: 2 });
    await settle();
    expect(adapter.calls).toHaveLength(3);
    expect(hook.result.current.b).toBe(b);
  });

  it("blocks the whole dependent chain while fresh evidence is pending and ignores late results", async () => {
    let old:
      | {
          request: JudgmentRequest;
          resolve: (answers: Record<string, RuntimeAnswer>) => void;
        }
      | undefined;
    const adapter = new MockJudgmentAdapter(async (request) => {
      if ((request.state as { n?: number }).n === 2)
        return new Promise((resolve) => {
          old = { request, resolve };
        });
      return answers(
        request,
        (request.state as { n?: number }).n === 3 ? 0.9 : 0.2,
      );
    });
    const hook = renderHook(
      ({ n }) => {
        const a = useScore(score({ n }), options);
        const b = useNoul(noul({ pressure: a }), options);
        const c = useScore(
          { ...score({ b }), question: "Downstream?" },
          options,
        );
        return { a, b, c };
      },
      {
        wrapper: wrapper(createJevClient({ adapter })),
        initialProps: { n: 1 },
      },
    );
    await settle();
    hook.rerender({ n: 2 });
    expect(hook.result.current.b.semantic.status).toBe("blocked");
    expect(hook.result.current.c.semantic.status).toBe("blocked");
    expect(hook.result.current.b.stale).toBe(true);
    await tick();
    hook.rerender({ n: 3 });
    await settle();
    await act(async () => old!.resolve(answers(old!.request, 0.4)));
    await settle();
    expect(hook.result.current.a.data?.score).toBe(0.9);
    expect(hook.result.current.b.semantic.input).toEqual({
      pressure: { type: "score", score: 0.9 },
    });
    expect(hook.result.current.c.semantic.status).toBe("ready");
  });

  it("narrows a dependency with select without losing lineage or paying for unchanged selected values", async () => {
    const adapter = new MockJudgmentAdapter((request) => answers(request, 0.5));
    const hook = renderHook(
      ({ n }) => {
        const a = useScore(score({ n }), options);
        const b = useNoul(
          noul({ pressure: a.select((answer) => answer.score) }),
          options,
        );
        return { a, b };
      },
      {
        wrapper: wrapper(createJevClient({ adapter })),
        initialProps: { n: 1 },
      },
    );
    await settle();
    expect(hook.result.current.b.semantic.input).toEqual({ pressure: 0.5 });
    hook.rerender({ n: 2 });
    await settle();
    expect(adapter.calls).toHaveLength(3); // two root inputs, one dependent interpretation
    expect(hook.result.current.b.semantic.dependencies[0]?.id).toBe(
      hook.result.current.a.semantic.id,
    );
  });

  it("propagates references through ambient scope and leaves unrelated subscribers alone", async () => {
    const adapter = new MockJudgmentAdapter((request) =>
      answers(request, Number((request.state as { n?: number }).n ?? 0.7)),
    );
    let unrelatedRenders = 0;
    const Unrelated = memo(function Unrelated() {
      useAmbient("constant");
      unrelatedRenders++;
      return null;
    });
    const Child = memo(function Child() {
      const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure")!;
      const urgency = useNoul(noul({ pressure }), options);
      return <output>{JSON.stringify(urgency.semantic.input)}</output>;
    });
    function Parent({ n }: { n: number }) {
      const pressure = useScore(score({ n }), options);
      return (
        <SemanticScope values={{ pressure, constant: 1 }}>
          <Child />
          <Unrelated />
        </SemanticScope>
      );
    }
    const view = render(<Parent n={0.1} />, {
      wrapper: wrapper(createJevClient({ adapter })),
    });
    await settle();
    const count = unrelatedRenders;
    view.rerender(<Parent n={0.9} />);
    await settle();
    expect(screen.getByRole("status").textContent).toContain('"score":0.9');
    expect(unrelatedRenders).toBe(count);
  });

  it("propagates upstream errors without inference against absent answers and recovers on refresh", async () => {
    let fail = true;
    const adapter = new MockJudgmentAdapter((request) => {
      if (fail) throw new Error("offline");
      return answers(request);
    });
    const hook = renderHook(
      () => {
        const a = useScore(score({}), options);
        const b = useNoul(noul({ a }), options);
        return { a, b };
      },
      { wrapper: wrapper(createJevClient({ adapter })) },
    );
    await settle();
    expect(hook.result.current.b.semantic.status).toBe("blocked");
    expect(hook.result.current.b.error?.message).toBe("offline");
    expect(adapter.calls).toHaveLength(1);
    fail = false;
    act(() => hook.result.current.a.refetch());
    await settle();
    expect(hook.result.current.b.semantic.status).toBe("ready");
    expect(adapter.calls).toHaveLength(3);
  });

  it("explicit refresh bypasses the cache once; subsequent inputs can reuse their cache", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(({ n }) => useScore(score({ n }), options), {
      wrapper: wrapper(createJevClient({ adapter })),
      initialProps: { n: 1 },
    });
    await settle();
    act(() => hook.result.current.refetch());
    await settle();
    hook.rerender({ n: 2 });
    await settle();
    hook.rerender({ n: 1 });
    await settle();
    expect(adapter.calls).toHaveLength(3);
  });

  it("deduplicates equivalent unnamed questions in one batch, partitions definitions and expires cached answers", async () => {
    const send = vi.fn(async (request: JudgmentRequest) => ({
      answers: answers(request),
    }));
    const client = new BatchedJevClient(send, { cacheTimeMs: 40 });
    const q = { type: "noul" as const, instructions: "Attention?" };
    const first = client.evaluate({ state: {}, questions: { a: q } });
    const second = client.evaluate({ state: {}, questions: { b: q } });
    await tick();
    expect(await first).toEqual({ a: { type: "noul", noul: 0.7 } });
    expect(await second).toEqual({ b: { type: "noul", noul: 0.7 } });
    expect(Object.keys(send.mock.calls[0]![0].questions)).toHaveLength(1);
    const hit = client.evaluate({ state: {}, questions: { c: q } });
    await tick();
    await hit;
    expect(send).toHaveBeenCalledTimes(1);
    await tick(50);
    const miss = client.evaluate({ state: {}, questions: { d: q } });
    await tick();
    await miss;
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rejects getters in compositional state without running them", () => {
    const getter = vi.fn();
    expect(() =>
      renderHook(
        () => {
          const pressure = useScore(score({}), options);
          return useNoul(
            noul({
              pressure,
              get bad() {
                return getter();
              },
            }),
            options,
          );
        },
        {
          wrapper: wrapper(
            createJevClient({ adapter: new MockJudgmentAdapter() }),
          ),
        },
      ),
    ).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
  });
});
