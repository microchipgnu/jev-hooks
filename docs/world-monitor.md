# Worldline — event-driven semantic world monitor

**Events update facts. Jev updates meaning. Meaning propagates downstream.**

Worldline transforms the existing Semantic Village demo into a continuously reactive monitor. The event stream, not the pointer, drives computation. The graph nodes, permanent inspector and timeline are independent React consumers of typed semantic values.

The six monitored geographies are Japan, South Korea, China, the United States, Europe and the Middle East, with Asia and Global aggregates. The data is **fictional deterministic replay**, even when meaning is produced by **live Jev**. This is a framework experiment, not a real news or emergency-warning service.

## Run and replay

```sh
pnpm install
pnpm demo:monitor          # http://127.0.0.1:5175
pnpm build:monitor        # static build in .playground-dist
```

No credentials or external data APIs are needed. The page starts with the simulated US-market baseline, paused so visitors can read before sending an event. **Send US market drop** advances the story; **Replay → Auto play** starts the timed replay. Play/Pause controls ingestion only; in-flight meaning continues to settle. Next event advances a single observation. Reset and changing scenarios stop playback and reset facts and history. Speeds 1×/2×/4× use six/three/1.5-second intervals. A replay stops at its end and never silently loops.

Three scenarios ship:

| Replay                   | Observations                                                                                     | Semantic propagation                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Japan weather            | warning, upgrade, flights, rail, escalation, staged recovery                                     | weather → transport → Japan → Asia → Global                                                                 |
| Energy shock             | supply facility incident, oil move, shipping delay, aviation fuel surcharge, partial restoration | energy supply → Japan imports / Europe energy / aviation costs                                              |
| US → the world (default) | US index drop, further decline, volatility, support notice, recovery; no foreign events          | US facts → shared market pressure → Japan / Europe exposure → country semantics → regional/global attention |

The default market view is **The experiment**, a single causal story over a geographic background: one US observation → shared pressure → Japan/Europe attention → alert/watch consequences. Before/after values and unchanged local facts remain visible. The right-hand panel shows the actual source of `useMarketAttention` and `attentionPolicy`, with a changing dependency highlighted when shared pressure changes. `RegionConsequence` and `AttentionStatus` are independent React consumers. At a Noul answer ≥ 0.8, code adds that region to an on-screen attention queue. These are demo alerts, with no external side effects.

In the first simulated event, Japan moves from 0.05 to 0.85 and raises an alert; Europe moves from 0.05 to 0.57 and remains on watch. Live responses are not forced into these values or outcomes. **Explore full monitor** retains the detailed geographic map and the permanent inspector. Weather/energy scenarios select that surface directly. The **World map / Dependency graph** tabs select two views of the same semantic state. Click any node to inspect its Inputs, Answer or actual Code.

The graph displays actual semantic values and recorded before/after transitions. Edges represent the displayed dependency branch, not a geographic route or the complete graph. Other dependencies remain active and are available in the inspector. Weather transport observations enter the transport branch directly; the energy replay switches its focused path to aviation when a local fuel observation arrives.

**History**, **Diagnostics**, and the compact all-visitors usage footer open supporting details inside the inspector. Full trace/code/history can scroll there; the main workspace remains stationary. On narrow screens **Event flow / Inspect selected value** switches panes instead of stacking them. A node click opens the inspector automatically. The desktop layout is checked at 1280 × 720; the compact layout at 390 × 844. Extremely short viewports can scroll rather than clip controls.

The old `#dev` link opens the inline Code tab. There is no separate developer page. Selection is absent from semantic input and cannot start inference. Every group is mounted and evaluated from initial facts, including nodes outside the visible branch. The original event runtime, SDK hooks, batching, cache, history and server integrations are unchanged.

## Explaining a US event to the world

The default example is intentionally US-only. The first replay event records a US index move of −4.2% and volatility of 28. It does not change Japan or Europe facts. Shared market pressure becomes an input to two downstream hooks:

The detailed monitor retains its numbered guide to evidence and running source:

1. **An event changes facts.** Inspect the immutable US observation.
2. **Meaning becomes ambient.** `MarketScope` derives shared meaning once and provides the original hook references through `SemanticScope`.
3. **Components interpret it.** Two sibling `MarketCountry` instances read `useAmbient("pressure")` and `useAmbient("marketTrend")`. Each combines those references with its own exposure and local observations, then calls `useScore` and `useChoice`.

