# Semantic Village

**React made UI a function of state. Jev hooks let meaning become part of that state.**

This earlier experiment is preserved locally (`pnpm demo:village`); the public endpoint now hosts [Worldline](world-monitor.md). Five illustrated districts, five households, fifteen named residents, and one semantic lens. The simulation knows what happened. Jev derives what it means. Meaning propagates like state.

## Run it

```sh
pnpm install
pnpm demo:village
# http://127.0.0.1:5174 — fully functional, labeled SIMULATED
```

No credentials are needed for the simulated experiment. `pnpm build:village` produces a static build in `.playground-dist`. Without an API server, shared usage is unavailable; the UI shows dashes, not invented totals.

For local live inference:

```sh
pnpm build:village
pnpm dev:village:api
# In another terminal:
pnpm demo:village
```

Wrangler's AI binding uses your authenticated Cloudflare account, including during local development. Select LIVE JEV in the page. Local Durable Object usage is separate from production totals. Vite proxies `/api` to the local Worker and rewrites the origin for that development proxy.

The production configuration uses the existing Cloudflare Workers AI binding with `typesafe/jev`. Alternatively, put `TYPESAFE_API_KEY` in `examples/demo-worker/.dev.vars` for local direct TypeSafe access, or use `wrangler secret put TYPESAFE_API_KEY --config examples/demo-worker/wrangler.jsonc` for deployment. The server instantiates the installed official SDK (`@typesafe-ai/sdk` 0.6.0). Direct TypeSafe defaults to `jev-latest`; `TYPESAFE_DEFAULT_MODEL` can pin it. Never prefix the secret with `VITE_` or `NEXT_PUBLIC_`. The resolved provider model appears in traces.

```sh
pnpm deploy:demo
```

The public build now deploys Worldline; use `pnpm build:village` for the standalone village build. Keep its name, `BUDGET` binding, `DemoBudget` class and `public-demo-v1` object identity to retain cumulative usage. `/api/atmosphere` remains available for the original experiment; `pnpm demo:react` still runs that UI locally.

## A 30-second walkthrough

1. Start in SIMULATED to see the reproducible fixture scenario: stable / none / 85 trust.
2. Click **01 Raise taxes**. The reducer changes tax, treasury and household income. Three village hooks share one adapter batch.
3. Click **02 Inspect Market**: inherited village anxiety, locally derived anger and price pressure.
4. Click **03 Meet Mara**: Village → Market → Venn family → Mara, ending in a hostile fixture attitude and deterministic early shop closure.
5. Open DEV. Inspect Meaning, Trace and Code. Expand a question for exact criteria, distribution and answer. Trace shows input fingerprints, invalidations, dependency passes, latency, source and cache status.
6. Use **Demo scenario** five times, letting each interpretation settle: tax increase, theft, ignored theft, shortage, food relief. The ripple log separates facts from interpretations and shows partial recovery.

Hover selects after 160 ms; hit highlighting is immediate. Click pins a scope so the inspector stays usable. Escape or clicking empty map space releases it. Family labels are selectable. Keyboard users can focus map entities and press Enter/Space; the three quick-start buttons also select scopes.

Live outputs are allowed to differ. For example, a real tax-change run returned village **stable / money**, Market **calm / prices**, family **strained / money**, and Mara **skeptical**. The app renders valid returned answers, never forces the mock narrative.

## Architecture

```text
SimulationProvider                  deterministic world + reducer
└── RuntimeProvider                 JevProvider + SemanticRuntime client
    └── VillageSemantics            useChoice + useChoice + useScore
        └── SemanticScope           namespaced ambient cells
            ├── TopStatus, ActionBar, Timeline, VillageAtmosphere
            └── DistrictSemantics   active lens branch only
                └── SemanticScope
                    ├── DistrictVisual
                    └── FamilySemantics
                        └── SemanticScope
                            ├── FamilyVisual
                            └── PersonSemantics
                                └── SemanticScope
                                    ├── PersonVisual
                                    └── Inspector portal
```

The portal renders in the inspector column while retaining the selected entity's actual React context. There is no second merged copy of semantic state for the inspector. Map event handlers ignore portal-originated events so opening a question or trace cannot change the lens.

