# Providers and Cloudflare Workers

Where the program runs and where inference runs are separate choices. The same hooks and scheduling work across these adapters:

| Adapter | Inference endpoint | Node | Workers (Node compatibility) |
| --- | --- | --- | --- |
| `OpenRouterJevAdapter` | OpenRouter Decisions | Yes | Yes, pass the key explicitly |
| `TypeSafeJevAdapter` | Official TypeSafe SDK | Yes | Yes, configure the client explicitly |
| `CloudflareJevAdapter` | Cloudflare AI binding or REST | REST | Binding or REST |
| `VercelJevAdapter` | AI Gateway's TypeSafe-compatible endpoint | Yes | Yes, pass the key explicitly |
| `MockJudgmentAdapter` | No inference | Yes | Yes |

## Cloudflare provider

Inside Workers, pass the platform binding directly. No Cloudflare npm dependency or separate API token is required for this path:

```ts
import { CloudflareJevAdapter, run } from "jev-hooks";
const result = await run(Program, {
  input,
  adapter: new CloudflareJevAdapter({ ai: env.AI }),
});
```

The adapter calls `env.AI.run("typesafe/jev", { state, questions })`, preserving Choice, Noul, and Score. This is the binding contract documented on [Cloudflare's Jev model page](https://developers.cloudflare.com/ai/models/typesafe/jev/).

From Node or Workers without an AI binding:

```ts
const adapter = new CloudflareJevAdapter({
  accountId: accountId,
  apiToken: apiToken,
  timeoutMs: 20_000,
  // Optional: signal, fetch, expectedResponseModel
});
```

REST uses `POST https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run` with `{ model: "typesafe/jev", input: { state, questions } }`. It accepts the model response directly or Cloudflare's successful `result` envelope. HTTP/API errors, missing answers, invalid distributions, and unsupported states fail. Requests and streamed responses have size limits; cancellation and timeout are supported for REST. The binding path follows `AI.run`'s lifecycle and does not promise a transport cancellation API.

Cloudflare may return a versioned model name such as `jev-1.13.0`; `expectedResponseModel` optionally pins it exactly. Without that option, the actual returned model is recorded but not version-pinned. REST credentials are explicit, never read from the original repository or copied into traces.

## Vercel AI Gateway

```ts
import { VercelJevAdapter } from "jev-hooks";
const adapter = new VercelJevAdapter({
  apiKey: gatewayKey,
  // model: "typesafe-ai/jev",
  // expectedResponseModel: "typesafe-ai/jev",
  // timeoutMs: 20_000, signal, fetch
});
```

On Node, `apiKey` can be omitted to use `AI_GATEWAY_API_KEY`. An explicit Vercel OIDC token is also accepted as `apiKey`; automatic token refresh is the application's responsibility. This never falls back to `TYPESAFE_API_KEY`.

The adapter uses the official TypeSafe SDK with base URL `https://ai-gateway.vercel.sh/typesafe`, calling `/v1/systemone`. This is Vercel's documented [TypeSafe-compatible API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe). It preserves native Noul/Choice/Score names and distributions without pulling in the full AI SDK or translating Boolean answers. It is not an adapter for arbitrary AI SDK evaluation models.

The default request and expected response model are `typesafe-ai/jev`. Change `expectedResponseModel` explicitly if the gateway returns a different canonical ID. Retries are disabled, timeout defaults to 20 seconds, and an already-aborted signal prevents a transport call. SDK errors remain available as the runtime batch error's cause.

Usage and original `provider_metadata`, including gateway routing/cost data, are retained in structured trace metadata. Gateway-specific cost is not invented or silently converted into a generic cost field. Like every adapter, malformed or missing answers fail before caching.

## Workers deployment shape

The same package root works in Workers; there is no second, weaker hooks API. Runtime code uses supported Node-compatibility APIs for hashing and type checks. Configure the tested baseline:

```json
{
  "name": "my-judgments",
  "main": "src/worker.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" }
}
```

Do not import `jev-hooks/check` into a Worker. Run `jev-check` on the development machine/CI before bundling. Secrets should be Worker bindings passed explicitly to adapters, not a dependency on `process.env` population. Example alternatives inside the handler:

```ts
new OpenRouterJevAdapter({ apiKey: env.OPENROUTER_API_KEY });
new VercelJevAdapter({ apiKey: env.AI_GATEWAY_API_KEY });
new TypeSafeJevAdapter(new TypeSafeClient({
  apiKey: env.TYPESAFE_API_KEY,
  baseURL: "https://api.typesafe.ai",
  retry: { maxRetries: 0 },
}));
```

`examples/worker` provides a bounded POST endpoint, input validation, and server-selected provider. It returns answers and pass/request counts, not the full sensitive trace. The default `JEV_PROVIDER=mock` needs no network or credentials. Run `pnpm demo:worker`, then POST `{ "message": "Please refund this" }` to localhost:8787. `pnpm build:worker` writes a dry-run bundle under `.wrangler/build`; it does not deploy anything.

For Cloudflare inference, set `JEV_PROVIDER` to `cloudflare` and configure `ai: { binding: "AI", remote: true }` for live inference during local development. The AI binding calls a remote paid service; this is not offline model execution. Other provider choices are `openrouter`, `typesafe`, and `vercel`, with their corresponding Worker secrets. Add authentication and rate/spend controls before publicly deploying a live endpoint.

## Verification boundaries

- Node unit tests check provider payloads, credentials, batching, metadata, error propagation, model identity, and cancellation using injected transports.
- Workers tests execute in actual local **workerd** through Miniflare, not a Node emulation. All four adapters, batching, dependent stages, concurrent requests, immutable-input safety, and Node ↔ Workers replay are exercised with simulated provider responses. Outbound network is prohibited in those tests.
- The installed npm archive is separately bundled and run inside workerd, verifying package exports and dependencies rather than just relative source imports.
- Proxy rejection, async-function detection, and identical SHA-256 fingerprints are tested in workerd `1.20260918.1`. We have not weakened Node safety checks to make Workers pass. Earlier runtimes/compatibility dates are not claimed supported.
- `pnpm test:providers:live` is an explicit paid-inference opt-in. It skips Cloudflare unless both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` exist, and skips Vercel unless `AI_GATEWAY_API_KEY` exists. A local passing test is not a claim that a hosted Worker was deployed or that a provider account's billing/permissions were verified.

The root entry is an ESM backend computation runtime. Browser React execution is available separately through `jev-hooks/react`. Non-Node-compatible server edge runtimes, durable persistence and workflow orchestration are not included.

### Local verification, 2026-09-20

99 tests passed on Node 24.21.0 and Node 26.0.0 (one direct-TypeSafe integration test skipped). This includes 11 workerd tests and 16 Cloudflare/Vercel provider tests. The isolated npm consumer ran successfully on Node and in workerd; Wrangler's dry-run build and a real local HTTP POST to the example also passed. The HTTP response reported two passes and one batched mock request. Cloudflare/Vercel live checks skipped for missing credentials. Nothing was deployed or published as part of this work.
