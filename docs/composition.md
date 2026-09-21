# Composition review

The SDK's promise is: **compose values; the runtime tracks dependencies**.

## What the review found

The original server runtime already supported guarded answer handles, pass discovery, batching and trace replay. Its required string IDs identified declarations rather than describing dependencies. The React binding correctly handled structural inputs, debounce, cancellation and stale answers, but returned plain results. The monitor had to repeat readiness checks and maintain explicit upstream-cell lookup logic. Batching and completed caching lived only in the demos.

We retained the server scheduler, React lifecycle, validation, scoped subscriptions and public endpoint protections. We removed mandatory judgment names, added semantic references to React results, and promoted the shared browser batch/cache into the SDK.

## Public model

```tsx
const pressure = useScore({
  state: facts,
  question: "Pressure?",
  levels: ["Low", "High"],
});
const attention = useNoul({
  state: { pressure },
  question: "Needs attention?",
});
```

A result has two uses:

- `pressure.data` renders its current answer, with pending/error/stale state available.
- `pressure` composes a dependency. A downstream hook waits for a current answer automatically.

`pressure.select(a => a.score)` narrows the dependency input while retaining its identity and readiness. Passing the whole reference preserves the complete answer/distribution; selecting a score avoids unnecessary inference caused solely by distribution changes.

Internal identity, observable labels, wire IDs and cache keys have distinct roles. React assigns hook identity. Labels are optional inspector annotations. A restricted application's transport can map approved questions to fixed IDs. Cache equivalence uses state plus question definition; labels and mount IDs cannot cause collisions or unnecessary cache misses.

## Ambient composition

```tsx
<SemanticScope values={{ pressure }}>
  <Japan />
  <Europe />
</SemanticScope>
```

A descendant explicitly reads `useAmbient<SemanticResult<ScoreAnswer>>("pressure")` and can pass that reference into another hook. Scope controls availability; references establish inference dependencies. Existing additive inheritance and shadowing stay unchanged. Unrelated per-key subscribers are not notified by a changed key.

## Execution and consistency

React declares current inputs during rendering; effects schedule inference only after commit. A pending/error/stale upstream reference blocks descendants. Previous values can remain visible without entering fresh downstream inference. Responses commit only to the matching hook key, client and refresh revision; aborted subscriptions reject late activation.

Ready questions with identical state batch within 12 ms, with at most 32 question identities per request. Equivalent question definitions in one batch share an answer. Equivalent concurrent batches coalesce even when their generated IDs differ. Completed answers use a client-local five-minute LRU cache bounded to 512 entries by default. Limits are configurable and caching can be disabled. Explicit refetch bypasses this browser cache once; servers may have their own cache policy.

SDK trace records expose requests, questions, answers, errors, timing, cache reuse and canceled subscriptions. Each hook exposes its direct dependencies, resolved input and topological depth. The monitor enriches this with event evidence, source/model, affected UI components and persistent public accounting.

## Server programs

`run()` now also accepts unnamed `useChoice(config)`, `useNoul(config)` and `useScore(config)` declarations. Evaluation-local ordinal identities are deterministic during pass replay. Synchronous programs must remain deterministic and side-effect-free. Existing named declarations and recorded programs remain compatible; replay a historical trace with the historical program, since changing a program's IDs changes its recording contract.

Server handles suspend on unresolved reads. React results are asynchronous snapshots. They share the composition concept and typed judgments, but do not pretend to have identical lifecycles or execute each other's scheduler.

## Monitor migration

`semantic/hooks.ts` and `semantic/markets.tsx` use nameless hooks and actual upstream references. `select()` produces the existing audited scalar evidence without manual `enabled`, `.data`, stale checks or sentinel strings. SDK metadata supplies inspector dependencies/depth; the contract is an independent security/schema check. Automatic computation remains mounted above the map and panels. Inspection does not trigger inference.

The monitor now demonstrates ambient composition in its component structure. `MarketScope` publishes original shared references; sibling `MarketCountry` instances read them through `useAmbient` and derive local pressure. A layout-effect publication bridge forwards committed country references to regional aggregates and the inspector; this is app state publication, not inference orchestration. UI selection never mounts/unmounts those semantic components. Inspector projections live separately from composable references; copying a result with object spread loses its WeakMap registration and must not be used as a dependency.

`examples/shared/semantic-runtime.ts` delegates all queueing/cache behavior to `BatchedJevClient`. Its remaining work is question-ID translation, fixtures, live transport and application trace/accounting metadata. The Durable Object name, original tracking timestamp, rate limits and public endpoint payload remain unchanged.

## Boundaries and next work

- Results are immutable render snapshots with stable identity, not mutable global signals. Compose the current result; do not capture an old result forever in a closure or external store.
- Facts need a real React/state-store subscription. Mutating an arbitrary object does not notify Jev.
- A raw `.data` projection deliberately loses dependency metadata. Use `select()` to retain it.
- Clients isolate provider/account/cache state. Cross-client references reject; switch the client for a new provider or account.
- TTL expiry is checked on evaluation. There is no automatic paid refresh, polling, retry or persistent browser cache.
- React graph lifetime follows mounted hooks. A future headless persistent graph would need its own explicit ownership contract; this change does not add one.
- Current upstream readiness is required even if a previous selected scalar may turn out unchanged. The cache then avoids redundant downstream inference.
- Program dependency recording remains conservative for earlier resolved field reads; React reference edges are explicit and direct.
- Typed ambient keys and a framework-independent persistent subscription API are possible follow-ups. They should earn their complexity through actual usage.

## Verification

Tests exercise nameless type inference, independent batching, automatic dependent passes, reference projections, ambient propagation, label/identity separation, remount caching, cancellation, stale upstream chains, error recovery, one-shot refresh, cache expiry and program replay. Existing monitor tests run all three deterministic scenarios, check unrelated branches, event storms, late responses, shared counters and source inspection. Unit tests do not require credentials.

Official API verification: the installed and npm-published `@typesafe-ai/sdk` version was 0.6.0 at review time. Its `TypeSafeClient.systemOne({ state, questions })` interface matches the existing adapter and [official JavaScript documentation](https://docs.typesafe.ai/sdk/javascript). Provider credentials and inference remain server-side in the monitor.