| Concern | Source |
| --- | --- |
| World, actions, events, seed | `examples/village/simulation/world.ts` |
| Fixed questions, schemas, selectors | `examples/village/semantic/contract.ts` |
| Actual React/custom Jev hooks | `examples/village/semantic/providers.tsx` |
| Microbatching, cache, transport, trace | `examples/village/semantic/runtime.ts` |
| Authored mock answers | `examples/village/semantic/mock.ts` |
| Reusable ambient scope implementation | `src/react/semantic.tsx` |
| Hit testing, illustrated scene, behavior | `examples/village/scene/` |
| Context-preserving inspector | `examples/village/inspector/Inspector.tsx` |
| API, quotas, persistent cache and counts | `examples/demo-worker/index.ts` |
| Scope/runtime regression tests | `tests/semantic-village.test.tsx` |
| Offline real-Worker endpoint tests | `tests/public-demo.test.ts` |

## Raw-state model

`VillageState` holds day, food, treasury, taxes, crime, trade, population, policies, districts, families, people and recent factual events. Fifteen named residents have roles, wealth, hunger, health, income deltas and witnessed event IDs. Refugees increase population without adding more named map characters.

Ten action buttons and two additional scenario events run through `reduceWorld`. Resource arithmetic, caps, affordability, event IDs and day advancement are ordinary deterministic code. No inference runs on a timer. Events describe tax changes, theft, food distribution, policy changes and harvest outcomes; they do not assert anger or trust. World state contains no semantic output.

## Semantic-state model

| Level | Hooks | Bounded output |
| --- | --- | --- |
| Village | Choice mood, Choice concern, Score trust | five moods; six concerns; trust expectation on 0–2 scale |
| District | Choice mood, Choice pressure | four local moods; six pressures |
| Family | Choice stability, Choice grievance | three stability states; four grievances |
| Person | Choice attitude, Noul basic security | four attitudes; probability from 0–1 |

The status strip displays trust normalized to 0–100. The inspector retains the actual Score, legend, confidence and probabilities. Noul's yes/no bars are the returned probability and its complement. Optional fields absent from a live answer remain absent. Mock distributions and confidence are authored fixtures, labeled SIMULATED throughout.

## Jev hook usage

`useVillageSemantics` visibly calls React `useChoice`, `useChoice` and `useScore` with one normalized input. `usePersonSemantics` uses `useChoice` and `useNoul`. These are the existing `jev-hooks/react` hooks, supplied with an app-specific batching `JevClient`; this is not a separate controller making manual requests on behalf of villagers.

Custom hooks declare fixed question definitions from the shared contract. DEV's Code tab extracts the actual implementation source with Vite's raw imports. Server code independently selects the same allowed definitions; the browser cannot send arbitrary prompts, models or criteria.

## How ambient propagation works

The reusable package exports `SemanticScope` and `useAmbient` from `jev-hooks/react`:

```tsx
<SemanticScope values={{ "village.mood": mood }}>
  <Map />
  <Timeline />
</SemanticScope>

// Deep in either branch:
const mood = useAmbient<JudgmentResult<ChoiceAnswer>>("village.mood");
```

The demo's `useMeaning` is a thin typed call to `useAmbient<SemanticCell>`. Cells retain data, pending, stale, error, refetch and source scope. Each store subscribes per key using `useSyncExternalStore`; unrelated key updates do not notify that key's subscribers. Normal parent renders can still render children unless React memoization prevents them.

## How nested scopes work

Each provider owns a lexical store with an optional parent. A locally present key wins, including an explicitly present `undefined`. Absent keys resolve through parents. Local keys add to inherited values; unmounting removes subscriptions and leaves no global registration.

Keys are namespaced (`village.mood`, `district.mood`, `family.stability`, `person.attitude`). District instances can use the same local key because sibling scopes are isolated. Each semantic layer subscribes only to the ancestor keys it actually projects into its input. The inspector intentionally reads the complete selected chain.

## How batching works

The original server `run()` runtime already batches synchronous program declarations across dependency passes. Generic React hooks do not automatically combine different questions. Semantic Village adds a small `SemanticRuntime` client: declarations arriving within a 12 ms window with identical canonical input state join one compatible request. Conflicting definitions for the same question ID reject.

Village's three hooks use identical inputs and a 100 ms debounce, producing one three-question adapter request. Local layers use a 40 ms debounce and run only once required ancestors are ready. District and family each batch two Choices; Person batches Choice + Noul. DEV pass 1/2/3/4 means dependency depth, not a hidden simulation tick. Only selected branches run.

