import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { createJevClient } from "../src/react/client.js";
import { jsonKey } from "../src/react/json.js";
import { createJevHandler } from "../src/server/index.js";
import { MockJudgmentAdapter } from "../src/adapters/mock.js";
import type { JudgmentRequest } from "../src/adapters/adapter.js";

const request: JudgmentRequest = {
  state: { text: "hello" },
  questions: { urgent: { type: "noul", instructions: "Urgent?" } },
};
const post = (body: unknown) =>
  new Request("https://example.test/api/jev", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("React HTTP boundary", () => {
  it("round-trips through the standard server handler with validated answers", async () => {
    const handler = createJevHandler({
      adapter: new MockJudgmentAdapter(),
      authorize: () => true,
    });
    const fetcher = vi.fn<typeof fetch>(async (url, init) =>
      handler(new Request(url, init)),
    );
    const client = createJevClient({
      endpoint: "https://example.test/api/jev",
      fetch: fetcher,
    });
    expect(await client.evaluate(request)).toEqual({
      urgent: { type: "noul", noul: 0.75 },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("authorizes before inference, rejects malformed/oversized input, and hides provider errors", async () => {
    const evaluate = vi
      .fn()
      .mockRejectedValue(new Error("secret provider details"));
    const forbidden = createJevHandler({
      adapter: { evaluate },
      authorize: () => false,
    });
    expect((await forbidden(post(request))).status).toBe(403);
    const handler = createJevHandler({
      adapter: { evaluate },
      authorize: () => true,
    });
    expect((await handler(new Request("https://example.test/"))).status).toBe(
      405,
    );
    expect((await handler(post({ questions: {} }))).status).toBe(400);
    expect(
      (await handler(post({ ...request, state: "x".repeat(200_001) }))).status,
    ).toBe(413);
    expect(evaluate).not.toHaveBeenCalled();
    const response = await handler(post(request));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  });

  it("rejects malformed provider answers on both sides of the boundary", async () => {
    const adapter = {
      evaluate: vi
        .fn()
        .mockResolvedValue({ urgent: { type: "noul", noul: 9 } }),
    };
    await expect(
      createJevClient({ adapter }).evaluate(request),
    ).rejects.toThrow("Malformed");
    const response = await createJevHandler({ adapter, authorize: () => true })(
      post(request),
    );
    expect(response.status).toBe(502);
    const client = createJevClient({
      endpoint: "/api/jev",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ answers: {} })),
    });
    await expect(client.evaluate(request)).rejects.toThrow("Answer IDs");
  });

  it("reports HTTP errors and rejects oversized responses", async () => {
    const client = createJevClient({
      endpoint: "/api/jev",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private detail", { status: 429 })),
    });
    await expect(client.evaluate(request)).rejects.toThrow("HTTP 429");
    const large = createJevClient({
      endpoint: "/api/jev",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("x".repeat(1_000_001))),
    });
    await expect(large.evaluate(request)).rejects.toThrow("size limit");
  });

  it("times out even if a custom adapter ignores cancellation", async () => {
    vi.useFakeTimers();
    try {
      const client = createJevClient({
        adapter: { evaluate: () => new Promise(() => {}) },
        timeoutMs: 50,
      });
      const assertion = expect(client.evaluate(request)).rejects.toThrow(
        "timed out",
      );
      await vi.advanceTimersByTimeAsync(62);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates JSON without invoking getters or toJSON", () => {
    const getter = vi.fn(() => 1);
    expect(() =>
      jsonKey({
        get x() {
          return getter();
        },
      }),
    ).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      jsonKey({
        toJSON() {
          return 1;
        },
      }),
    ).toThrow("JSON");
    expect(() => jsonKey([, 1])).toThrow("sparse");
    expect(() => jsonKey({ x: Infinity })).toThrow("JSON");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => jsonKey(circular)).toThrow("cycles");
    expect(jsonKey({ b: 1, a: 2 })).toBe(jsonKey({ a: 2, b: 1 }));
  });

  it("bundles the React entry for browsers without Node, compiler, or provider SDK imports", async () => {
    const bundle = await build({
      entryPoints: ["src/react/index.ts"],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      metafile: true,
      logLevel: "silent",
    });
    const inputs = Object.keys(bundle.metafile!.inputs);
    expect(
      inputs.some((path) =>
        /runtime\/run|runtime\/fingerprint|checker\/|@typesafe-ai\/sdk/.test(
          path,
        ),
      ),
    ).toBe(false);
    expect(bundle.outputFiles[0]!.text).not.toContain("node:");
  });
});
