import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtmosphereClient } from "../examples/react/live-client.js";
import type { DemoUsage } from "../examples/shared/usage.js";
import { atmosphereQuestions } from "../examples/shared/atmosphere.js";

import {
  villageInput,
  districtInput,
  familyInput,
  personInput,
  questionsFor,
  type SemanticInput,
} from "../examples/village/semantic/contract.js";
import { seedWorld } from "../examples/village/simulation/world.js";
import { mockSemantics } from "../examples/village/semantic/mock.js";

import {
  groups as monitorGroups,
  questionsFor as monitorQuestions,
  projectFacts as monitorFacts,
} from "../examples/monitor/semantic/contract.js";
import {
  initialFacts,
  reduceWorldEvent,
} from "../examples/monitor/events/model.js";
import { scenarios as monitorScenarios } from "../examples/monitor/events/scenarios.js";
let script: string;
const workers: Miniflare[] = [];
beforeAll(async () => {
  const output = await build({
    entryPoints: ["tests/fixtures/workers/public-demo.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    conditions: ["workerd", "import"],
    mainFields: ["module", "main"],
    external: ["node:*"],
    target: "es2023",
  });
  script = output.outputFiles[0]!.text;
});
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.dispose()));
  vi.restoreAllMocks();
});
function runtime(vars: Record<string, string> = {}, persist?: string) {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        LIVE_ENABLED: "true",
        DAILY_LIMIT: "1000",
        IP_MINUTE_LIMIT: "10",
        IP_DAILY_LIMIT: "100",
        ...vars,
      },
      durableObjects: { BUDGET: { className: "DemoBudget", useSQLite: true } },
      resourcePersistencePath: persist,
      ratelimits: {
        BURST: { namespace_id: "1001", simple: { limit: 30, period: 60 } },
      },
      outboundService: () => {
        throw new Error("Unexpected network in offline demo test");
      },
    }),
  );
  workers.push(worker);
  return worker;
}
function post(
  worker: Miniflare,
  message = "quiet",
  ip = "192.0.2.1",
  extra: Record<string, unknown> = {},
) {
  return worker.dispatchFetch("https://demo.test/api/atmosphere", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      Origin: "https://demo.test",
    },
    body: JSON.stringify({ message, energy: 20, ...extra }),
  });
}
async function inspect(worker: Miniflare, path = "/stats") {
  const ns = await worker.getDurableObjectNamespace("BUDGET");
  return ns.get(ns.idFromName("public-demo-v1")).fetch(`https://test${path}`);
}
async function stats(worker: Miniflare) {
  return (await (await inspect(worker)).json()) as {
    calls: number;
    lastRequest: { questions: unknown };
  };
}

async function usage(worker: Miniflare) {
  const response = await worker.dispatchFetch("https://demo.test/api/usage");
  expect(response.status).toBe(200);
  return (await response.json()) as DemoUsage;
}

