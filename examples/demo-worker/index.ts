import type { DurableObjectState } from "@cloudflare/workers-types";
import { z } from "zod";
import { jsonKey } from "../../src/react/json.js";
import {
  monitorRequestSchema,
  questionsFor as monitorQuestions,
} from "../monitor/semantic/contract.js";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { TypeSafeJevAdapter } from "../../src/adapters/typesafe.js";
import {
  villageRequestSchema,
  questionsFor,
} from "../village/semantic/contract.js";
import {
  CloudflareJevAdapter,
  type CloudflareAiBinding,
} from "../../src/adapters/cloudflare.js";
import { BodyTooLargeError, readJson } from "../../src/transport/read-json.js";
import type { RuntimeAnswer } from "../../src/types.js";
import { inputUsdPerMillion, type DemoUsage } from "../shared/usage.js";
import { atmosphereQuestions } from "../shared/atmosphere.js";

export interface DemoEnv {
  AI: CloudflareAiBinding;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_DEFAULT_MODEL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  BUDGET: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
  BURST: { limit(options: { key: string }): Promise<{ success: boolean }> };
  LIVE_ENABLED: string;
  DAILY_LIMIT: string;
  IP_DAILY_LIMIT: string;
  IP_MINUTE_LIMIT: string;
}

const inputSchema = z
  .object({
    message: z.string().max(1000),
    energy: z.number().int().min(0).max(100),
  })
  .strict();

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function limited(scope: string, seconds: number) {
  return json(
    {
      error: "Demo limit reached. Please try again later.",
      scope,
      retryAfter: seconds,
    },
    429,
    { "Retry-After": String(seconds) },
  );
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

type Answers = Readonly<Record<string, RuntimeAnswer>>;
type Check = { key: string; window: number; limit: number; scope: string };

/** Small-demo singleton: persistent cache + quotas, with shared in-flight inference. */
export class DemoBudget {
  private pending = new Map<
    string,
    Promise<{ answers: Answers; model: string }>
  >();
  private salt: string;

  constructor(
    private ctx: DurableObjectState,
    private env: DemoEnv,
  ) {
    const sql = ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS quotas (key TEXT PRIMARY KEY, expires INTEGER NOT NULL, count INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, expires INTEGER NOT NULL, answers TEXT NOT NULL)",
    );
    if (
      !sql
        .exec<{ name: string }>("PRAGMA table_info(cache)")
        .toArray()
        .some((column) => column.name === "model")
    )
      sql.exec("ALTER TABLE cache ADD COLUMN model TEXT");
    sql.exec(`CREATE TABLE IF NOT EXISTS usage_totals (
      id INTEGER PRIMARY KEY CHECK (id = 1), since INTEGER NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0, inferenceCalls INTEGER NOT NULL DEFAULT 0,
      cacheHits INTEGER NOT NULL DEFAULT 0, coalescedRequests INTEGER NOT NULL DEFAULT 0,
      meteredCalls INTEGER NOT NULL DEFAULT 0, inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0, estimatedCostUsd REAL NOT NULL DEFAULT 0
    )`);
    sql.exec(
      "INSERT OR IGNORE INTO usage_totals (id, since) VALUES (1, ?)",
      Date.now(),
    );
    sql.exec("CREATE TABLE IF NOT EXISTS salt (value TEXT NOT NULL)");
    this.salt = ctx.storage.transactionSync(() => {
      const stored = sql
        .exec<{ value: string }>("SELECT value FROM salt")
        .toArray()[0];
      if (stored) return stored.value;
      const value = crypto.randomUUID();
      sql.exec("INSERT INTO salt VALUES (?)", value);
      return value;
    });
  }

  private usage(): DemoUsage {
    const { id: _id, ...usage } = this.ctx.storage.sql
      .exec<
        DemoUsage & { id: number }
      >("SELECT * FROM usage_totals WHERE id = 1")
      .toArray()[0]!;
    return usage;
  }

  private reserve(checks: Check[], now: number) {
    return this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM quotas WHERE expires <= ?", now);
      for (const check of checks) {
        const row = this.ctx.storage.sql
          .exec<{
            count: number;
            expires: number;
          }>("SELECT count, expires FROM quotas WHERE key = ?", check.key)
          .toArray()[0];
        if (row && row.count >= check.limit)
          return limited(check.scope, row.expires - now);
      }
      for (const check of checks) {
        this.ctx.storage.sql.exec(
          "INSERT INTO quotas (key, expires, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1",
          check.key,
          now + check.window,
        );
      }
      return null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/usage" && request.method === "GET")
      return json(this.usage());
    const {
      ip,
      state: input,
      village,
      monitor,
    } = (await request.json()) as {
      ip: string;
      state?: unknown;
      village?: unknown;
      monitor?: unknown;
    };
    if (typeof ip !== "string" || !ip)
      return json({ error: "IP required" }, 400);
    const villageRequest =
      village === undefined ? undefined : villageRequestSchema.parse(village);
    const monitorRequest =
      monitor === undefined ? undefined : monitorRequestSchema.parse(monitor);
    const state =
      monitorRequest?.input ??
      villageRequest?.input ??
      inputSchema.parse(input);
    const judgmentQuestions = monitorRequest
      ? monitorQuestions(monitorRequest.input.scopeId, monitorRequest.ids)
      : villageRequest
        ? questionsFor(villageRequest.input.kind, villageRequest.ids)
        : atmosphereQuestions;
    const configuredModel = this.env.TYPESAFE_API_KEY
      ? (this.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest")
      : "typesafe/jev";
    this.ctx.storage.sql.exec(
      "UPDATE usage_totals SET requests = requests + 1 WHERE id = 1",
    );
    const limits = [
      this.env.IP_MINUTE_LIMIT,
      this.env.IP_DAILY_LIMIT,
      this.env.DAILY_LIMIT,
    ].map(Number);
    if (limits.some((value) => !Number.isSafeInteger(value) || value < 1))
      return json({ error: "Demo unavailable." }, 503);
    const now = Math.floor(Date.now() / 1000);
    const midnight = (Math.floor(now / 86400) + 1) * 86400;
    // Only salted fingerprints and answers are persisted, never raw IPs or messages.
    const [hash, key] = await Promise.all([
      digest(`${this.salt}:${midnight}:${ip}`),
      digest(
        `${this.salt}:${(monitorRequest ? jsonKey : JSON.stringify)({ version: 1, model: configuredModel, state, questions: judgmentQuestions })}`,
      ),
    ]);
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + 3600_000);
    const denied = this.reserve(
      [
        {
          key: `minute:${hash}`,
          window: 60,
          limit: limits[0]!,
          scope: "ip-minute",
        },
        {
          key: `day:${hash}`,
          window: midnight - now,
          limit: limits[1]!,
          scope: "ip-day",
        },
      ],
      now,
    );
    if (denied) return denied;
    this.ctx.storage.sql.exec("DELETE FROM cache WHERE expires <= ?", now);
    const cached = this.ctx.storage.sql
      .exec<{
        answers: string;
        model: string | null;
      }>("SELECT answers, model FROM cache WHERE key = ?", key)
      .toArray()[0];
    if (cached) {
      this.ctx.storage.sql.exec(
        "UPDATE usage_totals SET cacheHits = cacheHits + 1 WHERE id = 1",
      );
      return json(
        {
          answers: JSON.parse(cached.answers),
          usage: this.usage(),
          model: cached.model ?? configuredModel,
        },
        200,
        { "X-Jev-Cache": "HIT" },
      );
    }
    let inference = this.pending.get(key);
    const shared = !!inference;
    if (!inference) {
      const budget = this.reserve(
        [
          {
            key: "global",
            window: midnight - now,
            limit: limits[2]!,
            scope: "demo-day",
          },
        ],
        now,
      );
      if (budget) return budget;
      this.ctx.storage.sql.exec(
        "UPDATE usage_totals SET inferenceCalls = inferenceCalls + 1 WHERE id = 1",
      );
      // Reserve before inference, never refund errors or retry automatically.
      inference = Promise.resolve()
        .then(async () => {
          let model = configuredModel;
          const adapter = this.env.TYPESAFE_API_KEY
            ? new TypeSafeJevAdapter(
                new TypeSafeClient({
                  apiKey: this.env.TYPESAFE_API_KEY,
                  defaultModel: configuredModel,
                  retry: { maxRetries: 0 },
                  timeout: 20_000,
                  logLevel: "off",
                }),
              )
            : new CloudflareJevAdapter({ ai: this.env.AI });
          const answers = await adapter.evaluate(
            { state, questions: judgmentQuestions },
            {
              onResponse: ({ usage, model: reportedModel }) => {
                model = reportedModel;
                // Recorded once per upstream response, never on cache replay.
                // Persist the estimate at this rate so future price edits do not reprice history.
                this.ctx.storage.sql.exec(
                  `UPDATE usage_totals SET
                meteredCalls = meteredCalls + 1,
                inputTokens = inputTokens + ?, outputTokens = outputTokens + ?,
                estimatedCostUsd = estimatedCostUsd + ? WHERE id = 1`,
                  usage.input_tokens,
                  usage.output_tokens,
                  (usage.input_tokens * inputUsdPerMillion) / 1_000_000,
                );
              },
            },
          );
          const expires = Math.floor(Date.now() / 1000) + 86400;
          this.ctx.storage.sql.exec(
            "INSERT OR REPLACE INTO cache (key, expires, answers, model) VALUES (?, ?, ?, ?)",
            key,
            expires,
            JSON.stringify(answers),
            model,
          );
          return { answers, model };
        })
        .finally(() => {
          this.pending.delete(key);
        });
      this.pending.set(key, inference);
      // Complete and cache a paid inference even if the browser navigates away.
      this.ctx.waitUntil(inference.catch(() => {}));
    }
    try {
      const { answers, model } = await inference;
      if (shared)
        this.ctx.storage.sql.exec(
          "UPDATE usage_totals SET coalescedRequests = coalescedRequests + 1 WHERE id = 1",
        );
      return json({ answers, model, usage: this.usage() }, 200, {
        "X-Jev-Cache": shared ? "COALESCED" : "MISS",
      });
    } catch {
      return json(
        {
          error:
            "Live judgments are temporarily unavailable. Please try again later.",
        },
        502,
      );
    }
  }

  async alarm() {
    const now = Math.floor(Date.now() / 1000);
    this.ctx.storage.sql.exec("DELETE FROM quotas WHERE expires <= ?", now);
    this.ctx.storage.sql.exec("DELETE FROM cache WHERE expires <= ?", now);
    const count = this.ctx.storage.sql
      .exec<{
        total: number;
      }>(
        "SELECT (SELECT COUNT(*) FROM quotas) + (SELECT COUNT(*) FROM cache) AS total",
      )
      .toArray()[0]!.total;
    if (count) await this.ctx.storage.setAlarm(Date.now() + 3600_000);
  }
}

