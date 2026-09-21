import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  run,
  replay,
  MockJudgmentAdapter,
  type ExecutionTrace,
  type JudgmentRequest,
} from "../src/index.js";
import { WorkerProgram } from "./fixtures/workers/runtime.js";

let runtime: Miniflare;
let example: Miniflare;
async function worker(entry: string) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "import"],
    mainFields: ["module", "main"],
    external: ["node:*"],
    target: "es2023",
  });
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      script: output.outputFiles[0]!.text,
      outboundService: () => {
        throw new Error(
          "Unexpected outbound network request in offline Workers test",
        );
      },
    }),
  );
}
beforeAll(async () => {
  runtime = await worker("tests/fixtures/workers/runtime.ts");
  example = await worker("examples/worker/index.ts");
}, 30_000);
afterAll(async () => {
  await Promise.all([runtime?.dispose(), example?.dispose()]);
});
async function execute(mode: string, payload: unknown = {}) {
  const response = await runtime.dispatchFetch(`http://localhost/${mode}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    execution: { result: unknown; trace: ExecutionTrace };
    calls: JudgmentRequest[];
  };
}

describe("actual workerd execution (no paid inference)", () => {
  it("serves the React judgment endpoint with authorization in workerd", async () => {
    const body = JSON.stringify({
      state: { text: "hello" },
      questions: { energy: { type: "noul", instructions: "Energetic?" } },
    });
    const denied = await runtime.dispatchFetch("http://localhost/react", {
      method: "POST",
      body,
    });
    expect(denied.status).toBe(403);
    const response = await runtime.dispatchFetch("http://localhost/react", {
      method: "POST",
      body,
      headers: { "X-Demo-Access": "allowed" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answers: { energy: { type: "noul", noul: 0.75 } },
    });
  });
  it.each([
    "mock",
    "cloudflare-binding",
    "cloudflare-rest",
    "openrouter",
    "typesafe",
    "vercel",
  ])("batches, suspends, and traces with %s", async (mode) => {
    const { execution, calls } = await execute(mode);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]!.questions)).toEqual([
      "intent",
      "urgent",
      "severity",
    ]);
    expect(Object.keys(calls[1]!.questions)).toEqual(["followup"]);
    expect(calls[1]!.state).toEqual({
      text: "refund",
      intent: "refund",
      urgent: 0.75,
      severity: 1,
    });
    expect(execution.trace.passes).toHaveLength(3);
    expect(execution.trace.requests).toBe(2);
    expect(execution.result).toMatchObject({
      intent: { choice: "refund" },
      severity: { score: 1 },
    });
    const nodeReplay = await replay(WorkerProgram, execution.trace);
    expect(nodeReplay.result).toEqual(execution.result);
  });
  it("replays a Node recording inside workerd with identical fingerprints", async () => {
    const node = await run(WorkerProgram, {
      input: { text: "node-recording" },
      adapter: new MockJudgmentAdapter(),
      trace: true,
    });
    const response = await runtime.dispatchFetch("http://localhost/replay", {
      method: "POST",
      body: JSON.stringify({ trace: node.trace }),
    });
    expect(response.status).toBe(200);
    const worker = (await response.json()) as {
      result: unknown;
      trace: ExecutionTrace;
    };
    expect(worker.result).toEqual(node.result);
    expect(worker.trace.executionFingerprint).toBe(
      node.trace.executionFingerprint,
    );
  });
  it("isolates concurrent Worker requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        execute("cloudflare-binding", { text: String(i) }),
      ),
    );
    results.forEach(({ execution }, i) =>
      expect(execution.result).toMatchObject({ text: String(i) }),
    );
  });
  it("keeps proxy/getter rejection and rejects async bodies before invocation", async () => {
    const response = await runtime.dispatchFetch("http://localhost/safety", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      errors: string[];
      invoked: boolean;
    };
    expect(result.invoked).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("proxies");
    expect(result.errors[1]).toContain("accessors");
    expect(result.errors[2]).toContain("synchronous");
  });
  it("serves the Worker example in default offline mode", async () => {
    const response = await example.dispatchFetch("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ message: "refund" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { intent: { choice: "refund" } },
      passes: 2,
      requests: 1,
    });
  });
  it("validates example HTTP inputs without inference", async () => {
    expect((await example.dispatchFetch("http://localhost/")).status).toBe(405);
    for (const body of ["broken", "{}", '{"message":""}']) {
      expect(
        (
          await example.dispatchFetch("http://localhost/", {
            method: "POST",
            body,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await example.dispatchFetch("http://localhost/", {
          method: "POST",
          body: "x".repeat(16_385),
        })
      ).status,
    ).toBe(413);
  });
});