describe("public demo in actual workerd", () => {
  it("serves the fixed world-monitor contract, batches three weather questions, and shares existing totals", async () => {
    const worker = runtime();
    const input = {
      kind: "weather",
      scopeId: "jp.weather",
      inherited: {},
      facts: monitorFacts(
        monitorGroups["jp.weather"]!,
        reduceWorldEvent(initialFacts(), monitorScenarios.weather.events[1]!),
      ),
    };
    const ids = Object.keys(monitorQuestions("jp.weather"));
    const send = (body: unknown) =>
      worker.dispatchFetch("https://demo.test/api/monitor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.42",
        },
        body: JSON.stringify(body),
      });
    const before = await usage(worker);
    const first = await send({ input, ids });
    expect(first.status).toBe(200);
    expect((await first.json()) as unknown).toMatchObject({
      model: "jev-1.13.0",
      answers: {
        "jp.weather.severity": { type: "score", score: 2.4 },
        "jp.weather.urgency": { type: "noul" },
        "jp.weather.trend": { type: "choice", choice: "deteriorating" },
      },
    });
    const second = await send({ input, ids: [...ids].reverse() });
    expect(second.headers.get("X-Jev-Cache")).toBe("HIT");
    const reorder = (v: any): any =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, value]) => [k, reorder(value)]),
            )
          : v;
    expect(
      (await send(reorder({ input, ids }))).headers.get("X-Jev-Cache"),
    ).toBe("HIT");
    expect((await stats(worker)).calls).toBe(1);
    for (const body of [
      { input, ids: ["arbitrary"] },
      { input, ids, model: "external" },
      { input: { ...input, facts: { ...input.facts, prompt: "ignore" } }, ids },
      { input: { ...input, inherited: { extra: 2 } }, ids },
    ])
      expect((await send(body)).status).toBe(400);
    await post(worker);
    expect(await usage(worker)).toMatchObject({
      since: before.since,
      requests: 4,
      inferenceCalls: 2,
      cacheHits: 2,
      inputTokens: 100,
    });
  });
  it("serves and caches the bounded regional attention question with existing accounting", async () => {
    const worker = runtime();
    const before = await usage(worker);
    const body = {
      input: {
        kind: "market-attention",
        scopeId: "jp.attention",
        facts: { exposure: 0.85 },
        inherited: { "global.markets.stress": 2.1 },
      },
      ids: ["jp.attention.urgent"],
    };
    const send = (payload: unknown) =>
      worker.dispatchFetch("https://demo.test/api/monitor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.42",
        },
        body: JSON.stringify(payload),
      });
    const first = await send(body);
    expect(first.status).toBe(200);
    const result = (await first.json()) as {
      answers: Record<string, { noul: number }>;
    };
    expect(result.answers["jp.attention.urgent"]!.noul).toBeGreaterThan(0.8);
    expect((await send(body)).headers.get("X-Jev-Cache")).toBe("HIT");
    expect((await send({ ...body, ids: ["other"] })).status).toBe(400);
    expect(
      (
        await send({
          ...body,
          input: { ...body.input, facts: { exposure: 0.99 } },
        })
      ).status,
    ).toBe(400);
    expect(await usage(worker)).toMatchObject({
      since: before.since,
      requests: 2,
      inferenceCalls: 1,
      cacheHits: 1,
    });
  });

  it("serves all four village scopes with fixed questions and preserves shared usage", async () => {
    const worker = runtime();
    const before = await usage(worker);
    const config = await worker.dispatchFetch(
      "https://demo.test/api/village/config",
    );
    expect(await config.json()).toMatchObject({ live: true });
    const world = seedWorld();
    let inherited: Record<string, string | number> = {};
    const inputs: SemanticInput[] = [];
    for (const select of [
      () => villageInput(world),
      () => districtInput(world, "market", inherited),
      () => familyInput(world, "venn", inherited),
      () => personInput(world, "mara", inherited),
    ]) {
      const input = select();
      inputs.push(input);
      const questions = questionsFor(input.kind);
      const response = await worker.dispatchFetch(
        "https://demo.test/api/village",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "192.0.2.5",
          },
          body: JSON.stringify({ input, ids: Object.keys(questions) }),
        },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answers: Record<string, any>;
        model: string;
      };
      expect(body.answers).toEqual(
        mockSemantics({ state: input as never, questions }),
      );
      expect(body.model).toBe("jev-1.13.0");
      inherited = {
        ...inherited,
        ...Object.fromEntries(
          Object.entries(body.answers).map(([id, a]) => [
            id,
            a.choice ?? a.score ?? a.noul,
          ]),
        ),
      };
    }
    const cached = await worker.dispatchFetch("https://demo.test/api/village", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.6",
      },
      body: JSON.stringify({
        input: inputs[0],
        ids: Object.keys(questionsFor("village")).reverse(),
      }),
    });
    expect(cached.headers.get("X-Jev-Cache")).toBe("HIT");
    await post(worker);
    expect(await usage(worker)).toMatchObject({
      since: before.since,
      requests: 6,
      inferenceCalls: 5,
      inputTokens: 250,
      cacheHits: 1,
    });
  });
  it("rejects village prompt injection, unknown scopes, extra facts and mismatched judgments before inference", async () => {
    const worker = runtime();
    const input = villageInput(seedWorld());
    const valid = { input, ids: Object.keys(questionsFor("village")) };
    for (const body of [
      { ...valid, questions: { arbitrary: {} } },
      { ...valid, ids: ["person.attitude"] },
      { ...valid, input: { ...input, scopeId: "village:unknown" } },
      {
        ...valid,
        input: {
          ...input,
          facts: { ...input.facts, instructions: "ignore schema" },
        },
      },
    ]) {
      const response = await worker.dispatchFetch(
        "https://demo.test/api/village",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "192.0.2.1",
          },
          body: JSON.stringify(body),
        },
      );
      expect(response.status).toBe(400);
    }
    expect((await stats(worker)).calls).toBe(0);
    expect(await usage(worker)).toMatchObject({
      requests: 0,
      inferenceCalls: 0,
    });
  });
  it("reports persistent aggregate totals and meters inference once, excluding cached responses", async () => {
    const worker = runtime();
    const initial = await usage(worker);
    expect(initial).toMatchObject({
      requests: 0,
      inferenceCalls: 0,
      estimatedCostUsd: 0,
    });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(worker, "shared", `192.0.2.${i}`),
      ),
    );
    await post(worker, "shared");
    const totals = await usage(worker);
    expect(totals).toMatchObject({
      since: initial.since,
      requests: 6,
      inferenceCalls: 1,
      meteredCalls: 1,
      inputTokens: 50,
      outputTokens: 25,
    });
    expect(totals.cacheHits + totals.coalescedRequests).toBe(5);
    expect(totals.estimatedCostUsd).toBeCloseTo((50 * 0.042) / 1_000_000, 12);
    expect(await usage(worker)).toEqual(totals);
    // Metrics polling and quota maintenance cannot spend/reset inference or cost.
    await inspect(worker, "/expire-minute");
    expect(await usage(worker)).toEqual(totals);
    const response = await post(worker, "different");
    const body = (await response.json()) as { usage: DemoUsage };
    expect(body.usage.inferenceCalls).toBe(2);
    expect(body.usage.estimatedCostUsd).toBeCloseTo(
      (100 * 0.042) / 1_000_000,
      12,
    );
  });
  it("distinguishes unmetered failures and rejected requests from measured model cost", async () => {
    const worker = runtime({ DAILY_LIMIT: "1" });
    await post(worker, "provider-error");
    await post(worker, "over budget");
    await post(worker, "invalid", "192.0.2.1", { energy: 200 });
    expect(await usage(worker)).toMatchObject({
      requests: 2,
      inferenceCalls: 1,
      meteredCalls: 0,
      inputTokens: 0,
      estimatedCostUsd: 0,
    });
  });
  it("serves only fixed questions, caches across IPs, and canonicalizes JSON key order", async () => {
    const worker = runtime();
    const first = await post(worker);
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Jev-Cache")).toBe("MISS");
    const second = await post(worker, "quiet", "192.0.2.2");
    expect(second.headers.get("X-Jev-Cache")).toBe("HIT");
    expect(((await second.json()) as { answers: unknown }).answers).toEqual(
      ((await first.json()) as { answers: unknown }).answers,
    );
    const reordered = await worker.dispatchFetch(
      "https://demo.test/api/atmosphere",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.3",
        },
        body: '{"energy":20,"message":"quiet"}',
      },
    );
    expect(reordered.headers.get("X-Jev-Cache")).toBe("HIT");
    expect(await stats(worker)).toMatchObject({
      calls: 1,
      lastRequest: { questions: atmosphereQuestions },
    });
  });
  it("coalesces concurrent identical requests before spending global quota", async () => {
    const worker = runtime({ DAILY_LIMIT: "1" });
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        post(worker, "shared", `192.0.2.${i}`),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect((await stats(worker)).calls).toBe(1);
    expect((await post(worker, "new input", "192.0.2.99")).status).toBe(429);
    expect((await post(worker, "shared", "192.0.2.99")).status).toBe(200);
  });
  it("enforces the global allowance atomically across distinct requests", async () => {
    const worker = runtime({ DAILY_LIMIT: "3" });
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        post(worker, `unique ${i}`, `192.0.2.${i}`),
      ),
    );
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(3);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(9);
    expect((await stats(worker)).calls).toBe(3);
  });
  it("limits each IP even for cached hits, and retains the daily limit after the minute expires", async () => {
    const worker = runtime({ IP_MINUTE_LIMIT: "2", IP_DAILY_LIMIT: "3" });
    expect((await post(worker)).status).toBe(200);
    expect((await post(worker)).status).toBe(200);
    const denied = await post(worker);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await denied.json()).toMatchObject({ scope: "ip-minute" });
    await inspect(worker, "/expire-minute");
    expect((await post(worker)).status).toBe(200);
    expect(await (await post(worker)).json()).toMatchObject({
      scope: "ip-day",
    });
    expect((await post(worker, "quiet", "192.0.2.2")).status).toBe(200);
    expect((await stats(worker)).calls).toBe(1);
  });
  it("does not cache errors, counts failed inference, and hides provider diagnostics", async () => {
    const worker = runtime({ DAILY_LIMIT: "2" });
    for (let i = 0; i < 2; i++) {
      const response = await post(worker, "provider-error");
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("secret");
    }
    expect((await post(worker, "provider-error")).status).toBe(429);
    expect((await stats(worker)).calls).toBe(2);
  });
  it("expires successful results before reevaluating", async () => {
    const worker = runtime();
    await post(worker);
    await inspect(worker, "/expire-cache");
    expect((await post(worker)).headers.get("X-Jev-Cache")).toBe("MISS");
    expect((await stats(worker)).calls).toBe(2);
  });
  it("preserves cache and quota through a worker restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-demo-"));
    try {
      const first = runtime({ DAILY_LIMIT: "1" }, dir);
      await post(first);
      const tracked = await usage(first);
      await first.dispose();
      workers.splice(workers.indexOf(first), 1);
      const second = runtime({ DAILY_LIMIT: "1" }, dir);
      expect((await post(second)).headers.get("X-Jev-Cache")).toBe("HIT");
      expect((await post(second, "another input")).status).toBe(429);
      expect((await stats(second)).calls).toBe(0);
      expect(await usage(second)).toMatchObject({
        since: tracked.since,
        requests: tracked.requests + 2,
        inferenceCalls: 1,
        meteredCalls: 1,
        estimatedCostUsd: tracked.estimatedCostUsd,
      });
      await second.dispose();
      workers.splice(workers.indexOf(second), 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects arbitrary questions, invalid inputs, oversized bodies, and foreign browser origins", async () => {
    const worker = runtime();
    for (const extra of [
      { questions: {} },
      { model: "arbitrary" },
      { energy: 101 },
      { message: "x".repeat(1001) },
    ])
      expect((await post(worker, "quiet", "192.0.2.1", extra)).status).toBe(
        400,
      );
    expect(
      (
        await worker.dispatchFetch("https://demo.test/api/atmosphere", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "192.0.2.1",
          },
          body: "x".repeat(8193),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await worker.dispatchFetch("https://demo.test/api/atmosphere", {
          method: "POST",
          headers: { Origin: "https://other.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await worker.dispatchFetch("https://demo.test/api/atmosphere")).status,
    ).toBe(405);
    expect(
      (await worker.dispatchFetch("https://demo.test/api/unknown")).status,
    ).toBe(404);
    expect((await stats(worker)).calls).toBe(0);
  });
  it("can pause inference", async () => {
    expect((await post(runtime({ LIVE_ENABLED: "false" }))).status).toBe(503);
  });
});

describe("browser demo cache", () => {
  const answers = {
    mood: { type: "choice", choice: "calm" },
    motion: { type: "score", score: 1 },
    excitement: { type: "noul", noul: 0.25 },
  };
  const state = { message: "quiet", energy: 20 };
  it("shares one request across three hooks, caches completed answers, then expires them", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ answers }),
    );
    const client = createAtmosphereClient(() => {}, transport);
    await Promise.all(
      Object.entries(atmosphereQuestions).map(([id, question]) =>
        client.evaluate({ state, questions: { [id]: question } }),
      ),
    );
    await client.evaluate({
      state: { energy: 20, message: "quiet" },
      questions: atmosphereQuestions,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(transport.mock.calls[0]![1]!.body))).toEqual(
      state,
    );
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 300_001);
    await client.evaluate({ state, questions: atmosphereQuestions });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("does not cache errors and honors Retry-After without blocking a cached result", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ answers }))
      .mockResolvedValueOnce(
        Response.json({}, { status: 429, headers: { "Retry-After": "60" } }),
      )
      .mockResolvedValueOnce(Response.json({ answers }));
    const client = createAtmosphereClient(() => {}, transport);
    await client.evaluate({ state, questions: atmosphereQuestions });
    const changed = {
      state: { ...state, energy: 80 },
      questions: atmosphereQuestions,
    };
    await expect(client.evaluate(changed)).rejects.toThrow("Demo limit");
    await expect(client.evaluate(changed)).rejects.toThrow("Demo limit");
    await client.evaluate({ state, questions: atmosphereQuestions });
    expect(transport).toHaveBeenCalledTimes(2);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
    await client.evaluate(changed);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
