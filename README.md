![jev-hooks — Ambient state for AI applications. React hooks or a backend-only program.](https://raw.githubusercontent.com/microchipgnu/jev-hooks/main/.github/assets/jev-hooks-header.png?v=2)

# jev-hooks

**Compose meaning like state.**

[GitHub](https://github.com/microchipgnu/jev-hooks) · [npm](https://www.npmjs.com/package/jev-hooks) · [Documentation](https://jev-hooks-demo.microchipgnu.workers.dev/docs/) · [React quickstart](https://jev-hooks-demo.microchipgnu.workers.dev/docs/quickstart/) · [Next.js / Vercel](https://jev-hooks-demo.microchipgnu.workers.dev/docs/vercel/) · [Cloudflare Workers](https://jev-hooks-demo.microchipgnu.workers.dev/docs/cloudflare/)

```sh
npm install jev-hooks
```

Jev Hooks derives typed semantic values from ordinary application state. Pass one hook's result into another: the runtime discovers the dependency, waits for fresh answers, batches compatible questions and reuses unchanged interpretations.

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

No required names, manual readiness flags or dependency arrays. In React, import from `jev-hooks/react` and wrap your components in `JevProvider`. Read `outlook.data?.choice` for presentation; pass `outlook` itself to compose another judgment. Share references across components through `SemanticScope` / `useAmbient`.

The server `jev-hooks` entry supports synchronous programs evaluated by `run()` on Node.js and Cloudflare Workers with Node compatibility. Both entries expose **Choice**, **Noul** and **Score**, with distinct lifecycle semantics. Existing named calls remain supported. This is an independent library, not the official TypeSafe SDK.

[React API](docs/react.md) · [Composition design and review](docs/composition.md) · [Architecture](docs/architecture.md)

## Build with an agent

Install the Jev Hooks skill in your application project:

```sh
npx skills add microchipgnu/jev-hooks --skill jev-hooks
```

The skill teaches agents both **React + backend** and **backend-only** integration, including composition, ambient scope, provider setup and mock validation. Install the library separately with `npm install jev-hooks`.

[Agent guide](https://jev-hooks-demo.microchipgnu.workers.dev/docs/agents/) · [Skill source](skills/jev-hooks/SKILL.md) · [Frontend + backend](skills/jev-hooks/references/full-stack.md) · [Backend only](skills/jev-hooks/references/backend.md)

## Worldline — event-driven world monitor

[Open the monitor](https://jev-hooks-demo.microchipgnu.workers.dev) · [Architecture, setup and limitations](docs/world-monitor.md)

**Events update facts. Jev updates meaning. Meaning propagates downstream.**

Worldline transforms the village showcase into a world situation monitor. Structured events reduce into deterministic facts; `useChoice`, `useNoul` and `useScore` maintain a semantic graph; React renders its meaning. All monitored scopes compute automatically, with no hover or selection dependency.

```text
Events → Facts → Jev semantics → Semantic dependency graph → React
```

```sh
pnpm demo:monitor         # complete simulated replay; no credentials
pnpm build:monitor        # static monitor build
pnpm dev:monitor:api      # optional live Worker API
pnpm deploy:demo          # publish monitor using the existing Worker and counters
```

The demo starts paused with **The experiment**: US facts → shared pressure → independent Japan/Europe attention → visible consequences. Click **Send US market drop**. In simulated mode, Japan enters the attention queue while Europe remains on watch. Both local market observations stay at 0%. Before/after values, the actual running hook, and the deterministic alert rule are visible together against the geographic map. Live answers may differ.

The small [attention hook](examples/monitor/semantic/attention.ts) reads ambient pressure and passes a semantic projection into `state: { pressure, exposure }`. No judgment name or dependency list is needed. Sibling region components evaluate independently; their answers update both local UI and a separate attention queue. An answer of at least 0.8 raises an on-screen alert. No external notification or transaction is performed.

**Explore full monitor** retains the interactive world map, dependency graph, Inputs/Answer/Code inspector, evidence, history and execution traces. Weather and energy scenarios open that view directly. Inspection and view switching never trigger inference. Shared usage counts remain in the footer. The desktop experiment keeps the causal sequence visible while detailed code can scroll within its panel; narrow screens switch between the experiment and running code. Legacy [#dev links](https://jev-hooks-demo.microchipgnu.workers.dev/#dev) open the full inspector.

Compatible judgments with identical normalized state share one microbatch in the SDK client. Dependent hooks wait for fresh upstream answers, forming later inference passes. Structural keys, generations and aborted subscriptions prevent old responses from activating against new facts. The Code tab shows actual nameless hooks, reference-based composition and the SDK/application boundary. Public API question IDs remain an audited transport contract; they do not wire dependencies.

Live inference stays server-side through the existing Cloudflare AI binding or official TypeSafe SDK using `TYPESAFE_API_KEY` and optional `TYPESAFE_DEFAULT_MODEL`. Choose Live Jev after starting the API. Shared public request/token/cost counts retain their original tracking start. See the [guide](docs/world-monitor.md) for configuration and count definitions.

This is structured semantic state, not generated news summaries. Facts remain reproducible without inference; Jev interprets them; ordinary code implements policy and presentation.

The earlier [Semantic Village](docs/semantic-village.md) remains runnable with `pnpm demo:village`; its batching/cache client is now shared with Worldline. `SemanticScope` and `useAmbient` remain available from `jev-hooks/react`, alongside the compatible server-side `run()` API.

## React experiments

`jev-hooks/react` provides real React `useChoice`, `useNoul`, and `useScore` hooks. Changes to declared state schedule new judgments, with debouncing, previous data, loading/errors, cancellation, and stale-response protection. React is an optional peer; server-only consumers do not need it.

```tsx
import { useChoice } from "jev-hooks/react";

// Inside a component wrapped in JevProvider:
const mood = useChoice(
  {
    state: { message, energy },
    question: "What atmosphere fits this moment?",
    options: {
      calm: "Quiet and reflective",
      playful: "Curious and playful",
      intense: "Bold and energetic",
    },
  },
  { debounceMs: 300 },
);

// Use mood.data?.choice, mood.pending, mood.error, or mood.refetch().
```

Run `pnpm demo:react` for the local atmosphere playground. It uses authored mock rules and needs no credentials. See the [React guide](docs/react.md) for provider setup, dependent judgments, and Worker/Next.js endpoints. React hooks compose through semantic references and share batching/cache automatically; `run()` retains program-level batching and replay.

## Try it

Requires Node **24+** and pnpm **10.33.0** for development. This is an independent library, not an official TypeSafe SDK.

```sh
pnpm install
pnpm build
pnpm test
pnpm demo:triage
pnpm demo:research
pnpm demo:clock
pnpm demo:replay
```

These demos use synthetic mock answers and require no credentials. For live Jev through OpenRouter, set `OPENROUTER_API_KEY` in your shell or a local `.env`, then run `pnpm demo:triage:live`. Each live demo makes paid inference calls. No credentials were copied from the source repository.

## Use in another project

Install from npm:

```sh
npm install jev-hooks
npm install --save-dev typescript@7.0.2 @types/node@24
```

For local development, build an archive with `pnpm pack`, then install it from your application's directory:

```sh
npm install /absolute/path/to/jev-hooks/jev-hooks-0.2.0.tgz
```

Import the library directly from `jev-hooks`, not `jev-runtime/native`:

```ts
import {
  run,
  useInput,
  useChoice,
  useNoul,
  useScore,
  MockJudgmentAdapter,
  formatTrace,
} from "jev-hooks";

type Ticket = { subject: string; body: string };

function Triage() {
  const ticket = useInput<Ticket>("ticket");
  const intent = useChoice("intent", {
    state: { ticket },
    question: "What is the customer's primary intent?",
    options: {
      refund: "The customer wants money returned.",
      support: "The customer needs help resolving a problem.",
      information: "The customer primarily wants information.",
    },
  });
  const urgent = useNoul("urgent", {
    state: { ticket },
    question: "Does this ticket require urgent attention?",
  });
  const severity = useScore("severity", {
    state: { ticket, intent: intent.choice, urgent: urgent.noul },
    question: "How severe is the customer's situation?",
    levels: ["Minor.", "Moderate.", "Serious."],
  });
  return { intent, urgent, severity };
}

const execution = await run(Triage, {
  input: {
    ticket: { subject: "Duplicate charge", body: "Please refund this today." },
  },
  adapter: new MockJudgmentAdapter(),
  trace: true,
});
console.log(execution.result);
console.log(formatTrace(execution.trace));
```

Without `trace: true`, `run()` returns the result directly. Without an explicit adapter, it uses `OpenRouterJevAdapter` and reads `OPENROUTER_API_KEY`. Library calls do not load `.env` automatically; example CLIs do.

```text
PASS 1   intent ──┐
                  ├── Jev request 1
         urgent ──┘
                    ↓ resolved answers
PASS 2   severity ─── Jev request 2
                    ↓
PASS 3   return resolved result (no inference)
```

Only exactly equivalent normalized state batches. Object key order does not matter; array order does. Different states are never merged into a larger context. A dependent field read suspends evaluation, then the program runs again with cached answers.

Choice keys retain their literal union. Answers preserve probabilities and other available SDK metadata rather than collapsing uncertainty into booleans. Noul is the probability of yes; Score is a probability-weighted rubric index. OpenRouter makes Choice/Score confidence and distribution metadata optional, so the types do too.

## Composition and safety

Custom hooks are ordinary functions that call these hooks. Omit IDs for automatic evaluation-local identities. If you keep explicit IDs, they must be unambiguous within a run; reusable hooks can accept an ID prefix. Database reads, tools, UI rendering, and writes belong outside the program:

```ts
const ticket = await database.getTicket(id); // your application
const result = await run(Triage, { input: { ticket } });
await existingWorkflow.route(result); // your application
```

**Programs and custom hooks must be synchronous and side-effect free.** They may execute multiple times. Async programs and Promise results fail. Inputs, state, answers, output, and traces are frozen JSON-like snapshots; unsupported values, cycles, getters, sparse arrays, functions, and class instances fail loudly.

Pending answer **field reads** suspend safely. JavaScript cannot intercept whole-object truthiness (`if (answer)`), so run the shipped safety checker on your TypeScript project before execution:

```sh
npx --no-install jev-check --project tsconfig.json
```

Add it to your application's build/typecheck script. Read `answer.choice`, `.noul`, or `.score` rather than testing the answer object. The checker requires the optional `typescript@7.0.2` peer, uses its pinned compiler API, and can also be imported from `jev-hooks/check`. The inference runtime does not load the compiler. This is **not a sandbox**: unchecked JS, `any`, or type-erasing interfaces can bypass static enforcement. TypeScript is optional for installation but required for the supported checked-program development workflow.

Use an ESM TypeScript project (`"type": "module"` in `package.json`, `"module": "NodeNext"` in `tsconfig.json`). For Node APIs, include `"types": ["node"]` in the compiler options. The isolated consumer fixture in `tests/package-consumer` is a minimal working setup.

## Adapters, traces, and replay

- `OpenRouterJevAdapter`: default, using the validated OpenRouter Decisions transport.
- `TypeSafeJevAdapter`: explicit alternative using the official `@typesafe-ai/sdk` and `TYPESAFE_API_KEY`.
- `CloudflareJevAdapter`: Workers AI binding (`{ ai: env.AI }`) or REST (`{ accountId, apiToken }`).
- `VercelJevAdapter`: Vercel AI Gateway through its TypeSafe-compatible endpoint, using `AI_GATEWAY_API_KEY` or an explicit token.
- `MockJudgmentAdapter`: deterministic tests or a custom answer callback.
- `JudgmentAdapter`: narrow interface for your own implementation.

The OpenRouter defaults are request model `typesafe/jev-1.13` and expected response model `typesafe/jev-1.13-20260917`, retained from the verified extraction. Override both when changing models. The adapter accepts `apiKey`, `fetch`, `signal`, `timeoutMs`, and request/usage callbacks. There is no application budget system; retries default to zero.

Provider support is independent of where you host the program: a Cloudflare Worker can use Cloudflare, OpenRouter, TypeSafe, or Vercel. See [providers and Workers](docs/providers-and-workers.md) for configuration, runtime requirements, and verification limits. Vercel does not add an AI SDK dependency; it reuses the official TypeSafe SDK. Gateway-specific metadata is retained in `batch.metadata.providerMetadata` when supplied.

## Cloudflare Workers

```ts
import { run, CloudflareJevAdapter } from "jev-hooks";

// Inside a Worker's fetch handler, using your declared program and AI binding:
const result = await run(Triage, {
  input: { ticket },
  adapter: new CloudflareJevAdapter({ ai: env.AI }),
});
```

The example pins `compatibility_date: "2026-09-01"` and enables `nodejs_compat`. The checker runs during development, never inside the Worker. Try the credential-free local HTTP example:

```sh
pnpm demo:worker
# In another terminal:
curl http://localhost:8787 -H 'Content-Type: application/json' \
  -d '{"message":"Please refund the duplicate charge"}'
```

The example defaults to **mock inference**. Paid providers must be selected in server configuration; HTTP clients cannot switch providers. `pnpm build:worker` is a local Wrangler dry run, not a deployment. Add authentication and abuse/spend controls before exposing live inference publicly.

Traces contain inputs, questions, batches, answers, timings, cache hits, observed read dependencies, and available usage/cost metadata. Errors include a trace and original cause. Traces may contain sensitive application data; store them accordingly.

```ts
import { replay } from "jev-hooks";
const recording = JSON.parse(JSON.stringify(execution.trace));
const repeated = await replay(Triage, recording); // no inference/network
```

Replay verifies declarations, requests, answers, dependencies, and output. It supports completed runs, not durable resume. Fingerprints establish consistency, not authenticity. Dependency edges reflect observed read order, not exact data-flow provenance.

## Interactive example

```sh
pnpm demo:chat:live
pnpm demo:chat:live --prompt "I want a refund" --trace
```

Type messages; use `/trace`, `/clear`, and `/exit`. This is a bounded support demo: Jev judges intent/detail, and TypeScript selects authored replies. It does **not** generate arbitrary answers or perform refunds. The last ten exchanges live in memory and are sent to the provider in live mode. `pnpm demo:chat` uses fixed synthetic judgments, not message interpretation.

## Verification and scope

```sh
pnpm typecheck
pnpm test
pnpm test:workers          # actual local workerd, all provider transports simulated
pnpm test:package          # packs, installs into an isolated consumer, checks types/runtime/checker
pnpm build:worker          # Wrangler dry run; no deployment
pnpm test:openrouter:live  # explicit opt-in; skips without OPENROUTER_API_KEY
pnpm test:providers:live   # explicit opt-in for Cloudflare REST and Vercel; paid if keys exist
```

Most tests are offline. The direct TypeSafe integration test skips unless `TYPESAFE_API_KEY` is set. `pnpm test:package` needs registry access (or a populated npm cache) for dependencies and retains its temporary consumer for inspection.

The package exports ESM and declarations; only `dist`, README, and documentation are shipped. No MCP/research dependencies, source-repo filesystem links, credentials, or workflow CLI are included. React integration is optional. The library provides a bounded in-memory React answer cache, but no persistent storage, tool execution, generic effect system, speculative execution, or free-form model generation. The [public React demo](docs/public-demo.md) implements its own browser/backend caches and IP/global quotas around a restricted Cloudflare endpoint.

See [architecture](docs/architecture.md) and [extraction/release notes](docs/extraction.md).
