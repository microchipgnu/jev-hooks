// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import {
  createJevClient,
  JevProvider,
  MockJudgmentAdapter,
  useChoice,
  useNoul,
  useScore,
  type JevClient,
} from "../src/react/index.js";
import type { RuntimeAnswer } from "../src/types.js";

const config = (state: unknown) => ({ state, question: "Is this urgent?" });
const answer = (noul: number) => ({ urgent: { type: "noul" as const, noul } });
const wrap = (client: JevClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StrictMode>
        <JevProvider client={client}>{children}</JevProvider>
      </StrictMode>
    );
  };
async function tick(ms = 12) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("React state-driven judgments", () => {
  it("hides previous session data when the client changes", async () => {
    const first = createJevClient({
      adapter: new MockJudgmentAdapter(() => answer(0.2)),
    });
    const second = createJevClient({
      adapter: new MockJudgmentAdapter(() => answer(0.9)),
    });
    const hook = renderHook(
      ({ client }) => useNoul("urgent", config({}), { client, debounceMs: 50 }),
      { initialProps: { client: first } },
    );
    await tick(62);
    expect(hook.result.current.data?.noul).toBe(0.2);
    hook.rerender({ client: second });
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.pending).toBe(true);
    await tick(62);
    expect(hook.result.current.data?.noul).toBe(0.9);
  });
  it("debounces rapid state changes and survives Strict Mode without duplicate calls", async () => {
    const adapter = new MockJudgmentAdapter();
    const client = createJevClient({ adapter });
    const hook = renderHook(({ text }) => useNoul("urgent", config({ text })), {
      wrapper: wrap(client),
      initialProps: { text: "a" },
    });
    expect(hook.result.current.pending).toBe(true);
    await tick(200);
    hook.rerender({ text: "b" });
    await tick(200);
    hook.rerender({ text: "c" });
    await tick(299);
    expect(adapter.calls).toHaveLength(0);
    await tick(13);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]!.state).toEqual({ text: "c" });
    expect(hook.result.current.data?.noul).toBe(0.75);
    expect(hook.result.current.pending).toBe(false);
  });

  it("does not refetch for equivalent objects or property order", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      ({ state }) => useNoul("urgent", config(state), { debounceMs: 0 }),
      {
        wrapper: wrap(createJevClient({ adapter })),
        initialProps: { state: { a: 1, b: 2 } },
      },
    );
    await tick();
    hook.rerender({ state: { b: 2, a: 1 } });
    await tick(500);
    expect(adapter.calls).toHaveLength(1);
  });

  it("keeps previous data and ignores an older response arriving last", async () => {
    const resolvers: ((value: Record<string, RuntimeAnswer>) => void)[] = [];
    const adapter = new MockJudgmentAdapter(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const hook = renderHook(
      ({ text }) => useNoul("urgent", config({ text }), { debounceMs: 0 }),
      {
        wrapper: wrap(createJevClient({ adapter })),
        initialProps: { text: "first" },
      },
    );
    await tick();
    await act(async () => resolvers[0]!(answer(0.1)));
    hook.rerender({ text: "second" });
    expect(hook.result.current.data?.noul).toBe(0.1);
    expect(hook.result.current.stale).toBe(true);
    await tick();
    hook.rerender({ text: "third" });
    await tick();
    await act(async () => resolvers[2]!(answer(0.9)));
    await act(async () => resolvers[1]!(answer(0.2)));
    expect(hook.result.current.data?.noul).toBe(0.9);
    expect(hook.result.current.stale).toBe(false);
  });

  it("can hide previous data and disable calls", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      ({ text, enabled }) =>
        useNoul("urgent", config({ text }), {
          enabled,
          keepPreviousData: false,
          debounceMs: 50,
        }),
      {
        wrapper: wrap(createJevClient({ adapter })),
        initialProps: { text: "a", enabled: false },
      },
    );
    await tick(100);
    expect(adapter.calls).toHaveLength(0);
    expect(hook.result.current.pending).toBe(false);
    hook.rerender({ text: "a", enabled: true });
    await tick(62);
    expect(hook.result.current.data?.noul).toBe(0.75);
    hook.rerender({ text: "b", enabled: true });
    expect(hook.result.current.data).toBeUndefined();
    hook.rerender({ text: "b", enabled: false });
    await tick(100);
    expect(adapter.calls).toHaveLength(1);
  });

  it("refetches explicitly and recovers from errors without automatic paid retries", async () => {
    const evaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(answer(0.6));
    const hook = renderHook(
      () => useNoul("urgent", config({}), { debounceMs: 0 }),
      { wrapper: wrap(createJevClient({ adapter: { evaluate } })) },
    );
    await tick();
    expect(hook.result.current.error?.message).toBe("offline");
    expect(hook.result.current.pending).toBe(false);
    await tick(2000);
    expect(evaluate).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.refetch());
    await tick();
    expect(hook.result.current.data?.noul).toBe(0.6);
    expect(hook.result.current.error).toBeUndefined();
  });

  it("cancels pending timers on unmount and signals in-flight adapters", async () => {
    const signals: AbortSignal[] = [];
    const evaluate = vi.fn((_request, context) => {
      signals.push(context.signal);
      return new Promise<Record<string, RuntimeAnswer>>(() => {});
    });
    const client = createJevClient({ adapter: { evaluate } });
    const first = renderHook(() => useNoul("urgent", config({})), {
      wrapper: wrap(client),
    });
    first.unmount();
    await tick(1000);
    expect(evaluate).not.toHaveBeenCalled();
    const second = renderHook(
      () => useNoul("urgent", config({}), { debounceMs: 0 }),
      { wrapper: wrap(client) },
    );
    await tick();
    second.unmount();
    expect(signals[0]!.aborted).toBe(true);
  });

  it("shares identical in-flight requests without cancelling another subscriber", async () => {
    let resolve!: (value: Record<string, RuntimeAnswer>) => void;
    const adapter = new MockJudgmentAdapter(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const wrapper = wrap(createJevClient({ adapter }));
    const first = renderHook(
      () => useNoul("urgent", config({}), { debounceMs: 0 }),
      { wrapper },
    );
    const second = renderHook(
      () => useNoul("urgent", config({}), { debounceMs: 0 }),
      { wrapper },
    );
    await tick();
    expect(adapter.calls).toHaveLength(1);
    first.unmount();
    await act(async () => resolve(answer(0.8)));
    expect(second.result.current.data?.noul).toBe(0.8);
  });

  it("does not mix different hooks with the same ID", async () => {
    const adapter = new MockJudgmentAdapter((request) =>
      answer((request.state as { n: number }).n),
    );
    const wrapper = wrap(createJevClient({ adapter }));
    const first = renderHook(
      () => useNoul("urgent", config({ n: 0.2 }), { debounceMs: 0 }),
      { wrapper },
    );
    const second = renderHook(
      () => useNoul("urgent", config({ n: 0.8 }), { debounceMs: 0 }),
      { wrapper },
    );
    await tick();
    expect(first.result.current.data?.noul).toBe(0.2);
    expect(second.result.current.data?.noul).toBe(0.8);
  });

  it("supports Choice literal keys, Score, and dependent hooks", async () => {
    const adapter = new MockJudgmentAdapter();
    const hook = renderHook(
      () => {
        const mood = useChoice(
          "mood",
          {
            state: {},
            question: "Mood?",
            options: { calm: "Calm", playful: "Playful" },
          },
          { debounceMs: 0 },
        );
        const choice: "calm" | "playful" | undefined = mood.data?.choice;
        const score = useScore(
          "score",
          {
            state: { choice: choice ?? null },
            question: "Energy?",
            levels: ["Low", "High"],
          },
          { enabled: !!mood.data && !mood.stale, debounceMs: 0 },
        );
        return { mood, score };
      },
      { wrapper: wrap(createJevClient({ adapter })) },
    );
    await tick(20);
    await tick(20);
    expect(hook.result.current.mood.data?.choice).toBe("calm");
    expect(hook.result.current.score.data?.score).toBe(1);
    expect(adapter.calls[1]!.state).toEqual({ choice: "calm" });
  });

  it("does not start inference during server rendering", () => {
    const adapter = new MockJudgmentAdapter();
    function Component() {
      const value = useNoul("urgent", config({}));
      return <span>{value.pending ? "pending" : "ready"}</span>;
    }
    const html = renderToString(
      <JevProvider client={createJevClient({ adapter })}>
        <Component />
      </JevProvider>,
    );
    expect(html).toContain("pending");
    expect(adapter.calls).toHaveLength(0);
  });
});
