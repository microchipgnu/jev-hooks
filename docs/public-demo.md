> The public UI now runs [Worldline](world-monitor.md). Its `/api/monitor` endpoint shares the existing cache, limits and cumulative counters. Legacy atmosphere/village endpoints remain available.

# Public React demo

The Atmosphere playground can run against a real Jev model on Cloudflare. The Worker serves both the Vite build and `POST /api/atmosphere`, so the browser needs no API key or cross-origin configuration.

Live deployment: [jev-hooks-demo.microchipgnu.workers.dev](https://jev-hooks-demo.microchipgnu.workers.dev).

```sh
pnpm demo:react   # local mock; no paid inference
pnpm deploy:demo # builds the live UI and deploys the Cloudflare Worker
```

Deployment uses the authenticated Wrangler account and the configuration in `examples/demo-worker/wrangler.jsonc`. Workers AI billing/access to `typesafe/jev` must be enabled for that account. The AI binding keeps provider access on the server.

## Restricted API

```sh
curl https://jev-hooks-demo.microchipgnu.workers.dev/api/atmosphere \
  -H 'Content-Type: application/json' \
  -d '{"message":"Soft rain, a quiet room, nothing to rush.","energy":18}'
```

The only accepted fields are `message` (up to 1,000 characters) and integer `energy` (0–100). The server owns the three fixed questions in `examples/shared/atmosphere.ts`. Clients cannot choose a model, send arbitrary questions, or change limits. A successful response contains `answers.mood`, `answers.motion`, and `answers.excitement`.

The demo-specific React client translates three hook subscriptions into one shared request containing only their state. This does not change the generic library client's behavior.

## Caches

- **Browser:** successful responses live in session memory for five minutes, with at most 100 entries. Revisiting recent state avoids HTTP entirely. Nothing is written to localStorage. Concurrent hook subscriptions share one transport.
- **Backend:** validated answers are stored in SQLite in a Durable Object for 24 hours. Cache keys include the exact parsed state, fixed questions, model identifier, and a schema version. JSON field order does not affect the key. The request is represented by a salted fingerprint; raw message text is not persisted in the demo cache.
- **Concurrent misses:** identical in-flight evaluations share one inference inside the Durable Object, across callers and regions. Completed answers survive Worker restarts and redeploys. A process crash can lose in-flight work; this is not an exactly-once billing guarantee.
- **Failures:** failed or malformed provider responses are not cached. Attempts still count toward the inference allowance, and there are no automatic retries.

`X-Jev-Cache` is `MISS`, `HIT`, or `COALESCED` on successful network responses. HTTP responses use `Cache-Control: no-store`; the two explicit application caches handle reuse. Successful answers can remain cached through provider changes for up to their TTL; bump the cache version to invalidate them when changing behavior. The global daily quota key deliberately does not change with the cache version.

## Public usage totals

`GET /api/usage` returns persistent aggregate counters, also included as `usage` in successful judgment responses. The UI refreshes these totals every 30 seconds while visible and after network judgments. Metrics reads do not consume inference quotas or increment request counts. Poll responses allow ten seconds of browser caching.

Counters start when usage tracking was installed (`since`); earlier traffic cannot be reconstructed. `requests` counts valid demo requests reaching the quota ledger, including quota rejections. It excludes malformed/edge-rejected requests, usage polling, and browser-memory cache hits. `inferenceCalls` counts new upstream attempts, including failures. `cacheHits` and `coalescedRequests` count successful reuse without another upstream call. Totals survive daily quota cleanup and redeployments.

`inputTokens`, `outputTokens`, and `meteredCalls` come from provider response metadata and are recorded once per actual upstream response, including a response whose answers fail validation. The estimated model cost uses the [published TypeSafe Jev rate](https://docs.typesafe.ai/models), verified September 20, 2026: **$0.042 per million input tokens; output tokens free**. Each estimate is stored at the rate in effect when that response is measured. This is an illustrative model-cost estimate, not a Cloudflare billing total; hosting, pricing differences, and attempts without reported usage are excluded. The UI explicitly identifies pending/unmetered calls and displays eight decimal places for small costs. Updating the rate in `examples/shared/usage.ts` affects future usage only.

## Limits and controls

Defaults in the Wrangler configuration:

| Control | Default |
| --- | --- |
| Requests per IP | 60 per 60-second window; 1,000 per UTC day |
| New inference attempts across all visitors | 10,000 per UTC day |
| Edge abuse guard | 120 requests/minute per IP per Cloudflare location |
| Request body | 8 KB |
| UI debounce | 650 ms |

The Durable Object reserves quotas atomically before inference. Cache hits and shared in-flight work do not consume the global inference allowance. IP limits still apply to API cache hits, while browser memory hits make no API request. Once the global allowance is used, existing cached answers remain available subject to IP limits. Quotas persist across deployments. Failed provider calls and browser disconnects do not refund reserved attempts.

Limit responses use HTTP `429` with `Retry-After` and a scope (`ip-minute`, `ip-day`, `demo-day`, or `ip-burst`). The browser honors the cooldown while allowing locally cached results. A notice beside the controls explains the rate limit and counts down to a manual retry; the retry button stays disabled until then. There is no automatic paid retry. The daily allowance bounds inference **attempts**, not an exact dollar amount; provider pricing and infrastructure usage determine charges.

To pause new API evaluations, set `LIVE_ENABLED` to `false` and redeploy (or run `pnpm exec wrangler deploy --config examples/demo-worker/wrangler.jsonc --var LIVE_ENABLED:false` using the existing build). This also pauses backend cache retrieval; already visible/browser-cached answers can remain on screen. Change the configured limits and redeploy to adjust them. Do not rename the Worker, Durable Object binding/class, or `public-demo-v1` object to reset limits during a live day.

Browser requests must come from the hosted origin. This is an anonymous public endpoint: an origin check is not authentication, and direct callers can use the API within its limits. IP quotas use Cloudflare's ingress IP header, never `X-Forwarded-For`; people sharing a public IP share the allowance. Distributed callers are bounded by the global inference cap. Worker execution and storage costs are not eliminated by that cap.

A singleton Durable Object keeps caching and quotas simple for this small demo. It is not the recommended topology for a high-volume service. The application does not log visitors' text or IPs, and stores salted IP fingerprints only for quota accounting. Expired rows are cleaned on access and by an hourly alarm. Text still goes to Cloudflare/Jev for inference; the UI asks visitors to avoid sensitive input.

## Verification

`pnpm exec vitest run tests/public-demo.test.ts` exercises the real local Workers runtime with simulated inference: fixed prompts, input rejection, concurrent quota enforcement, shared inference, cache expiry, persistence through restarts, failed-call accounting, IP limits, and browser caching/cooldown. Live smoke checks should verify a first `MISS`, a repeated `HIT`, and three valid judgment answers.
