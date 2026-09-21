import { describe, expect, it, vi, afterEach } from "vitest";
import {
  run,
  replay,
  useChoice,
  useInput,
  useNoul,
  useScore,
  MockJudgmentAdapter,
  type NativeRuntimeError,
} from "../src/index.js";
import { stableJson, snapshot } from "../src/runtime/fingerprint.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("strict JSON snapshots", () => {
  it.each([
    new Array(1),
    [1, , 3],
    Object.assign([1], { extra: true }),
    Object.assign({}, { [Symbol("x")]: 1 }),
    { x: undefined },
    { x: () => 1 },
    { x: NaN },
    new Date(),
    new Map(),
    new Set(),
    1n,
  ])("rejects values JSON would silently drop or alter: %s", (value) => {
    expect(() => stableJson(value)).toThrow();
  });
  it("rejects getters without evaluating them, nonenumerable fields, and arbitrary proxies", () => {
    const getter = vi.fn(() => 1);
    const value = Object.defineProperty({}, "x", {
      enumerable: true,
      get: getter,
    });
    expect(() => snapshot(value)).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      snapshot(Object.defineProperty({}, "x", { value: 1 })),
    ).toThrow("non-enumerable");
    expect(() => snapshot(new Proxy({}, {}))).toThrow("proxies");
  });
  it("rejects cycles but permits repeated references and preserves array order", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.x = cyclic;
    expect(() => snapshot(cyclic)).toThrow("cyclic");
    const shared = { a: [1, 2] };
    expect(snapshot({ x: shared, y: shared })).toEqual({
      x: shared,
      y: shared,
    });
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });
  it("uses code-unit ordering even for canonically equivalent Unicode keys", () => {
    expect(stableJson({ é: 1, é: 2 })).toBe(stableJson({ é: 2, é: 1 }));
    const value = JSON.parse('{"__proto__":{"x":1},"constructor":2}');
    expect(snapshot(value)).toEqual(value);
    expect(Object.getPrototypeOf(snapshot(value))).toBe(Object.prototype);
  });
});