These are actual mounted components in `semantic/markets.tsx`, not illustrative pseudocode. Each country runs independently of selection. The Code tab extracts the selected component's exact source; question definitions, input projection, publication and whole-graph composition remain expandable. The execution receipt reports current facts/meaning/UI readiness, not invented stage timings. The map stays visible while inspecting code.

`usePublishCountry` is a small application bridge: a layout effect publishes each sibling's committed references for the inspector and regional aggregates. It does not issue requests, inspect readiness or implement a second scheduler. Aggregation mounts once both declarations exist, even while their answers are pending. The SDK continues to discover dependencies, gate pending inputs, batch and cache. Cleanup removes the declaration; StrictMode replay is tested.

Exposure coefficients (Japan 0.85, Europe 0.55) are **fictional fixed scenario assumptions**, validated by the server, not measured financial statistics. Live Jev interprets these along with evidence; the fixture adapter deterministically models them. Potential pressure is not an observed foreign-market loss or a financial forecast. “World” means the monitored aggregate, not exhaustive global coverage.

The two market questions batch on the same US state. Exposure judgments wait for fresh shared meaning, then each country's two questions batch on its own exposure state. The country and regional hooks consume those results automatically. Unchanged weather, transport, energy, Korea and China branches reuse their answers. Recovery follows the same graph. Tests assert reference-identical Japanese/European raw facts throughout the entire replay.

## Concise attention composition

`semantic/attention.ts` is extracted verbatim into the default view. It reads the original `pressure` reference through scope, projects `.score` using `select()`, and calls `useNoul` with `{ pressure, exposure }`. `MarketCountry` calls it for each of the two fixed exposure assumptions. The SDK discovers the `global.markets.stress` edge and waits for current meaning. The question has no mandatory name. The resulting cells are `jp.attention.urgent` and `eu.attention.urgent` for diagnostics and the public endpoint.

`normalizeMonitorInput` is **application transport projection**, not dependency discovery: after the SDK resolves the references, it maps the two-field state into a fixed `market-attention` request. The same projection is used for inspector fingerprints, ensuring trace matching. The server allows only the fixed question, exposure values, and bounded upstream score. Existing request shapes/cache entries are unchanged. The full graph now has 48 judgments in 21 initial batches (including two new Noul requests); unrelated weather, energy and transport branches continue to reuse their answers.

Old answers may stay visible while an upstream value changes, but the UI labels them as updating. An outdated completion cannot enter the current attention queue. Readiness and staleness belong to the SDK; the application never schedules a second dependency graph. The new tests cover the two policies, unchanged local facts, real endpoint validation/caching/accounting, reset, view selection without inference and rejection of late Noul results.

## Event model

`events/model.ts` defines a strict discriminated union: weather warning, transport disruption, market move, major news, government notice, infrastructure incident. Every observation has a stable ID, explicit ISO timestamp, source ID/label, affected scopes, measured place and bounded typed payload. Scenario records contain absolute measurements, not commands such as “make Japan a crisis.”

The event-source interface is `start(emit) → cleanup`. `StaticReplayEventSource` implements an ordered source; `MockEventSource` identifies the fictional feed used by the page. New adapters can emit the same validated contract. No external feeds are configured in this version.

## Fact store

`EventRuntime` owns committed facts and the pending event queue. `reduceWorldEvent` is deterministic and needs no Jev call. It structurally shares unchanged country/domain branches, applies partial absolute observations, retains the three previous snapshots and per-field provenance, and appends immutable validated observations. Duplicate IDs are ignored. Older observations remain in the event ledger but cannot overwrite newer values. Same-timestamp updates tie-break by event ID.

Each fact slice has `current`, `history`, `provenance` and recent `eventIds`. Initial values have explicit scenario-baseline provenance. Evidence timestamps are replay time; model duration and transition observation times use the browser clock.

A fixed **250 ms window from the first arrival** coalesces event bursts. Five events in the window still produce five factual records but one published fact-state update. Continuous traffic cannot postpone the deadline indefinitely. The queue and last burst size are visible in DEV. Pause stops the source, not inference already required by committed facts.

## Semantic graph

There are 19 compatible input groups and 46 typed judgments:

