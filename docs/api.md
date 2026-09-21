# API reference

## Entry points

| Import | Use |
| --- | --- |
| `jev-hooks/react` | React hooks, provider, semantic scope, HTTP client, browser-safe mock |
| `jev-hooks` | Backend hooks, `run`, `replay`, provider adapters, trace formatter |
| `jev-hooks/server` | `createJevHandler` for a Request/Response endpoint |
| `jev-hooks/check` | Program safety checker |

## React hooks

```ts
useChoice({ state, question, options, label? }, hookOptions?)
useNoul({ state, question, label? }, hookOptions?)
useScore({ state, question, levels, label? }, hookOptions?)
```

`options` is a record of option names to criteria. `levels` contains at least two ordered descriptions. `state` is JSON-like data that may contain semantic references. Names are optional; old `(id, config, hookOptions?)` calls still work.

All return `SemanticResult<Answer>`:

| Field | Meaning |
| --- | --- |
| `data` | Latest available typed answer, possibly from earlier inputs |
| `pending` | This hook is evaluating its own current inputs |
| `stale` | Available data is not fresh for current dependencies |
| `error` | Current local or upstream error, if any |
| `refetch()` | Refresh and bypass browser cache once |
| `select(fn)` | A projection retaining dependency/readiness metadata |
| `semantic` | ID, label, input, dependencies, pass and status |

A blocked dependent can have `pending: false`; consult `semantic.status` to distinguish blocked, disabled, pending, ready and error states.

Hook options: `debounceMs` (300 by default), `keepPreviousData` (true), `enabled` (true), `client` override and inspector `label`. Follow React's rules of hooks. Hooks schedule after commit, not during SSR.

## Client and scope

```tsx
const client = createJevClient({ endpoint: "/api/jev" });
// Or createJevClient({ adapter: new MockJudgmentAdapter() })
<JevProvider client={client}>…</JevProvider>
<SemanticScope values={{ pressure }}>…</SemanticScope>
const pressure = useAmbient<SemanticResult<ScoreAnswer>>("pressure");
```

Client options include `batching`, `timeoutMs`, request `headers` and an injected `fetch`. Endpoint and adapter modes are mutually exclusive. The default batched client exposes `subscribe()` and `getSnapshot()` for traces and cache statistics. See [React API details](react.md) for the full shapes.

## Answer shapes

- Choice: `type: "choice"`, `choice`, optional `confidence` and `probabilities`.
- Noul: `type: "noul"`, `noul` in [0, 1].
- Score: `type: "score"`, numeric `score`, optional `confidence`, `legend` and `probabilities`.

Score levels are zero-indexed; do not assume all scores are normalized to [0, 1]. Available distribution metadata depends on the provider. Do not invent missing confidence values.

## Backend

```ts
const result = await run(Program, { input, adapter });
const { result, trace } = await run(Program, { input, adapter, trace: true });
```

`Program` is synchronous and pure. `useInput<T>(key)` reads one input. Backend hooks use the same config vocabulary but return guarded answer handles. Read fields such as `.choice`, `.score`, `.noul`; return whole answers when desired. No React lifecycle is involved.

`maxPasses` defaults to 32. Without an adapter, `run` uses OpenRouter. `formatTrace(trace)` renders passes and batches. `replay` checks recorded execution; see [architecture](architecture.md).

## Adapters and endpoints

- `TypeSafeJevAdapter(client?, options?)`: official TypeSafe SDK.
- `VercelJevAdapter(options?)`: TypeSafe-compatible Vercel AI Gateway.
- `CloudflareJevAdapter({ ai })` or REST credentials: Workers AI.
- `OpenRouterJevAdapter(options?)`: OpenRouter Decisions API.
- `MockJudgmentAdapter(responder?)`: authored answers, no credentials.
- `createJevHandler({ adapter, authorize })`: standard server endpoint; adapter may be a per-request factory.

See [integration guides](integrations.md) for complete configuration and [provider notes](providers-and-workers.md) for compatibility details.
