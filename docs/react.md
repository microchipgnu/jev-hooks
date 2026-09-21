# Reactive judgments in React

`jev-hooks/react` exposes real React hooks. Component state drives judgments, and answers drive your UI. The original `jev-hooks` entry keeps the synchronous program API for Node and Cloudflare Workers; its hooks still belong inside `run()`, not inside React components.

Install React 18.2+ or 19 alongside the package. React is an optional peer, so server-only applications do not need it. The React entry bundles for browsers without Node shims, the TypeScript compiler, or provider SDKs.

## Try the atmosphere lab

```sh
pnpm install
pnpm demo:react
```

Open http://127.0.0.1:5173. Change the text or energy slider, or choose a preset. `useChoice` changes the atmosphere, `useScore` changes movement, and `useNoul` updates an energy probability. Pause/resume lets you edit without requesting new judgments.

This demo is entirely local. Its mock uses authored keyword and energy rules, with artificial latency; it does not understand arbitrary text or call an AI service. `pnpm build:react` creates a static build in `.playground-dist`.

## Set up a client

Create one stable client per application/session, outside a component or with `useMemo`. A new client identity causes hooks to rerun and hides the old client's data. Replace the client when switching accounts. For real inference, use an endpoint on your server; never put provider API keys in browser code.

```tsx
"use client";
import { JevProvider, createJevClient } from "jev-hooks/react";

const client = createJevClient({ endpoint: "/api/jev" });

export function Providers({ children }: { children: React.ReactNode }) {
  return <JevProvider client={client}>{children}</JevProvider>;
}
```

For local experiments, substitute `createJevClient({ adapter: new MockJudgmentAdapter() })`, importing both from `jev-hooks/react`. The default mock returns fixed synthetic answers. Pass a custom responder to make a deterministic mock react to inputs, as the atmosphere lab does. The client also accepts any browser-compatible `JudgmentAdapter`; its optional `EvaluationContext.signal` communicates cancellation.

## Use component state

```tsx
import { useState } from "react";
import { useChoice } from "jev-hooks/react";

export function Mood() {
  const [message, setMessage] = useState("");
  const mood = useChoice(
    {
      state: { message },
      question: "What atmosphere fits this moment?",
      options: {
        calm: "Quiet and reflective",
        playful: "Curious and playful",
        intense: "Bold and energetic",
      },
    },
    { debounceMs: 300, enabled: message.trim().length > 0 },
  );

  return (
    <div data-mood={mood.data?.choice ?? "calm"}>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
      <p>{mood.pending ? "Judging…" : mood.data?.choice}</p>
      {mood.error && <button onClick={mood.refetch}>Try again</button>}
    </div>
  );
}
```

`useNoul({ state, question }, options)` and `useScore({ state, question, levels }, options)` behave the same way. Choice keys retain their literal union. Noul is a probability between 0 and 1. Score is a rubric index, potentially fractional, from 0 through `levels.length - 1`.

Every hook returns:

| Field        | Meaning                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `data`       | Latest successful validated answer, initially undefined                                         |
| `pending`    | Enabled and waiting through debounce or inference                                               |
| `error`      | Failure for the current request, if any                                                         |
| `stale`      | Visible data is from older inputs, or a refresh is pending                                      |
| `refetch()`  | Explicit refresh, bypassing this client’s completed cache once; respects `enabled` and debounce |
| `semantic`   | Internal ID, optional label, resolved input, direct dependencies, depth and status              |
| `select(fn)` | A semantic reference to a pure projection of the answer                                         |

Options are `debounceMs` (default 300), `enabled` (default true), `keepPreviousData` (default true), and an optional `client` override. Zero debounce still schedules after the component commits. Invalid declarations are programmer errors and throw during rendering; transport and provider failures populate `error`.