- Japan weather: Score severity, Noul urgency, Choice trend.
- Japan transport: Score disruption, Choice trend; depends on weather meaning and aviation cost pressure.
- Japan markets: Score stress. Japan notices: Choice signal.
- US-origin market pressure: Score stress and Choice trend from US market observations only.
- Japan and Europe market exposure: Score pressure and Choice trend from shared market meaning plus explicit local exposure and unchanged local observations.
- Energy: Score supply pressure and Choice trend from Middle East news/market/transport facts.
- Japan imports, Europe energy and aviation costs: one Score each, depending on energy meaning and explicit exposure.
- Six geographic situations: Choice category, Score severity, Noul urgency, Choice trend.
- Asia and Global: Choice attention and Choice dominant theme.

Score levels are normal/elevated/significant/severe on a 0–3 scale. Noul retains probability on 0–1. Categories, trend and attention remain bounded choices. Active-situation count is deterministic over non-normal categories. A dashboard alert is deterministic policy over **fresh** urgency ≥ 0.8 and severity ≥ 2. Affected-system chips come from measured domain membership, never generated prose.

Japan uses a composed domain graph. The other five geographic situations directly interpret their focused local facts; Europe also consumes cross-domain energy and US market meaning. Japan consumes both import pressure and US market exposure. This keeps the first version compact without inventing unnecessary inference layers.

## Jev hook scheduler

The monitor uses the SDK’s nameless, composable React API. Actual `useChoice`, `useNoul` and `useScore` calls are visible in `semantic/hooks.ts` and `semantic/markets.tsx`. `useJapanWeatherSemantic`, `useJapanTransportSemantic`, `useJapanSituation`, `useCountrySituation` and `useRegionalAttention` compose in `useWorldSemanticGraph`.

A node becomes eligible when the semantic references in its input are fresh and error-free; the SDK handles this automatically. The existing hook effect handles structural input comparison, scheduling, previous answers, cancellation and request identity. A child immediately becomes blocked when an upstream input becomes dirty, even before the old asynchronous answer finishes.

There is no event-type orchestration switch calling “recompute A, then B.” Events only update facts. Ordinary React composition discovers which enabled hook effects need work. The synchronous server `run/useInput` program API remains available, with optional generated judgment identities.

## Batching

The shared batch/cache engine now lives in the SDK at `src/react/batch.ts`. `examples/shared/semantic-runtime.ts` is a thin demo adapter for fixed question contracts, source provenance and usage metadata. Both demos and the default SDK client use the same engine.

Declarations with identical canonical state join a 12 ms microbatch. Japan's three weather hooks share the exact state and 60 ms debounce, so they produce one request with three typed questions. Country's four judgments likewise share a batch. Incompatible legacy identities partition into separate batches. Different input slices remain separate batches.

Pass numbers in DEV are **maximum dependency depth**, not wall-clock ticks. For example Japan transport is depth 3 because it also depends on aviation (depth 2), even when weather itself is depth 1. Independent branches can execute concurrently, and a later event may reuse already-ready ancestors.

## Dependency discovery

Readable custom hooks return semantic references. Downstream hooks put those references into state, using `select()` for scalar projections. `inputFor` merely combines focused facts with these references; it does not test readiness or read answers. `useBundle` projects SDK metadata for the inspector and performs no scheduling. The auditable definitions in `semantic/contract.ts` list dependencies, fixed questions, criteria, focused fact paths and consumers. These same definitions power the inspector and server validation.

The SDK discovers direct edges by recognizing reference objects, not by looking up names in the contract. The contract independently validates the exact allowed evidence at the public endpoint. Tests compare discovered edges with this allowlist. The existing server program runtime's automatic declaration/handle tracking remains separate and intact.

## Invalidation

Relevant fact selectors and inherited answer scalars form the request input. A transport event does not invalidate Japan weather or unrelated US/Korean nodes. Aviation's local slice projects only fuel surcharge, so a flight-cancellation count alone cannot invalidate aviation cost meaning. Unchanged upstream semantic values allow downstream cached results to remain useful.

Pending/blocked cells may retain an older answer for presentation, explicitly labeled as previous meaning. They cannot feed a fresh downstream request until dependencies settle. Confidence/probability changes alone do not invalidate descendants that declared only the chosen scalar as their dependency. This choice is deliberate and documented; applications can project richer distributions when needed.

## Semantic cache

The shared browser cache retains up to 512 answers for five minutes, keyed by full canonical input and question definition, independently of generated hook IDs and inspector labels. The short fingerprint is a display identifier only. Identical in-flight batches coalesce. Restart keeps valid cache entries while resetting the world and transition history; switching mock/live creates a different client and cache.

