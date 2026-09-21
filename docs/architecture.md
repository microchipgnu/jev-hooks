# Architecture

The library is a synchronous declaration layer over asynchronous structured inference.

The optional `jev-hooks/react` entry adds asynchronous React subscriptions driven by component state. It shares browser-safe request/answer validation with the server transport, while retaining separate lifecycle semantics from synchronous programs. `jev-hooks/server` supplies the standard Request/Response endpoint used by browser clients. See [React integration](react.md) for cancellation, deduplication, and the explicit boundary between React subscriptions and server program batching/replay.

```text
src/
  index.ts       public hooks, run/replay, adapters, trace types
  hooks/         useInput, useChoice, useNoul, useScore
  runtime/       sessions, pending handles, scheduling, snapshots, replay
  adapters/      OpenRouter, TypeSafe SDK, Cloudflare, Vercel, mock
  transport/     validated OpenRouter HTTP contract and transport errors
  trace/         structured trace, formatter, execution fingerprint
  checker/       TypeScript safety checker and jev-check CLI
```

Each evaluation installs a synchronous session. Hooks validate and register generated or explicit IDs, definitions, normalized state, and fingerprints. A hook answer is a guarded handle. Reading an unresolved field raises an internal suspension; ready declarations are grouped by canonical state and dispatched concurrently. Every batch is validated before caching; all concurrent batches settle before an error escapes. Evaluation repeats until all declarations resolve, with no-progress and pass-limit guards.

Cache keys include ID, primitive, question/criteria, and state. One fixed adapter/configuration is used per run, and caches never cross runs. A synchronous active-session boundary is sufficient because program evaluation cannot await. Async functions are rejected before their bodies execute. Side-effect freedom remains a caller contract.

Canonical JSON serialization sorts object keys by code unit, preserves array order, and rejects unsupported shapes rather than silently dropping values. Snapshotting detaches and freezes all inputs/outputs. Answer handles captured from past evaluations fail; completed results are plain data. Duplicate incompatible IDs fail; compatible repeats share a declaration.

Proxy field suspension does not make JavaScript whole-object truthiness safe. The separate checker rejects conditions, coercions, aliases, callback coercions, and explicit marker-erasing casts on marked hook answers. It depends on the pinned TypeScript 7 compiler API; importing the runtime does not import it. It is a development check, not a sandbox or complete proof against type erasure.

The scheduler depends on `JudgmentAdapter.evaluate({state, questions}, context?)`. OpenRouter is the default, using the extracted transport with its original validation, model identity check, timeout/cancellation, size limits, and usage callbacks. The official SDK adapter remains an explicit alternative. Only the SDK and Zod are mandatory runtime dependencies. No workflow policy, storage service, MCP host, or research plugin is imported.

Cloudflare adds a native `AI.run` binding path and the documented REST envelope. Vercel routes the existing official SDK through its TypeSafe-compatible gateway; no full AI SDK dependency is introduced. Provider metadata is retained separately from answer data. All provider answers undergo the same exact-ID/type/distribution validation before caching.

The package root also bundles for Cloudflare Workers with Node compatibility enabled. The runtime's synchronous session, hashing, proxy detection, and snapshots are unchanged; the program checker remains Node-only development tooling. Local workerd tests verify the actual APIs, cross-runtime replay, and every adapter with offline transport fixtures. Runtime hosting and inference-provider selection are independent.

Traces include pass boundaries, full question/state/answer snapshots, cache hits, timings, and available provider metadata. Every answer read records its ID, fingerprint, field, and status. Subsequent declarations record earlier resolved reads as conservative dependency edges. This intentionally does not claim exact value provenance or invent unreached hooks.

Replay consumes recorded answers instead of inference, verifying requests and the resulting behavioral fingerprint. Timing and provider usage are excluded from that fingerprint. Completed recordings can be serialized to JSON by application code. The runtime does not persist or resume runs, and hashes are not signatures.

Keep application integrations outside the library: fetch inputs, run a pure program, then let existing tools/workflows/renderers consume the result. Potential later extensions include scoped configuration and better dependency inspection; none require bundling an application framework now.

## React composition runtime

The React API accepts `useScore(config)`, `useChoice(config)` and `useNoul(config)`. Each hook receives an internal identity from React `useId`, stable through rerenders and Strict Mode. An optional label annotates inspection; legacy named overloads preserve their wire IDs. Internal dependency identity remains independent of those labels and wire IDs.

`src/react/reference.ts` registers immutable result snapshots in a WeakMap. Resolving a declaration recursively recognizes references inside JSON objects/arrays, records exact direct edges, and substitutes only ready answers. `select()` retains lineage/readiness while projecting a narrower JSON value. Unready inputs block evaluation immediately, including downstream chains. No user getters or `toJSON` are invoked. Cross-client dependencies reject explicitly.

`src/react/index.ts` owns commit-time scheduling, structural keys, debounce, current/error/stale state and subscription cancellation. React rerenders and per-key ambient subscriptions propagate new snapshots; no second background graph scheduler is created. The monitor keeps graph hooks mounted above its views so selection does not control inference. This is a React-owned graph, not a persistent headless signal store.

`src/react/batch.ts` owns the shared batching, bounded TTL/LRU cache, in-flight coalescing and trace. `createJevClient` composes it with validated HTTP/adapter transport by default. Equivalent state and questions reuse answers independently of names; provider/account isolation follows client identity. A changed provider/model needs a new client. Canceled results can only populate their original cache keys and cannot activate in superseded hooks. Cache refresh generations prevent older completion from replacing a newer cached refresh.

The monitor and village's `examples/shared/semantic-runtime.ts` now adapt the SDK engine to fixed public endpoint contracts and accounting metadata. Their endpoint's approved question IDs are mapped by question definition; reference-based dependency discovery happens before that mapping. Counters, credentials, rate limits and durable storage remain application responsibilities.

See [composition review](composition.md) for design decisions, migration and boundaries.