Inputs are compared structurally. Recreated objects or reordered object keys do not cause calls, but changing state, the question, candidates/rubric, does. Hook identity is automatic; an optional `label` in the declaration is only an inspector annotation. Legacy `useScore(id, config, options)` calls remain supported. Use plain JSON data: no functions, undefined, nonfinite numbers, cycles, class instances, sparse arrays, accessors, or symbol properties. Browser JavaScript cannot reliably detect arbitrary Proxy objects; do not supply them. The Node program runtime retains its existing stronger proxy checks.

No inference starts during React rendering or SSR. Effects schedule work after commit. Rapid changes reset the trailing debounce; unmounting, disabling, or changing inputs cancels that subscription. Superseded responses cannot update the hook. HTTP requests abort when their final subscriber leaves; custom adapters may ignore cancellation, and an abort does not promise to stop already-billed remote inference. Equivalent requests on the same client share in-flight work and a bounded completed-answer cache. Cache state is client-local, never global. There are no automatic retries or focus/reconnect refetches.

## Compose semantic values

Pass a hook result into another hook's `state`. The SDK recognizes the reference, substitutes its validated answer, records a dependency, and waits for a fresh answer. No name, dependency array or readiness boolean is necessary.

```tsx
const pressure = useScore({
  state: market,
  question: "How much international economic pressure exists?",
  levels: ["Normal", "Elevated", "Severe"],
});
const outlook = useChoice({
  state: { pressure, exposure },
  question: "What outlook do these conditions imply?",
  options: {
    calm: "Limited local impact.",
    watch: "Conditions warrant attention.",
    strained: "Significant local pressure.",
  },
});
```

References can be nested in plain objects and arrays. Passing the complete reference includes the full answer, including available uncertainty. Use `pressure.select(answer => answer.score)` when only its score should affect downstream inputs. Selectors must be pure and return JSON. Using `pressure.data` instead is an explicit escape to plain data: it carries no readiness or dependency metadata.

An upstream change immediately blocks descendants. Previous answers may remain visible with `stale: true`, but cannot enter a new downstream request. Upstream errors propagate through `error`; descendants remain `semantic.status === "blocked"` until their inputs recover. `pending` describes this hook's own scheduled/in-flight evaluation, while `semantic.status` also distinguishes blocked and disabled hooks.

Results are immutable **render snapshots with stable hook identity**, not mutable signals. Always compose the current result; don't capture it permanently in an empty-dependency memo or external store. Normal React Rules of Hooks and closures apply. Facts still come from React, Redux, Zustand or your external-store selector. Passing an object does not subscribe to arbitrary mutations of that object.

## Batching and cache

`createJevClient` now includes the SDK's `BatchedJevClient` by default:

```ts
const client = createJevClient({
  endpoint: "/api/jev",
  batching: {
    batchWindowMs: 12,
    cacheTimeMs: 300_000,
    maxCacheEntries: 512,
    maxTraces: 100,
  },
});
```

Ready declarations with identical normalized state join one request (at most 32 questions for the standard endpoint). Dependent judgments become eligible after upstream answers resolve. Incompatible legacy IDs are partitioned. Equivalent questions in a batch reuse one answer, even with different generated identities.

Completed-answer keys use full canonical state and question definition, never labels or React IDs. Unmount/remount can reuse an answer for unchanged evidence. Errors are not cached. Set `cacheTimeMs: 0` to disable completed caching, or `batching: false` to use the low-level transport without batching/cache. Change the client when switching account, provider or model configuration. Expiry is checked on evaluation; it does not trigger background refreshes. `refetch()` bypasses the browser cache once; a server cache may still satisfy the request.

The default client exposes `subscribe` / `getSnapshot` for its bounded batch trace: inputs, questions, validated answers, timing, cache reuse, errors and discarded subscriptions. `result.semantic` exposes dependency metadata and depth. Depth is topological, not elapsed time or a global transaction count. Applications can add provenance, consumer labels and persistence; the monitor does so without implementing another cache or readiness scheduler.

The React binding uses commit-time effects and normal React propagation. The synchronous server `run()` API uses evaluation passes and guarded answer handles; it also accepts nameless judgments. React snapshots are not server program handles, and React does not invoke `run()` internally. Server trace replay remains a program feature, not a browser-session replay facility.

