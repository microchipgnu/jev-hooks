# Production behavior

The SDK manages semantic computation. Your server defines who can request it, which questions are allowed, and how much it can spend.

## Endpoint contract

`createJevHandler({ adapter, authorize })` accepts standard Request/Response objects. Authorization is required and runs before parsing or inference. It accepts POST JSON `{ state, questions }` and returns `{ answers }`.

It bounds request size to 200 KB and questions to 32, validates input and answers, hides provider error details, and uses `Cache-Control: no-store`. It does not automatically provide authentication, prompt allowlists, rate limits, persistent caches or CORS.

Use application sessions for browser users. For public demos, bind the endpoint to a fixed experiment with audited questions and allowed state ranges. A provider key being hidden is not sufficient spend control.

## Browser cache

Keep one client per application session. By default, identical normalized state and question definitions reuse completed answers for five minutes, bounded to 512 entries. Concurrent compatible requests are deduplicated and batched in a 12 ms window, up to 32 questions.

Failed requests are not cached. `refetch()` bypasses the browser cache for that refresh. Expiry does not itself schedule polling or inference; another evaluation must occur. There is no automatic focus refresh or retry loop.

Reset or replace the client when account, authorization context or model configuration changes. A client cache should not cross users or provider settings accidentally.

## Server cache

The generic HTTP handler does not cache provider answers. If you add shared caching, include the provider/model, normalized state, full question definitions and tenant/access boundary in your key. Deduplicate concurrent misses. Store only successful, validated answers. Define eviction and model-version policy explicitly.

Backend `run()` caches within a single execution. Cross-request reuse and durable persistence are application concerns.

## Stale responses

React associates outcomes with the current input key, client and refresh generation. Effect cleanup aborts obsolete subscriptions. An old response cannot become the active answer for newer inputs. Dependent hooks wait while upstream references are pending or stale.

Cancellation may stop local work without cancelling provider billing. Preserve the previous answer for display only when its stale status is acceptable for the product. Do not trigger consequential effects from stale interpretations.

## Requests and cost

Keep separate counters for valid API requests, actual provider calls, server cache reuse and browser cache reuse. Browser cache hits never reach the server. Multiple judgments in a batch are still one provider request.

Compute estimates from measured provider usage and the selected provider's published pricing. Record the model and rate used. Do not treat an inference estimate as a hosting bill, and do not count missing token usage as measured zero usage.

Worldline keeps shared counters in its existing Durable Object and shows the tracking start, input tokens, estimated model cost and exclusions in the footer. Its public counters are application instrumentation, not an SDK-wide telemetry service.

## Verification boundaries

The package is checked through unit tests, isolated npm-archive consumers, React/browser bundles and local workerd execution. The integration snippets are compiled against the packed package. Provider transport tests use injected responses; they do not prove that your production account has billing enabled. Hosted Next.js deployment requires your own project configuration.
