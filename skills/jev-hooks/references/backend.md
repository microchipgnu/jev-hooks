# Backend only

```text
Request / event / job → input snapshot → run(Program)
                                      ↓ ready hook batches
                                      ↓ dependent inference passes
                                  resolved result → application effects
```

## Install and run

Use Node 24+ and an ESM TypeScript project. React is not required.

```sh
npm install jev-hooks
npm install --save-dev tsx typescript@7.0.2 @types/node@24
```

Copy [assets/backend.ts](../assets/backend.ts) as `world.ts`, then:

```sh
npx tsx world.ts
```

The supplied program composes `useScore` and `useNoul`, uses a mock adapter and prints the actual pass trace. Its answers are explicitly labeled SIMULATED.

## The program boundary

```ts
function World() {
  const market = useInput<{ changePct: number }>("market");
  const pressure = useScore({
    state: market,
    question: "How much economic pressure exists?",
    levels: ["Normal", "Elevated", "Severe"],
  });
  const attention = useNoul({
    state: { pressure: pressure.score, exposure: 0.9 },
    question: "Does this region need immediate attention?",
  });
  return { pressure, attention };
}
```

Import all four hooks and `run` from `jev-hooks`. `useInput` reads the matching key in `run`'s `input`. Read server answer fields directly. The runtime defers unresolved reads, sends ready questions, then replays the synchronous program with cached answers.

Keep this function pure and synchronous: no `await`, network calls, timers or external mutations inside it. Don't catch the runtime's unresolved-read signal. Return answer handles or primitive values; do not spread or serialize unresolved handles. Run external effects after the result resolves.

## Use live OpenRouter

```ts
import { OpenRouterJevAdapter } from "jev-hooks";

const execution = await run(World, {
  input: { market: { changePct: -4 } },
  adapter: new OpenRouterJevAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
  }),
  trace: true,
});
console.log(execution.result);
```

Set the secret in the server environment. The library does not load `.env` automatically. `run()` without an explicit adapter defaults to OpenRouter; use an explicit adapter in examples so the mock/live distinction stays obvious. For other providers, read [providers.md](providers.md).

## Events, HTTP and effects

Call `run()` inside the application's existing request, queue or event handler. A new event should first update deterministic facts, then start a new computation with that snapshot. Do not implement a per-event chain of manually ordered model calls.

The invocation resolves once. It is not a persistent subscription or background store. Caching within `run()` is per execution. Add durable storage, cross-request caching and generation checks only when the app needs them; newer events must not be overwritten by an older run finishing later.

If the UI only needs the final result, a normal endpoint can validate domain input, call `run()`, and return the result. Use React semantic hooks plus `createJevHandler` when the browser should compose the semantic graph itself. These are distinct architectures; neither requires duplicating the graph on both sides.

## Verify

With the mock adapter, check that pressure resolves before attention and that the trace shows later inference passes. To demonstrate batching, add an independent question with exactly the same input state before reading any unresolved answer fields. Execute effects after the run, not once per replay pass.

The optional `jev-check` checker requires the supported TypeScript peer. Use `npx jev-check --project tsconfig.json` for backend program safety checks. Do not run paid provider tests merely to verify local composition.
