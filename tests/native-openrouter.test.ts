import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import {
  DECISIONS_ENDPOINT,
  requestSchema,
  validateResponse,
  type DecisionsRequest,
} from "../src/transport/http.js";
import {
  NativeRuntimeError,
  OpenRouterJevAdapter,
  MockJudgmentAdapter,
  run,
  useChoice,
  useNoul,
  useScore,
  type ChoiceAnswer,
} from "../src/index.js";

const responseModel = "typesafe/jev-1.13-20260917";
const score = {
  type: "score" as const,
  score: 1.5,
  confidence: 0.7,
  legend: { "0": "low", "1": "medium", "2": "high" },
  probabilities: { "0": 0.1, "1": 0.3, "2": 0.6 },
};
const usage = { input_tokens: 100, output_tokens: 20, cost: 0.000005 };
const scoreRequest: DecisionsRequest = {
  model: "typesafe/jev-1.13",
  state: { ticket: "refund" },
  questions: {
    severity: {
      type: "score",
      instructions: "Severity?",
      criteria: ["low", "medium", "high"],
    },
  },
};

function independent() {
  const state = { ticket: "refund" };
  const intent = useChoice("intent", {
    state,
    question: "Intent?",
    options: { refund: "Money returned", help: "Help" },
  });
  const urgent = useNoul("urgent", { state, question: "Urgent?" });
  const severity = useScore("severity", {
    state,
    question: "Severity?",
    levels: ["low", "medium", "high"],
  });
  return { intent, urgent, severity };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});


it("batches three primitives through the existing OpenRouter transport", async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe(DECISIONS_ENDPOINT);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer mock-only" });
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.state).toEqual({ ticket: "refund" });
    expect(body.questions).toEqual({
      intent: {
        type: "choice",
        instructions: "Intent?",
        criteria: { refund: "Money returned", help: "Help" },
      },
      urgent: { type: "noul", instructions: "Urgent?" },
      severity: scoreRequest.questions.severity,
    });
    return Response.json({
      model: responseModel,
      provider: "TypeSafe",
      usage,
      answers: {
        intent: {
          type: "choice",
          choice: "refund",
          confidence: 0.9,
          probabilities: { refund: 0.95, help: 0.05 },
        },
        urgent: { type: "noul", noul: 0.8 },
        severity: score,
      },
    });
  });
  const execution = await run(independent, {
    input: {},
    adapter: new OpenRouterJevAdapter({ apiKey: "mock-only", fetch: fetcher }),
    trace: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(execution.result.severity).toEqual(score);
  expect(execution.trace.passes).toHaveLength(2);
  expect(execution.trace.passes[0]!.batches[0]!.metadata).toEqual({
    model: responseModel,
    provider: "TypeSafe",
    usage,
  });
  expect(JSON.stringify(execution.trace)).not.toContain("mock-only");
});