export default {
  async fetch(request: Request, env: DemoEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (
      ["/api/village/config", "/api/monitor/config"].includes(url.pathname) &&
      request.method === "GET"
    )
      return json({
        live:
          env.LIVE_ENABLED === "true" &&
          Boolean(env.AI || env.TYPESAFE_API_KEY),
        model: env.TYPESAFE_API_KEY
          ? (env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest")
          : "typesafe/jev",
      });
    if (url.pathname === "/api/usage") {
      if (request.method !== "GET")
        return json({ error: "Use GET." }, 405, { Allow: "GET" });
      try {
        const response = await env.BUDGET.getByName("public-demo-v1").fetch(
          new Request("https://budget/usage"),
        );
        // Public aggregate counters only; browser reuse keeps polling inexpensive.
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "public, max-age=10, s-maxage=10");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch {
        return json({ error: "Usage temporarily unavailable." }, 503);
      }
    }
    if (
      !["/api/atmosphere", "/api/village", "/api/monitor"].includes(
        url.pathname,
      )
    )
      return json({ error: "Not found." }, 404);
    if (request.method !== "POST")
      return json({ error: "Use POST." }, 405, { Allow: "POST" });
    if (env.LIVE_ENABLED !== "true")
      return json({ error: "Live demo is paused." }, 503);
    // Prevent other websites from using this browser endpoint. Origin is not authentication.
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: "This endpoint is for the hosted demo." }, 403);
    if (
      request.headers
        .get("Content-Type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    )
      return json({ error: "Send application/json." }, 415);
    // Cloudflare supplies this header at ingress. Never trust X-Forwarded-For.
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return json({ error: "Demo unavailable." }, 503);
    try {
      // Cheap per-location abuse guard; the DO below owns the exact inference limits.
      if (!(await env.BURST.limit({ key: ip })).success)
        return limited("ip-burst", 60);
      let state, village, monitor;
      try {
        if (url.pathname === "/api/monitor")
          monitor = monitorRequestSchema.parse(
            await readJson(request.body, 32768),
          );
        else if (url.pathname === "/api/village")
          village = villageRequestSchema.parse(
            await readJson(request.body, 16384),
          );
        else state = inputSchema.parse(await readJson(request.body, 8192));
      } catch (error) {
        return json(
          {
            error:
              url.pathname === "/api/monitor"
                ? "Invalid monitor facts, dependency values, scope, or question IDs."
                : url.pathname === "/api/village"
                  ? "Invalid village facts, inherited values, scope, or question IDs."
                  : "Expected message (up to 1,000 characters) and integer energy (0–100).",
          },
          error instanceof BodyTooLargeError ? 413 : 400,
        );
      }
      return await env.BUDGET.getByName("public-demo-v1").fetch(
        new Request("https://budget/evaluate", {
          method: "POST",
          body: JSON.stringify({ ip, state, village, monitor }),
        }),
      );
    } catch {
      // Never expose provider diagnostics or log visitors' text/IPs.
      return json(
        {
          error:
            "Live judgments are temporarily unavailable. Please try again later.",
        },
        502,
      );
    }
  },
};
