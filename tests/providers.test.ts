import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ai } from "@cloudflare/workers-types";
import {
  CloudflareJevAdapter,
  VercelJevAdapter,
  run,
  useChoice,
  useNoul,
  useScore,
  type CloudflareAiBinding,
  type JudgmentRequest,
} from "../src/index.js";

const usage = { input_tokens: 32, output_tokens: 16 };
const answers = {
  intent: {
    type: "choice",
    choice: "refund",
    confidence: 0.9,
    probabilities: { refund: 0.8, help: 0.2 },
  },
  urgent: { type: "noul", noul: 0.9 },
  severity: {
    type: "score",
    score: 1.5,
    confidence: 0.9,
    legend: { "0": "low", "1": "medium", "2": "high" },
    probabilities: { "0": 0, "1": 0.5, "2": 0.5 },
  },
};
function Program() {
  const state = { text: "Please refund this today" };
  const intent = useChoice("intent", {
    state,
    question: "Intent?",
    options: { refund: "Refund", help: "Help" },
  });
  const urgent = useNoul("urgent", { state, question: "Urgent?" });
  const severity = useScore("severity", {
    state,
    question: "Severity?",
    levels: ["low", "medium", "high"],
  });
  return { intent, urgent, severity };
}
afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare Jev", () => {
  it("unwraps the unified inference completed-job envelope", async () => {
    const execution = await run(Program, {
      input: {},
      adapter: new CloudflareJevAdapter({
        ai: {
          run: async () => ({
            state: "Completed",
            result: { model: "jev-1.13.0", answers, usage },
          }),
        },
      }),
      trace: true,
    });
    expect(execution.result).toEqual(answers);
  });
  it("accepts the official Workers AI binding type", () => {
    const acceptsBinding = (ai: Ai): CloudflareAiBinding => ai;
    expect(typeof acceptsBinding).toBe("function");
  });
  it("batches all primitives through a binding and retains its receiver", async () => {
    const ai = {
      run: vi.fn(async function (
        this: unknown,
        model: string,
        input: JudgmentRequest,
      ) {
        expect(this).toBe(ai);
        expect(model).toBe("typesafe/jev");
        expect(Object.keys(input.questions)).toEqual([
          "intent",
          "urgent",
          "severity",
        ]);
        return { model: "jev-1.13.0", answers, usage };
      }),
    };
    const execution = await run(Program, {
      input: {},
      adapter: new CloudflareJevAdapter({ ai }),
      trace: true,
    });
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(execution.result).toEqual(answers);
    expect(execution.trace.passes[0]?.batches[0]?.metadata).toEqual({
      model: "jev-1.13.0",
      provider: "Cloudflare",
      usage,
    });
  });
  it.each([false, true])(
    "uses the REST contract (API envelope: %s)",
    async (wrapped) => {
      const fetcher = vi.fn<typeof fetch>(async (url, init) => {
        expect(url).toBe(
          "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run",
        );
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer test-token",
        });
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("typesafe/jev");
        expect(body.input.questions.urgent.type).toBe("noul");
        const value = { model: "jev-1.13.0", answers, usage };
        return Response.json(
          wrapped ? { success: true, result: value, errors: [] } : value,
        );
      });
      const execution = await run(Program, {
        input: {},
        adapter: new CloudflareJevAdapter({
          accountId: "test-account",
          apiToken: "test-token",
          fetch: fetcher,
        }),
        trace: true,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(execution.result).toEqual(answers);
      expect(JSON.stringify(execution.trace)).not.toContain("test-token");
    },
  );
  it.each([
    { model: "jev-1.13.0", answers: {}, usage },
    {
      model: "jev-1.13.0",
      answers: { ...answers, urgent: { type: "noul", noul: 2 } },
      usage,
    },
    { success: false, errors: [{ message: "failed" }] },
  ])("rejects malformed answers and provider failures", async (response) => {
    await expect(
      run(Program, {
        input: {},
        adapter: new CloudflareJevAdapter({
          accountId: "x",
          apiToken: "secret",
          fetch: async () => Response.json(response),
        }),
      }),
    ).rejects.toMatchObject({
      code: "ADAPTER_FAILURE",
      trace: { requests: 1 },
    });
  });
  it("preserves binding failures as the underlying cause", async () => {
    const cause = new Error("binding unavailable");
    await expect(
      run(Program, {
        input: {},
        adapter: new CloudflareJevAdapter({
          ai: {
            run: async () => {
              throw cause;
            },
          },
        }),
      }),
    ).rejects.toMatchObject({ cause });
  });
  it("rejects credentials, invalid account paths, and nonpositive timeouts", () => {
    for (const accountId of ["", "../escape", "x?query"])
      expect(
        () => new CloudflareJevAdapter({ accountId, apiToken: "x" }),
      ).toThrow();
    expect(
      () => new CloudflareJevAdapter({ accountId: "x", apiToken: "" }),
    ).toThrow();
    expect(
      () =>
        new CloudflareJevAdapter({
          accountId: "x",
          apiToken: "x",
          timeoutMs: 0,
        }),
    ).toThrow();
  });
  it("checks cancellation before transport", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      run(Program, {
        input: {},
        adapter: new CloudflareJevAdapter({
          accountId: "x",
          apiToken: "x",
          fetch: fetcher,
          signal: AbortSignal.abort(),
        }),
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enforces response size, HTTP status, and an optional model pin", async () => {
    for (const response of [
      new Response("x", { status: 401 }),
      new Response("x".repeat(1_000_001)),
      Response.json({ model: "wrong", answers, usage }),
    ]) {
      await expect(
        run(Program, {
          input: {},
          adapter: new CloudflareJevAdapter({
            accountId: "x",
            apiToken: "x",
            expectedResponseModel: "jev-1.13.0",
            fetch: async () => response,
          }),
        }),
      ).rejects.toThrow();
    }
  });
});