The existing Durable Object persists successful exact batch responses for 24 hours and coalesces shared misses. Its model-aware key includes normalized facts and sorted fixed question IDs/definitions. Browser cache hits involve no HTTP request. Server cache hits involve an HTTP request but no inference. Errors do not enter the answer cache.

## Stale result protection

The existing React hook associates an answer with request key, client and revision, and aborts subscriptions when dependencies change. Old results can complete only under their original cache keys. They cannot activate against a new input or another scope.

The shared batch trace now records `discarded` and `discardedJudgments` when subscriptions were canceled before a response arrived. Each trace retains scope, input fingerprint, generation, batch ID, depth, answer, latency and source. DEV exposes stale results rather than pretending canceled inference never happened. Paid requests already sent can complete and populate cache; declarations canceled before the microbatch flush spend no inference.

## React subscriptions

`SemanticScope/useAmbient` and its per-key external-store subscriptions are reused unchanged. The original hook references are available by namespaced key, such as `useAmbient("jp.spillover.pressure")`, and remain composable. Inspector cells are separate projections under `inspection:*`; `useSemantic(id)` reads those projections. Spreading a hook result would lose its runtime registration, so each cell retains its original `.reference`. `CountryScope` adds local aliases such as `situation` and `severity` while preserving the surrounding graph. SituationDetail consumes these aliases explicitly.

SemanticNode, FocusInspector and Timeline consume meaning independently. WorldAtlas and the dependency view share the same graph and inspector. Memoized unrelated consumers do not rerender for a different key's changes in the tested transport update. The DEV inspector deliberately consumes the complete graph for observability; it is not a performance example for leaf components.

## Timeline/history

The event ledger distinguishes **EVENT / FACT** from **SEMANTIC CHANGE**. Semantic history records ID, prior/new scalar, replay timestamp, observed time, input fingerprint, changed dependency values/fact paths, direct evidence IDs and source. It retains the latest 300 transitions, with a compact 32-entry ledger view and filters. Initial interpretations are stored but hidden from the change ledger to avoid a wall of “unread → normal.”

The inspector follows the selected node's declared dependencies to relevant events and source IDs. Exact input, question, criteria, answer, distributions and confidence remain visible. It never presents invented chain-of-thought. Pending input is labeled as a current declaration, distinct from a previous valid answer. Historical trace entries preserve the earlier actual snapshot.

## Mock adapter

`mockMonitor` supplies deterministic authored answers from normalized facts/history and inherited meaning. Choice distributions, Score distributions/legends and Noul values have the real answer shapes and pass the same runtime validation. They are consistently labeled **SIMULATED**. Only the answer source is mocked: reducers, debounce, dependency gating, cache, trace, stale protection, transitions and React subscriptions all run normally.

The scenario narrative is reproducible in mock mode. Live Jev may interpret the same evidence differently, including different trends or dominant themes. The application accepts valid outputs without forcing fixture answers.

## Live adapter