## Next.js / Vercel endpoint

The `jev-hooks/server` entry exports `createJevHandler`, a standard `(Request) => Promise<Response>` handler. It accepts `{ state, questions }` and returns `{ answers }`. It validates requests and responses, bounds requests to 200KB and 32 questions, omits provider error details and full traces, and sends `Cache-Control: no-store`. The browser client also bounds responses to 1MB and defaults to a 20-second timeout.

```ts
// app/api/jev/route.ts
import { createJevHandler } from "jev-hooks/server";
import { VercelJevAdapter } from "jev-hooks";
import { authorizeJudgmentRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const POST = createJevHandler({
  authorize: authorizeJudgmentRequest,
  adapter: (request) => new VercelJevAdapter({ signal: request.signal }),
});
```

Configure Node 24+ and `AI_GATEWAY_API_KEY` on the server. `authorizeJudgmentRequest` is your application's function, not an export of this package. It must return a boolean and should check the user, request origin/CSRF policy, and per-user rate/spend allowance before permitting inference. The callback is required; there is no implicit anonymous paid endpoint. An adapter factory lets each request receive a provider adapter with its own cancellation signal.

## Cloudflare Workers endpoint

```ts
import { createJevHandler } from "jev-hooks/server";
import { CloudflareJevAdapter, type CloudflareAiBinding } from "jev-hooks";

type Env = { AI: CloudflareAiBinding };
export default {
  fetch(request: Request, env: Env) {
    return createJevHandler({
      authorize: authorizeJudgmentRequest,
      adapter: new CloudflareJevAdapter({ ai: env.AI }),
    })(request);
  },
};
```

Supply your own `authorizeJudgmentRequest`, configure the AI binding and `nodejs_compat`, and use the tested compatibility baseline in [providers and Workers](providers-and-workers.md). The binding's remote inference is paid; it does not expose a transport cancellation guarantee. OpenRouter and other adapters can also be used from the same endpoint.

For cross-origin deployments, implement CORS and authentication in your application wrapper; the handler intentionally has no wildcard CORS policy. Same-origin cookie authentication works with the client's `credentials: "same-origin"`; custom endpoint headers or a custom fetch function are also supported.

## Validation

The [public Atmosphere demo](public-demo.md) adds a restricted live endpoint, shared evaluation of its three fixed questions, browser/backend caches, and persistent IP/global quotas. Endpoint allowlists, persistent accounting and rate limits are application-level controls. Batching and browser caching are now SDK features.

React tests cover Strict Mode, trailing debounce, equivalent inputs, stale-response races, previous data, enable/disable, error recovery, explicit refetch, cancellation, shared in-flight requests, ID isolation, Choice typing, dependent hooks, and SSR. HTTP tests cover endpoint round trips, authorization, malformed data, byte limits, provider errors, and timeouts. Browser bundle checks ensure the React entry does not import Node modules, the compiler, or provider SDKs. The existing Node and Workers suites continue to exercise the original runtime.

## Ambient semantic scopes

`SemanticScope` and `useAmbient` are exported from `jev-hooks/react`. Nested scopes add values; an explicitly present local key shadows its ancestor. Missing keys inherit and unmount removes subscriptions. Consumers subscribe per key.

```tsx
<SemanticScope values={{ "village.mood": mood }}>
  <Map />
  <Timeline />
</SemanticScope>;
// Inside a descendant:
const mood = useAmbient<SemanticResult<ChoiceAnswer>>("village.mood");
// Pass mood into another hook’s state to retain the dependency.
```

[Semantic Village](semantic-village.md) demonstrates the complete pattern with real hooks, a microbatching client, a four-level scope hierarchy, lazy dependency-aware caching and a server-only live endpoint. The village and world monitor use the same SDK batching/cache engine as the ordinary React client. Their thin adapters add domain contracts and usage metadata.