describe("Vercel AI Gateway through the official TypeSafe SDK", () => {
  it("preserves Jev primitives and full gateway metadata in one SDK request", async () => {
    const provider_metadata = {
      gateway: { cost: "0.0001", routing: { finalProvider: "typesafe-ai" } },
    };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer gateway-key",
      );
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("typesafe-ai/jev");
      expect(body.questions.urgent.type).toBe("noul");
      expect(body.questions.severity.criteria).toEqual([
        "low",
        "medium",
        "high",
      ]);
      return Response.json({
        model: "typesafe-ai/jev",
        answers,
        usage,
        provider_metadata,
      });
    });
    const execution = await run(Program, {
      input: {},
      adapter: new VercelJevAdapter({ apiKey: "gateway-key", fetch: fetcher }),
      trace: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(execution.result).toEqual(answers);
    expect(execution.trace.passes[0]?.batches[0]?.metadata).toEqual({
      model: "typesafe-ai/jev",
      provider: "Vercel AI Gateway",
      usage,
      providerMetadata: provider_metadata,
    });
    expect(JSON.stringify(execution.trace)).not.toContain("gateway-key");
  });
  it("uses only gateway credentials, not the direct TypeSafe key", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("TYPESAFE_API_KEY", "must-not-be-used");
    expect(() => new VercelJevAdapter()).toThrow("AI_GATEWAY_API_KEY");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-only");
    expect(() => new VercelJevAdapter()).not.toThrow();
  });
  it("never retries a failed billed request by default", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(
      run(Program, {
        input: {},
        adapter: new VercelJevAdapter({ apiKey: "x", fetch: fetcher }),
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves metadata on a model mismatch and rejects malformed answers", async () => {
    const adapter = new VercelJevAdapter({
      apiKey: "x",
      fetch: async () =>
        Response.json({ model: "other-model", answers, usage }),
    });
    await expect(run(Program, { input: {}, adapter })).rejects.toMatchObject({
      trace: {
        passes: [{ batches: [{ metadata: { model: "other-model" } }] }],
      },
    });
    await expect(
      run(Program, {
        input: {},
        adapter: new VercelJevAdapter({
          apiKey: "x",
          fetch: async () =>
            Response.json({ model: "typesafe-ai/jev", answers: {}, usage }),
        }),
      }),
    ).rejects.toThrow("IDs");
  });
  it("propagates cancellation to the official client", async () => {
    const fetcher = vi.fn(async () => Response.json({}));
    await expect(
      run(Program, {
        input: {},
        adapter: new VercelJevAdapter({
          apiKey: "x",
          signal: AbortSignal.abort(),
          fetch: fetcher,
        }),
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