describe("evaluation isolation", () => {
  it("snapshots input once before asynchronous inference", async () => {
    const input = { ticket: { text: "original" } };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = new MockJudgmentAdapter(async () => {
      await gate;
      return { x: { type: "noul", noul: 0.7 } };
    });
    const execution = run(
      () => {
        const ticket = useInput<{ text: string }>("ticket");
        const x = useNoul("x", { state: { ticket }, question: "x?" });
        return { ticket, x };
      },
      { input, adapter, trace: true },
    );
    input.ticket.text = "changed";
    release();
    const completed = await execution;
    expect(completed.result.ticket.text).toBe("original");
    expect(completed.trace.input).toEqual({ ticket: { text: "original" } });
  });
  it("freezes program input and detaches state declarations from subsequent local mutation", async () => {
    await expect(
      run(
        () => {
          const x = useInput<{ value: number }>("x");
          x.value = 2;
          return x;
        },
        { input: { x: { value: 1 } }, adapter: new MockJudgmentAdapter() },
      ),
    ).rejects.toThrow();
    const adapter = new MockJudgmentAdapter();
    await run(
      () => {
        const state = { value: 1 };
        const answer = useNoul("x", { state, question: "x?" });
        state.value = 2;
        return answer;
      },
      { input: {}, adapter },
    );
    expect(adapter.calls[0]!.state).toEqual({ value: 1 });
    expect(Object.isFrozen(adapter.calls[0]!.state)).toBe(true);
    expect(Object.isFrozen(adapter.calls[0]!.questions)).toBe(true);
  });
  it("detaches answers from the adapter and returns frozen plain result data", async () => {
    const answers = { x: { type: "noul" as const, noul: 0.7 } };
    const adapter = new MockJudgmentAdapter(() => answers);
    const completed = await run(
      () => useNoul("x", { state: "x", question: "x?" }),
      { input: {}, adapter, trace: true },
    );
    answers.x.noul = 0.1;
    expect(completed.result.noul).toBe(0.7);
    expect(completed.trace.passes[0]!.batches[0]!.answers!.x).toEqual({
      type: "noul",
      noul: 0.7,
    });
    expect(Object.isFrozen(completed.result)).toBe(true);
    expect(Object.isFrozen(completed.trace)).toBe(true);
  });
  it("rejects writes to both pending and resolved answer handles", async () => {
    await expect(
      run(
        () => {
          const x = useNoul("x", { state: "x", question: "x?" });
          Reflect.set(x, "noul", 0);
          return x;
        },
        { input: {}, adapter: new MockJudgmentAdapter() },
      ),
    ).rejects.toMatchObject({ code: "IMMUTABLE_ANSWER" });
    const adapter = new MockJudgmentAdapter();
    await expect(
      run(
        () => {
          const x = useNoul("x", { state: "x", question: "x?" });
          const resolved = x.noul;
          Reflect.set(x, "noul", resolved);
          return x;
        },
        { input: {}, adapter },
      ),
    ).rejects.toMatchObject({ code: "IMMUTABLE_ANSWER" });
  });
  it("rejects captured handles from earlier evaluations", async () => {
    let captured: ReturnType<typeof useNoul> | undefined;
    let pass = 0;
    await expect(
      run(
        () => {
          const x = useNoul("x", { state: "x", question: "x?" });
          if (++pass === 1) captured = x;
          return captured;
        },
        { input: {}, adapter: new MockJudgmentAdapter() },
      ),
    ).rejects.toMatchObject({ code: "STALE_ANSWER" });
  });
  it("rejects async functions before executing them and drains returned rejected Promises", async () => {
    const program = vi.fn(async () => 1);
    // A wrapping spy is synchronous but returns a Promise, which is also rejected.
    await expect(
      run(program, { input: {}, adapter: new MockJudgmentAdapter() }),
    ).rejects.toMatchObject({ code: "ASYNC_PROGRAM" });
    let called = false;
    await expect(
      run(
        async () => {
          called = true;
          return 1;
        },
        { input: {} },
      ),
    ).rejects.toMatchObject({ code: "ASYNC_PROGRAM" });
    expect(called).toBe(false);
    await expect(
      run(() => Promise.reject(new Error("async error")), { input: {} }),
    ).rejects.toMatchObject({ code: "ASYNC_PROGRAM" });
  });
  it("rejects empty IDs, invalid questions, and unsafe pass limits before inference", async () => {
    const adapter = new MockJudgmentAdapter();
    await expect(
      run(() => useNoul("", { state: "x", question: "x" }), {
        input: {},
        adapter,
      }),
    ).rejects.toThrow("IDs");
    await expect(
      run(() => useChoice("x", { state: "x", question: "x", options: {} }), {
        input: {},
        adapter,
      }),
    ).rejects.toThrow();
    await expect(
      run(() => 1, { input: {}, adapter, maxPasses: Infinity }),
    ).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    expect(adapter.calls).toHaveLength(0);
  });
  it("fails at the pass limit with a complete trace", async () => {
    await expect(
      run(() => useNoul("x", { state: "x", question: "x?" }), {
        input: {},
        adapter: new MockJudgmentAdapter(),
        maxPasses: 1,
      }),
    ).rejects.toMatchObject({ code: "MAX_PASSES", trace: { requests: 1 } });
  });
  it.each([
    {},
    { x: { type: "noul", noul: 2 } },
    { x: { type: "score", score: 1 } },
    { x: { type: "noul", noul: 0.5 }, extra: { type: "noul", noul: 0.5 } },
  ])(
    "validates third-party adapter responses, including missing/extra IDs: %j",
    async (answers) => {
      const adapter = { evaluate: async () => answers };
      await expect(
        run(() => useNoul("x", { state: "x", question: "x?" }), {
          input: {},
          adapter: adapter as unknown as MockJudgmentAdapter,
        }),
      ).rejects.toMatchObject({ code: "ADAPTER_FAILURE" });
    },
  );
  it("isolates concurrent runs with the same judgment ID", async () => {
    const program = () =>
      useNoul("x", { state: useInput<string>("x"), question: "x?" });
    const [a, b] = await Promise.all([
      run(program, {
        input: { x: "a" },
        adapter: new MockJudgmentAdapter(async () => ({
          x: { type: "noul", noul: 0.1 },
        })),
      }),
      run(program, {
        input: { x: "b" },
        adapter: new MockJudgmentAdapter(async () => ({
          x: { type: "noul", noul: 0.9 },
        })),
      }),
    ]);
    expect(a.noul).toBe(0.1);
    expect(b.noul).toBe(0.9);
  });
});