it("defaults to the OpenRouter key and stages answer-dependent questions", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "mock-env-key");
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const second = Boolean(body.questions.severity);
    expect(Object.keys(body.questions)).toEqual([
      second ? "severity" : "intent",
    ]);
    if (second) expect(body.state).toEqual({ intent: "refund" });
    return Response.json({
      model: responseModel,
      usage,
      answers: second
        ? { severity: score }
        : { intent: { type: "choice", choice: "refund" } },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const execution = await run(
    () => {
      const intent = useChoice("intent", {
        state: "refund",
        question: "Intent?",
        options: { refund: "refund", help: "help" },
      });
      const severity = useScore("severity", {
        state: { intent: intent.choice },
        question: "Severity?",
        levels: ["low", "medium", "high"],
      });
      return { intent, severity };
    },
    { input: {}, trace: true },
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(execution.result.intent).toEqual({ type: "choice", choice: "refund" });
  expect(execution.result.intent).not.toHaveProperty("probabilities");
  expectTypeOf(execution.result.intent.confidence).toEqualTypeOf<
    number | undefined
  >();
  expectTypeOf(execution.result.intent.choice).toEqualTypeOf<
    "refund" | "help"
  >();
});

it("preserves the shared transport's policy and usage callbacks", async () => {
  const beforeAttempt = vi.fn(async () => {});
  const onUsage = vi.fn(async () => {});
  const record = vi.fn(async () => {});
  const adapter = new OpenRouterJevAdapter({
    apiKey: "mock",
    beforeAttempt,
    onUsage,
    record,
    fetch: async () =>
      Response.json({
        model: responseModel,
        usage,
        answers: { a: { type: "noul", noul: 0.5 } },
      }),
  });
  await run(() => useNoul("a", { state: "x", question: "a?" }), {
    input: {},
    adapter,
  });
  expect(beforeAttempt).toHaveBeenCalledWith(0);
  expect(onUsage).toHaveBeenCalledWith(usage);
  expect(record).toHaveBeenCalledWith("decision_response", expect.any(Object));
});

it("attaches batch context, original cause, and a stable error trace", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 401 }),
  );
  const adapter = new OpenRouterJevAdapter({ apiKey: "mock", fetch: fetcher });
  const error = await run(independent, { input: {}, adapter }).catch(
    (error: NativeRuntimeError) => error,
  );
  expect(error).toBeInstanceOf(NativeRuntimeError);
  if (!(error instanceof NativeRuntimeError))
    throw new Error("expected failure");
  expect(error.cause).toBeInstanceOf(Error);
  expect(error.message).toContain("intent, urgent, severity");
  expect(error.trace?.passes[0]?.batches[0]?.error).toContain(
    "OPENROUTER_API_KEY",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("records billed metadata even when response model validation fails", async () => {
  const adapter = new OpenRouterJevAdapter({
    apiKey: "mock",
    fetch: async () =>
      Response.json({
        model: "typesafe/jev-1.14",
        usage,
        answers: { a: { type: "noul", noul: 0.5 } },
      }),
  });
  await expect(
    run(() => useNoul("a", { state: "x", question: "a" }), {
      input: {},
      adapter,
    }),
  ).rejects.toMatchObject({
    trace: {
      passes: [
        { batches: [{ metadata: { model: "typesafe/jev-1.14", usage } }] },
      ],
    },
  });
});

it("does not send a request with missing credentials or unsupported state", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const fetcher = vi.fn<typeof fetch>();
  const adapter = new OpenRouterJevAdapter({ fetch: fetcher });
  await expect(run(independent, { input: {}, adapter })).rejects.toThrow(
    "OPENROUTER_API_KEY",
  );
  await expect(
    run(() => useNoul("a", { state: 42, question: "a" }), {
      input: {},
      adapter,
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it("cancellation and policy rejection still prevent transport", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const signal = AbortSignal.abort();
  await expect(
    run(independent, {
      input: {},
      adapter: new OpenRouterJevAdapter({
        apiKey: "mock",
        signal,
        fetch: fetcher,
      }),
    }),
  ).rejects.toThrow("cancelled");
  await expect(
    run(independent, {
      input: {},
      adapter: new OpenRouterJevAdapter({
        apiKey: "mock",
        fetch: fetcher,
        beforeAttempt: async () => {
          throw new Error("policy stop");
        },
      }),
    }),
  ).rejects.toThrow("policy stop");
  expect(fetcher).not.toHaveBeenCalled();
});

it("preserves missing optional Score data instead of inventing it", () => {
  const response = validateResponse(
    {
      model: scoreRequest.model,
      usage,
      answers: { severity: { type: "score", score: 0.5 } },
    },
    scoreRequest,
  );
  expect(response.answers.severity).toEqual({ type: "score", score: 0.5 });
});

it("preserves independently rounded live Score fields within a bounded tolerance", () => {
  const answer = {
    ...score,
    score: 1.36,
    probabilities: { "0": 0.02, "1": 0.61, "2": 0.37 },
  };
  const response = validateResponse(
    { model: scoreRequest.model, usage, answers: { severity: answer } },
    scoreRequest,
  );
  expect(response.answers.severity).toEqual(answer);
  expect(() =>
    validateResponse(
      {
        model: scoreRequest.model,
        usage,
        answers: { severity: { ...answer, score: 1.4 } },
      },
      scoreRequest,
    ),
  ).toThrow("disagrees");
});

it.each([
  { ...score, score: 3 },
  { ...score, score: 0.25 },
  { ...score, probabilities: { "0": 0.5, "1": 0.5 } },
  { ...score, probabilities: { "0": 0.4, "1": 0.4, "2": 0.4 } },
  { ...score, legend: { "0": "wrong", "1": "medium", "2": "high" } },
])("rejects malformed Score answers: %j", (answer) => {
  expect(() =>
    validateResponse(
      { model: scoreRequest.model, usage, answers: { severity: answer } },
      scoreRequest,
    ),
  ).toThrow();
});

it("requires at least two Score levels and string descriptions", () => {
  expect(() =>
    requestSchema.parse({
      ...scoreRequest,
      questions: { x: { type: "score", instructions: "x", criteria: ["one"] } },
    }),
  ).toThrow();
  expect(() =>
    requestSchema.parse({
      ...scoreRequest,
      questions: {
        x: { type: "score", instructions: "x", criteria: ["one", null] },
      },
    }),
  ).toThrow();
});

it("caches by ID as well as definition when independent answers differ", async () => {
  const adapter = new MockJudgmentAdapter(() => ({
    a: { type: "noul", noul: 0.2 },
    b: { type: "noul", noul: 0.8 },
  }));
  const result = await run(
    () => ({
      a: useNoul("a", { state: "x", question: "same?" }),
      b: useNoul("b", { state: "x", question: "same?" }),
    }),
    { input: {}, adapter },
  );
  expect(result.a.noul).toBe(0.2);
  expect(result.b.noul).toBe(0.8);
  expect(adapter.calls).toHaveLength(1);
  expectTypeOf<
    ChoiceAnswer<{ a: string; b: string }>["probabilities"]
  >().toEqualTypeOf<{ readonly a: number; readonly b: number } | undefined>();
});
