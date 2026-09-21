# Backend programs

Use the root `jev-hooks` entry in Node.js 24+ or a Cloudflare Worker with Node compatibility. React is optional and is not required for server-only installs.

```sh
npm install jev-hooks
npm install --save-dev tsx typescript@7.0.2 @types/node@24
```

Save this as `world.ts` and run `npx tsx world.ts`:

<!-- include: snippets/backend.ts -->

## How run works

The program is synchronous and replayable. Hooks declare questions; reading an unresolved answer defers that computation. `run()` evaluates ready questions, caches answers within the run, then evaluates the program again until it can return a resolved result.

Use answer fields such as `pressure.score` inside server programs. React's `.data`, `.select()` and `SemanticScope` belong to the React API, not this program API.

Keep programs pure. No network requests, timers, randomness or mutations inside the replayed function. Perform effects after `run()` resolves. The optional `jev-check` CLI catches unsafe use patterns.

## Live provider

Choose an adapter explicitly. For direct TypeSafe:

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { TypeSafeJevAdapter } from "jev-hooks";

const adapter = new TypeSafeJevAdapter(new TypeSafeClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  retry: { maxRetries: 0 },
}));
// Pass adapter to run(World, { input, adapter, trace: true }).
```

If your code imports `@typesafe-ai/sdk` directly, add it as a direct dependency: `npm install @typesafe-ai/sdk@0.6.0`. The official SDK resolves its default model; configure a model deliberately when reproducibility matters. See the [official JavaScript SDK](https://docs.typesafe.ai/sdk/javascript).

Without an explicit adapter, `run()` uses OpenRouter and `OPENROUTER_API_KEY`. Library calls do not load `.env` files automatically. Select `MockJudgmentAdapter` explicitly for offline work.

## Event-driven servers

For each new fact snapshot, invoke `run()` again from your event handler, queue consumer or scheduled job. Cache entries inside one run are not durable across runs. Use an application-level cache or adapter wrapper for cross-request reuse and coordinate concurrent generations before committing results to a shared store.

[Hosting integrations](integrations.md) cover HTTP endpoints. [Architecture](architecture.md) explains replay and checking in depth.