A batch can resolve entirely from browser cache without an HTTP request. A server cache hit still involves one HTTP request but no new inference. Trace labels distinguish these cases.

## How caching/invalidation works

The browser cache keys each answer by **full canonical input + judgment ID + question definition**. It retains up to 512 answers for five minutes, with LRU eviction. Short eight-character fingerprints are display identifiers, never cache identities. Identical in-flight batches share one promise.

Selectors exclude unrelated facts. Personal health is absent from the root projection, so changing it cannot invalidate village concern. District projections include local facts and the three root semantic scalars; family/person selectors add only their own facts and declared ancestors. Merely moving the pointer never changes these inputs.

When inputs change, hooks mark previous answers stale and revalidate active branches. Descendants wait for fresh ancestor answers, then compare their resulting input. If the ancestor meaning is unchanged and local facts are unchanged, a child's valid cache entry is reusable. Inactive branches are not eagerly recomputed; their retained visual answers are marked stale until inspected. This is dependency-aware lazy evaluation, not a globally scheduled graph engine.

The Worker persists exact request/response pairs for 24 hours and coalesces concurrent misses in its singleton Durable Object. Hashes include normalized state, sorted fixed questions and configured model. Provider errors are not cached. Model aliases can change upstream during a cache lifetime; pin the direct TypeSafe model when reproducibility is required.

## Race/stale-response protection

Each trace identifies scope, exact state, generation, dependency depth and batch. The existing React hooks abort old subscriptions and reject results for superseded input. A sent inference may finish after the cursor leaves: it is cached only under its original state/question key. It cannot overwrite another scope's displayed answer. Canceled declarations before a batch flush do not spend inference.

The lens itself is independent of inference and never waits for a model. Previous answers remain visible with pending/stale indicators. Live requests time out after 25 seconds in the browser; the direct SDK has a 20-second timeout and automatic retries disabled. Errors require an explicit retry, with shared Retry-After cooldown for rate limiting. There is no silent switch to mock after a live failure.

## Mock vs live Jev

Mock transport uses deterministic authored rules, lightly delayed, and returns the same validated Choice/Score/Noul answer shapes. It runs through the same hooks, batching, cache, traces, scope inheritance and visual mapping. It never increments the public inference counters.

Live mode posts only bounded scope facts, inherited values and allowed judgment IDs to `/api/village`. Strict schemas reject unknown IDs, arbitrary questions, extra facts and bodies over 16 KB. The Worker performs real structured Jev inference via Cloudflare or the official TypeSafe SDK. API keys stay server-side. `/api/village/config` exposes availability and model name only. Without live server credentials/binding, the app stays usable in explicitly labeled simulated mode.

Official references inspected for this implementation:

- [TypeSafe model reference and pricing](https://docs.typesafe.ai/models)
- [Typed questions and mixed-question batching](https://docs.typesafe.ai/introduction/quickstart)
- [Official JavaScript SDK source](https://github.com/typesafe-ai/typesafe-sdk-js)

## React consumer model

TopStatus, Timeline, VillageAtmosphere and DistrictSemantics independently consume village mood. ActionBar reads trust. DistrictVisual and PersonVisual consume their own explicit subset of concern, pressure, mood, attitude and security. FamilyVisual reads stability/grievance. Their changes come from normal deterministic render logic and `behaviorFor`, not new model decisions.

The SVG map changes stalls, work motion, crates, queues, household markers and postures. No pathfinding, cursor interpretation, generated dialogue or generative UI is involved. Consumer names in the inspector are maintained declarations matching source, not automatic React profiler measurements.

## Shared usage and limits

The original cumulative **All visitors** panel remains, styled to match the village. Its original `since` timestamp, requests, model attempts, cache reuse, token usage and estimated model cost persist across this deployment. Both the original Atmosphere endpoint and Village contribute to those same totals; the caption now says “typed judgments, batched” because not every request contains three questions.

- Total requests: schema-valid API requests, including quota-denied ones that reach the Durable Object.
- Model calls: new inference attempts, including failures; cache/coalesced reuse spends none.
- Cache reuse: shared server cache hits plus coalesced requests. Browser-only cache hits do not reach the server.
- Estimated cost: measured input tokens × published $0.042 per million; output tokens free at this rate. Hosting and calls without token usage are excluded. This is not a Cloudflare bill.

The page refreshes totals every 30 seconds while visible and from successful live responses, retaining the latest known totals if refresh fails. Metrics reads do not increment inference/request counters. Mock browsing can display other visitors' live totals without adding to them.

Limits are **60 requests/minute/IP**, **1,000/day/IP**, **10,000 new model attempts/day globally**, plus a 120/minute per-location native burst limiter. Cached requests still count against per-IP traffic limits; shared cache hits remain available after the global inference budget is exhausted. IP quota keys are salted hashes. Same-origin browser checks constrain casual cross-origin access; the endpoint is public, not an authentication boundary.

## What makes this different from JevDoom/Hollow Creek

[JevDoom](https://github.com/TypeSafeAI/typesafe-playground) uses structured game observations for a bounded action controller. [Hollow Creek](https://hollow-creek-sigma.vercel.app) presents NPC observations/memory with typed action and treatment decisions. [Room powered by Jev](https://jev-room.moe136231.chatgpt.site) maps several typed choices into room settings. These public examples were inspected as references, not reused as application code.

Semantic Village derives **shared meaning** rather than the next action. The same root result reaches disconnected React consumers, then becomes an input to narrower semantic scopes. Deterministic code maps that meaning to behavior. The useful artifact is the React composition and inspectable dependency cascade; the village is its visual explanation.

## Tests and validation

```sh
pnpm test
pnpm typecheck
pnpm test:package
pnpm build:demo
```

Offline tests cover lexical propagation/shadowing/unmount, key-specific subscriptions, real React batching, unrelated health changes, hover/pin, cache reuse, tax invalidation, abandoned subscriptions, reversed response order, all four passes, fixture answer validation, mock/live isolation and strict endpoint schemas. Miniflare runs the actual Worker/SQLite Durable Object with an offline provider fixture, including quotas, cost accounting, persistence and both public endpoints. No unit test needs live credentials.

Manual checks include the five-step mock scenario, nested selection, DEV trace/code, desktop/mobile layout, and real four-pass Jev inference through the authenticated Cloudflare binding. Provider outputs and token usage are inspected without fabricating expected live semantics.

## Known limitations

- Deliberately shallow simulation; no autonomous NPC planning, pathfinding, persistent player saves or multi-user world.
- Five-minute browser caches are memory-only and reset on reload/mode switch. Server caches are exact-match batches; different subsets need distinct server entries.
- All three root judgments share a projection for batching. More granular root questions would trade some batching opportunities for narrower invalidation.
- Inactive local scopes can show explicitly stale previous meaning. The demo evaluates the inspected branch, not every villager after every action.
- Root interpretation history is bounded and recorded only when a full answer set settles. Rapid actions can skip intermediate interpretations; factual events remain visible. Local A/B history can be reconstructed from retained traces but is not a separate timeline UI.
- Traces retain the last 100 browser batches, not durable historical analytics. Dependency/consumer annotations are static declarations.
- Shared counters use one Durable Object appropriate for this small public demo, not a high-volume analytics system. Configurable custom models need corresponding pricing changes if their rates differ.
- Generic ambient keys are typed at consumption sites; there is no generated global semantic-key registry.

## What should be built next

Promote the proven React microbatch client into an opt-in package API with per-question invalidation tracing. Add typed ambient-key registration, local semantic A/B diff views and trace export/replay. Add a deployment-neutral persistence adapter and a Next.js route using the same fixed contract if another hosting target is needed. Keep the existing `run()` server API available alongside React hooks.

## Verification record · September 20, 2026

- 147 tests passed; one credential-dependent integration test skipped in the offline suite.
- TypeScript, program safety checks, production Vite build and Worker deployment dry run passed.
- Package smoke checks passed for isolated installs with/without React, public types, browser bundling, SSR, server endpoints and Workers.
- The five-step mock scenario completed in the browser: stable → anxious → desperate → anxious, with concern moving money → safety → food → safety. Trace inspection showed all four dependency depths.
- Production's real four-pass cascade resolved on `jev-1.13.0`. The inspector's Code tab showed actual `usePersonSemantics` source while preserving the pin. Repeating all four exact requests returned server `HIT`; the original usage `since` value (`1789894456487`) remained unchanged.
- An inspectable live input/question/answer/cost record is saved at [`output/village-live-trace.json`](../output/village-live-trace.json). This contains synthetic village facts and public usage, no credentials.
