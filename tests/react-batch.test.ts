import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchedJevClient, type BatchResponse } from "../src/react/batch.js";
import type { JudgmentRequest } from "../src/adapters/adapter.js";
const question = { type: "noul" as const, instructions: "Needs attention?" };
const request = (id: string): JudgmentRequest => ({
  state: {},
  questions: { [id]: question },
});
const output = (req: JudgmentRequest, noul = 0.8): BatchResponse => ({
  answers: Object.fromEntries(
    Object.keys(req.questions).map((id) => [id, { type: "noul", noul }]),
  ),
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("shared SDK batch/cache", () => {
  it("coalesces equivalent in-flight batches with different IDs without cancelling the remaining subscriber", async () => {
    let resolve!: (value: BatchResponse) => void;
    const send = vi.fn(
      (_: JudgmentRequest, __: { signal: AbortSignal }) =>
        new Promise<BatchResponse>((r) => {
          resolve = r;
        }),
    );
    const client = new BatchedJevClient(send);
    const a = new AbortController();
    const first = client.evaluate(request("first"), { signal: a.signal });
    const rejected = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12);
    const second = client.evaluate(request("second"));
    await vi.advanceTimersByTimeAsync(12);
    expect(send).toHaveBeenCalledTimes(1);
    a.abort();
    await rejected;
    expect(send.mock.calls[0]![1].signal.aborted).toBe(false);
    resolve(output(send.mock.calls[0]![0]));
    expect(await second).toEqual({ second: { type: "noul", noul: 0.8 } });
    expect(client.getSnapshot().traces[0]?.cached).toBe("coalesced");
    expect(client.getSnapshot().traces[1]?.discarded).toBe(true);
  });

  it("does not let a late original response overwrite a newer refresh in cache", async () => {
    const pending: {
      request: JudgmentRequest;
      resolve: (value: BatchResponse) => void;
    }[] = [];
    const send = vi.fn(
      (request: JudgmentRequest) =>
        new Promise<BatchResponse>((resolve) =>
          pending.push({ request, resolve }),
        ),
    );
    const client = new BatchedJevClient(send);
    const old = client.evaluate(request("first"));
    await vi.advanceTimersByTimeAsync(12);
    const fresh = client.evaluate(request("refresh"), { cache: "reload" });
    await vi.advanceTimersByTimeAsync(12);
    const coalescedOld = client.evaluate(request("late-subscriber"));
    await vi.advanceTimersByTimeAsync(12);
    pending[1]!.resolve(output(pending[1]!.request, 0.9));
    await fresh;
    pending[0]!.resolve(output(pending[0]!.request, 0.1));
    await old;
    await coalescedOld;
    const cached = client.evaluate(request("latest"));
    await vi.advanceTimersByTimeAsync(12);
    expect(await cached).toEqual({ latest: { type: "noul", noul: 0.9 } });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("bounds batch sizes for the standard endpoint and preserves every answer", async () => {
    const send = vi.fn(async (request: JudgmentRequest) => output(request));
    const client = new BatchedJevClient(send);
    const jobs = Array.from({ length: 40 }, (_, i) =>
      client.evaluate({
        state: {},
        questions: {
          [`q${i}`]: { type: "noul", instructions: `Question ${i}?` },
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(12);
    const results = await Promise.all(jobs);
    expect(
      send.mock.calls.map(([r]) => Object.keys(r.questions).length),
    ).toEqual([32, 8]);
    expect(results).toHaveLength(40);
    expect(results[39]).toEqual({ q39: { type: "noul", noul: 0.8 } });
  });

  it("bounds cache entries, keeps clients isolated, and does not cache rejected responses", async () => {
    const send = vi.fn(async (request: JudgmentRequest) => output(request));
    const client = new BatchedJevClient(send, { maxCacheEntries: 1 });
    for (const state of [1, 2, 1]) {
      const job = client.evaluate({ ...request("a"), state: { state } });
      await vi.advanceTimersByTimeAsync(12);
      await job;
    }
    expect(send).toHaveBeenCalledTimes(3);
    const isolated = new BatchedJevClient(send);
    const job = isolated.evaluate({ ...request("b"), state: { state: 1 } });
    await vi.advanceTimersByTimeAsync(12);
    await job;
    expect(send).toHaveBeenCalledTimes(4);
    const invalid = vi
      .fn()
      .mockResolvedValueOnce({ answers: {} })
      .mockImplementation(async (r: JudgmentRequest) => output(r));
    const retryClient = new BatchedJevClient(invalid);
    const failed = expect(retryClient.evaluate(request("a"))).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12);
    await failed;
    const retry = retryClient.evaluate(request("a"));
    await vi.advanceTimersByTimeAsync(12);
    await retry;
    expect(invalid).toHaveBeenCalledTimes(2);
  });
});