function triage() {
  const ticket = useInput<string>("ticket");
  const intent = useChoice("intent", {
    state: { ticket },
    question: "intent?",
    options: { refund: "refund", help: "help" },
  });
  const urgent = useNoul("urgent", { state: { ticket }, question: "urgent?" });
  const severity = useScore("severity", {
    state: { intent: intent.choice, urgent: urgent.noul },
    question: "severity?",
    levels: ["low", "high"],
  });
  return { intent, urgent, severity };
}

describe("dependency tracing and replay", () => {
  it("records both triage dependencies with their fields and judgment versions", async () => {
    const { trace } = await run(triage, {
      input: { ticket: "refund" },
      adapter: new MockJudgmentAdapter(),
      trace: true,
    });
    const dependencies = trace.passes[1]!.judgments.find(
      (item) => item.id === "severity",
    )!.dependencies;
    expect(dependencies.map((item) => [item.id, item.fields])).toEqual([
      ["intent", ["choice"]],
      ["urgent", ["noul"]],
    ]);
    expect(dependencies.every((item) => item.fingerprint.length === 64)).toBe(
      true,
    );
    expect(trace.passes[0]!.reads).toMatchObject([
      { id: "intent", field: "choice", status: "pending" },
    ]);
  });
  it("replays JSON-roundtripped traces with no network access", async () => {
    const original = await run(triage, {
      input: { ticket: "refund" },
      adapter: new MockJudgmentAdapter(),
      trace: true,
    });
    const fetcher = vi.fn(() => {
      throw new Error("network is forbidden");
    });
    vi.stubGlobal("fetch", fetcher);
    const replayed = await replay(
      triage,
      JSON.parse(JSON.stringify(original.trace)),
    );
    expect(replayed.result).toEqual(original.result);
    expect(replayed.trace.executionFingerprint).toBe(
      original.trace.executionFingerprint,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects changed questions and changed deterministic return values", async () => {
    const original = await run(
      () => useNoul("x", { state: "x", question: "x?" }),
      { input: {}, adapter: new MockJudgmentAdapter(), trace: true },
    );
    await expect(
      replay(
        () => useNoul("x", { state: "x", question: "changed?" }),
        original.trace,
      ),
    ).rejects.toThrow("differs");
    await expect(
      replay(() => {
        useNoul("x", { state: "x", question: "x?" });
        return 42;
      }, original.trace),
    ).rejects.toMatchObject({ code: "REPLAY_MISMATCH" });
  });
  it("rejects tampered answers and tampered input before evaluating code", async () => {
    const original = await run(triage, {
      input: { ticket: "refund" },
      adapter: new MockJudgmentAdapter(),
      trace: true,
    });
    const changed = JSON.parse(JSON.stringify(original.trace));
    changed.passes[0].batches[0].answers.urgent.noul = 0;
    const program = vi.fn(triage);
    await expect(replay(program, changed)).rejects.toThrow("changed");
    const inputChanged = JSON.parse(JSON.stringify(original.trace));
    inputChanged.input.ticket = "different";
    await expect(replay(program, inputChanged)).rejects.toThrow("fingerprint");
    expect(program).not.toHaveBeenCalled();
  });
  it("replays programs without judgments, including an undefined result", async () => {
    for (const program of [() => 3, () => undefined]) {
      const original = await run(program, { input: {}, trace: true });
      expect((await replay(program, original.trace)).result).toEqual(
        original.result,
      );
    }
  });
  it("does not accept failed traces as complete recordings", async () => {
    const error = await run(
      () => {
        throw new Error("bad");
      },
      { input: {}, trace: true },
    ).catch((error) => error as NativeRuntimeError);
    await expect(replay(() => 1, error.trace!)).rejects.toThrow("completed");
  });
});
