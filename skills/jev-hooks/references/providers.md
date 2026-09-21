# Server provider wiring

All adapters below import from `jev-hooks`. Use one with `run()` or with `createJevHandler`. Never import server adapters into browser components; browser code imports `jev-hooks/react` and calls your endpoint.

## OpenRouter

```ts
import { OpenRouterJevAdapter } from "jev-hooks";
const adapter = new OpenRouterJevAdapter({
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

The adapter uses OpenRouter's typed Decisions transport. Its 0.2 defaults pin a Jev model and expected response model; inspect installed declarations/source before overriding. When selecting another model, configure its expected response identity correctly. The adapter exposes timeout, retries, usage callbacks and a request signal. Don't substitute a chat-completions API payload.

## Direct TypeSafe

If importing the official SDK yourself, declare it directly:

```sh
npm install @typesafe-ai/sdk@0.6.0
```

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { TypeSafeJevAdapter } from "jev-hooks";
const adapter = new TypeSafeJevAdapter(new TypeSafeClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  retry: { maxRetries: 0 },
}));
```

This calls `systemOne({ state, questions })`. Let the official SDK select its default model unless the application intentionally pins it. Verify current official docs before changing live SDK/provider contracts.

## Vercel AI Gateway

```ts
import { VercelJevAdapter } from "jev-hooks";
const adapter = new VercelJevAdapter({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
```

This is the TypeSafe-compatible Gateway API, not a generic AI SDK text call. Hosting a Next.js app on Vercel does not require this adapter: direct TypeSafe and OpenRouter also work. On Vercel use a Node route and Node 24 tooling/runtime.

## Cloudflare Workers AI

```ts
import { CloudflareJevAdapter } from "jev-hooks";
// Inside fetch(request, env), with an AI binding:
const adapter = new CloudflareJevAdapter({ ai: env.AI });
```

Configure `nodejs_compat`, compatibility date `2026-09-01` or a tested later baseline, and `ai: { binding: "AI" }`. For live inference in local Wrangler, `remote: true` calls a remote paid model; it is not an offline mock. Worker secrets come from `env`, so pass secrets explicitly for other adapters rather than assuming `process.env` is populated.

Cloudflare's REST adapter option is available for Node hosts using account ID and API token. Consult the SDK's current types rather than inventing binding credentials.

## Mock

```ts
import { MockJudgmentAdapter } from "jev-hooks";
const adapter = new MockJudgmentAdapter();
```

In browser code import it from `jev-hooks/react` instead. Default answers are fixtures, not input-sensitive interpretations. A responder callback can return authored typed answers by request question ID. Keep mock responses labeled and separate from live measurements.

## Endpoint lifecycle

`createJevHandler` accepts an adapter instance or `(request: Request) => adapter`. For HTTP providers, use the factory to pass `request.signal` into adapter options. Cancelling local work does not guarantee that already-started provider inference is unbilled. The generic handler validates requests/answers; it does not add rate limits, shared caching, durable usage accounting or CORS.

[Provider reference](https://jev-hooks-demo.microchipgnu.workers.dev/docs/providers-and-workers/) · [Production behavior](https://jev-hooks-demo.microchipgnu.workers.dev/docs/deployment/)