The current official [TypeSafe JavaScript documentation](https://docs.typesafe.ai/sdk/javascript), [SDK source](https://github.com/typesafe-ai/typesafe-sdk-js) and [model reference](https://docs.typesafe.ai/models) were checked before changing the endpoint. Installed and published SDK version is 0.6.0. The official API remains `TypeSafeClient.systemOne({ state, questions })`; the documented secret is `TYPESAFE_API_KEY`, and the direct SDK default is `jev-latest`.

The existing Worker supports a server-side TypeSafe key (with optional `TYPESAFE_DEFAULT_MODEL`) and the already-authenticated Cloudflare AI binding fallback (`typesafe/jev`). No SDK client or secret is shipped in the browser. Active resolved model is shown per trace. Browser requests time out after 25 seconds; direct SDK requests use 20 seconds and no automatic paid retries.

```sh
pnpm build:monitor
pnpm dev:monitor:api       # authenticated Cloudflare AI; local inference is real usage
# In another terminal:
pnpm demo:monitor
```

Choose Live Jev in the page. For a direct TypeSafe connection, put `TYPESAFE_API_KEY` in ignored `examples/demo-worker/.dev.vars`, or set the deployed Worker secret. Never use a browser-prefixed environment variable for credentials. When the API is unavailable, simulated mode remains fully functional; the live selector is disabled. Live failures are explicit errors with manual retry and Retry-After handling, never silently replaced by mock answers.

`POST /api/monitor` accepts only `{ input, ids }`. The server validates the exact scope, bounded focused facts, declared inherited keys/values and allowed fixed questions; it rejects arbitrary model/prompt fields and bodies over 32 KB. `/api/monitor/config` exposes availability/model only. Existing `/api/village`, `/api/atmosphere` and `/api/usage` remain supported.

## Replay runtime

`MockEventSource` emits immutable observations on a fixed replay interval. The UI owns play/pause, scenario index and speed; it does not own semantic scheduling. Restart remounts semantic subscriptions and transition history against initial facts, canceling obsolete subscriptions while retaining compatible answer cache entries. Source cleanup prevents a previous scenario from leaking events after a switch.

These are finite local replays, not an always-on external news feed. Event IDs/timestamps are stable, so runs are reproducible and shared backend cache reuse is meaningful. Data and inference modes are separate: LIVE JEV still interprets fictional replay observations.

## Cross-domain dependencies

```text
Middle East supply / oil / shipping observations
                     ↓
             energy.supplyRisk
             ├── jp.imports.pressure ──→ Japan situation ──→ Asia
             ├── eu.energy.pressure ──→ Europe situation ──→ Global
             └── aviation.cost.pressure ──→ Japan transport ──→ Japan
```

Energy is a semantic projection over the initial four event domains, not a separate external data integration. These edges cross both geographic scope and domain. The highlighted energy→Europe path and three-system exposure strip show actual declared edges.

## Shared counters and deployment

The existing **A little experiment. An open tab.** panel is restyled for the monitor. It retains the original singleton Worker/DO identity, cumulative usage and tracking start. Both legacy endpoints and Worldline contribute to the same totals. Mock inference does not increment them; the displayed totals can include other visitors' live activity.

The panel reports valid API requests, new inference attempts, server/coalesced reuse, measured input tokens and the accumulated estimate at the published input-token rate. Output tokens are free at that rate; hosting/unmetered requests are excluded. Browser-only cache hits appear in DEV and never reach the server. Local Wrangler totals are separate from production totals.

The existing IP minute/day caps, native burst limiter and global daily inference budget remain server-enforced. Cached traffic uses IP allowance but no new model budget. If an operator rapidly restarts several live scenarios, the honest cooldown can apply; use simulated mode for unrestricted experiments.

```sh
pnpm typecheck
pnpm test
pnpm test:package
pnpm deploy:demo
```

`build:demo` now builds Worldline. The village and atmosphere source/examples remain runnable with their existing scripts. The public Worker, `BUDGET` binding, `DemoBudget` class and `public-demo-v1` object name stay unchanged, preserving stored counts and cache.

## Map and visual model

The world map is the default view again. `WorldAtlas.tsx` reuses the bundled Natural Earth coastline and established geographic projection. It adds land shading and dot texture, amber event origins, blue semantic markers, keyboard-accessible selection, and focus/restore camera controls. SVG arcs connect actual declared semantic dependencies; a packet travels once when the destination has fresh answers. The dependency graph remains available in the adjacent tab. Geographic coordinates and camera state are presentation only; they never enter semantic inputs.

## Operations workspace and motion

The restrained dark surface, typography and object inspector remain, with a prominent world map and a compact causal journey. There is one primary event action and one persistent place to inspect. Lower-priority controls live under Replay or inside the inspector.

Motion expresses actual semantic updates: a one-shot connector highlight follows fresh answers and changed values animate briefly. Pending nodes name the upstream value they are waiting for. Packet timing does not delay or orchestrate inference. Shared button press styling is overridden on graph nodes to preserve their transform and hit targets; this was verified with real browser clicks. The header motion toggle and system reduced-motion preference suppress animation.

## Verification record — September 20, 2026

The full test suite passed with 166 tests and one credential-dependent test skipped. New navigation coverage exercises Meaning/Trace/Code, direct `#dev` links, paused startup, and no extra inference when switching views. Type checking, the program checker, isolated package-consumer checks, the production browser build and the Worker deployment passed. Browser checks completed all three simulated replays, inspected live uncertainty and source code, and verified the layout at desktop and 390 px mobile widths.

Prior-version live validation executed all 16 groups / 40 judgments with `jev-1.13.0`, including the energy cross-domain graph. That version also settled all 40 values and recomputed the affected weather → transport → Japan → Asia → Global chain after a new event. A repeated production request with reordered JSON keys returned the same cached answers without a new inference. The original cumulative tracking timestamp remained unchanged across deployment.

Local verification artifacts are `output/monitor-live-energy-trace.json` (full live inputs, questions, answers and timing) and `output/monitor-production-check.json` (production cache and counter checks). These are records of that validation, not claims about future model responses or current cumulative totals.

## Known limitations

- No live data sources or comprehensive geopolitical coverage. All source observations are fictional replay records.
- The graph is declared and acyclic, with readiness inferred by hook composition. It is not a general dynamic graph editor, agent system or background job service.
- Only Japan has full separate domain interpretation layers; other geographic nodes consume local facts directly. Fine-grained projections can be extended without changing the event runtime.
- Browser state/cache/history are memory-only; reloading starts a new replay. Events are retained for the finite session; production streaming would need retention and archival policies.
- History retains three prior fact snapshots and 300 semantic transitions. Rapid events can skip intermediate interpretations while all factual observations remain in the ledger.
- Consumer names are maintained declarations, not automatic React-profiler instrumentation. Pass labels denote longest dependency depth.
- Semantic scalar changes trigger downstream interpretation; distribution-only changes currently do not.
- A single Durable Object is appropriate for this small public experiment. Larger deployments need partitioning and wider observability.
- Rate estimates assume the published Jev rate; a custom model with different pricing needs a matching rate configuration. Model aliases can change during a cache lifetime; explicit pinning improves reproducibility.
- Browser tabs must stay open for local replay and hook computation. This is not a server-side continuously operating world collector.

## Why this differs from an AI news dashboard

No collection of articles is sent for a generated paragraph. The world model is an explicit event log and reproducible fact state. Jev produces narrow, typed interpretations with inspectable uncertainty. Those values become inputs to other judgments and ambient state for React consumers. Alerts and presentation remain deterministic code. The useful result is a reactive semantic model, not an AI-written summary.

### US ripple validation

The US-only replay is the default. The expanded graph has 19 groups / 46 judgments. All 166 tests pass, with one credential-dependent test skipped. Type checking, program checking and the production build pass. Browser checks verified the first US event, actual source disclosure, exposure inspector, and 390 px layout without horizontal overflow.

Production live Jev validation settled the full graph after a US −4.2% observation: shared stress 1.64/3, Japan exposure pressure 1.65/3 and Europe 1.37/3 (rounded actual outputs, not fixture expectations). Both foreign scopes still showed 0% observed local moves and zero local reports. The Japan exposure trace retained two typed questions in one request, its exact upstream inputs, and pass 2. These are probabilistic interpretations and can differ on another uncached run. Two superseded subscriptions were discarded while the initial snapshot was replaced; no stale values remained active.

The cumulative usage store retained its original `since=1789894456487` timestamp. The validation used 21 API requests: nine new model calls and 12 server-cache hits. Counters and costs remain shared across visitors.

### Single-screen journey validation

166 tests pass, with one credential-dependent test skipped. Updated interaction tests cover selected Japan on load, event propagation, unchanged local facts, input/answer/code navigation, original trace access, inline history and accounting, legacy `#dev`, replay reset/cancellation, and no inference caused by inspection. Browser checks use real pointer clicks and verify desktop and compact mobile viewport dimensions. The earlier US ripple live validation remains applicable because the semantic graph and request contracts are unchanged; only declared consumer metadata changed.

Production verification of the single-screen layout also settled all 46 values in Live Jev mode. The replay snapshot used 19 server-cache hits and no new model calls. The original cumulative tracking timestamp and counter history were retained; all-visitors totals continue to include other activity. Desktop page dimensions were 1280 × 720 with no overflow; the collapsed Inputs panel also fit its allotted height. Mobile graph/inspector switching was checked with real pointer clicks at 390 × 844.

### Restored map validation

The world map is the initial surface. Clicking Japan or Europe selects its derived pressure in the existing inspector. A matching meaning strip below the map exposes shared pressure and local interpretations; the event strip is explicitly labeled FACT. Arcs represent semantic dependencies, not physical routes. Weather and local aviation updates remain local geographic signals, with the complete propagation available in Dependency graph.

167 tests pass, with one credential-dependent test skipped. Added coverage checks geographic keyboard activation, focus/restore, map/graph switching, retained selection and no added inference. Browser checks verified the geographic composition at 1440 × 900, 1280 × 720 and 390 × 844 without page overflow. Reduced motion disables geographic packets, observation rings and camera easing. No live request schema or inference logic changed.

## Composition migration verification — September 21, 2026

The SDK now supports nameless hooks and automatic dependencies through semantic references. The monitor no longer maintains readiness gates or copies `.data` into downstream inputs. `select()` retains lineage while projecting the existing scalar evidence. A contract test verifies all 46 discovered nodes' edges and depths against the independent public endpoint allowlist.

185 tests pass, with one credential-dependent test skipped. Tests replay every event in the weather, energy and US-market scenarios, including recovery/restoration, and cover SDK batching, cache generations, ambient consumers, canceled work, duplicate labels and nameless server replay. Type checking, the program checker and an isolated package-consumer install pass.

Browser verification followed a US −4.2% observation through shared pressure, Japan/Europe interpretation and global attention, and opened Inputs, Answer, Code and Diagnostics. Live mode settled all 46 values using 21 server-cache hits with real `jev-1.13.0` answer distributions. No new model call or model cost was incurred by this verification. Japan pressure was 1.65/3 and Europe 1.37/3 (rounded); both scopes retained 0% observed local moves. These are cached model interpretations of fictional evidence, not current world measurements.

The original `since=1789894456487` usage history was preserved. During this check, requests increased from 506 to 527, inference calls stayed at 286, and server reuse increased by 21. The before/after snapshots are `output/monitor-composition-usage-before.json` and `output/monitor-composition-usage-after.json`. Desktop map and inspector retained a single-page layout with no document overflow at the observed 1467 × 1028 viewport.

## Ambient demonstration update

The market branch now composes real sibling components beneath `MarketScope`. The default page teaches facts → ambient meaning → local interpretation without leaving the map. A direct test resolves the ambient references as hook inputs (catching accidental spreading), runs StrictMode, verifies the initial 19 batches, and confirms both countries depend on the same upstream hook identities. Another test stalls Japan, lets Europe complete, advances the source facts and rejects the obsolete Japan response. Guide/marker/source interactions do not add inference. All three replay scenarios continue to exercise the remaining graph.

This is still a React demonstration. The backend validates and evaluates batches; it does not run the monitor's persistent graph. Server `run()` composition is documented separately in `docs/composition.md`.

Verification for the ambient update: 188 tests passed, one credential-dependent test skipped; TypeScript, program safety checks and the production build passed. Deployed as `4b297e5d-1635-49b6-b0ad-cf5c807786c1`. Browser verification covered the three guide steps, source inspection, map and live baseline plus the first US event. All 46 values settled; the live path served 27 existing server-cached batches with zero new inference calls. Shared requests advanced from 611 to 638, calls remained 311, and the original tracking timestamp remained `1789894456487`. Snapshots are in `output/monitor-ambient-usage-before.json` and `output/monitor-ambient-usage-after.json`. The observed desktop viewport fit without document overflow; expanded source/evidence scrolls inside the inspector.

## Causal experiment verification

The focused experiment shipped in version `78030b0c-3d9d-423c-a6a4-53d847f7e778`. TypeScript/program checks and the production build passed; 193 tests passed and one credential-dependent test was skipped. The worker integration test exercises the new fixed Noul question, server cache, invalid-input rejection and persistent counters. UI tests cover contrasting consequences, unchanged local facts, source selection, full inspection, history and reset without selection-triggered inference. A deferred-response test verifies obsolete attention cannot reactivate after recovery.

Production browser verification ran the first simulated US event (Japan 0.85, Europe 0.57), then switched the same facts to Live Jev. Real `jev-1.13.0` answers were Japan 0.80 and Europe 0.65: the deterministic 0.8 policy raised Japan's on-screen alert and left Europe on watch. These outcomes are observations from this verification, not promises about future live answers. All 48 values settled. The observed 1467 × 1028 desktop viewport had no document overflow; detailed source/evidence scrolls within its panel.

The live check reused 19 server-cached batches and made two new model calls. Requests advanced 638 → 659, inference calls 311 → 313 and input tokens increased by 742 (estimated model cost +$0.000031164 at the existing rate). The original `since=1789894456487` remained unchanged. Accounting snapshots: `output/monitor-causal-usage-before.json` and `output/monitor-causal-usage-after.json`.
