# React + backend

```text
React state → semantic hooks → browser batching → POST /api/jev
                                                     ↓
                                      authorization → provider
                                                     ↓
React consumers ← dependent hooks ← validated typed answers
```

## Install and place files

```sh
npm install jev-hooks
# If the application does not already have React:
npm install react react-dom
```

Copy [assets/frontend.tsx](../assets/frontend.tsx) into the app's client component and [assets/endpoint.ts](../assets/endpoint.ts) into server-only code. The frontend demonstrates facts, pressure, ambient scope and two dependent interpretations. The helper requires an authorization callback and defaults to mock inference.

## Next.js route

In `app/api/jev/route.ts`, use the copied helper. The local import path below assumes you copied it alongside the route:

```ts
import { createEndpoint } from "./endpoint";
import { OpenRouterJevAdapter } from "jev-hooks";

export const runtime = "nodejs";

// authorizeRequest is YOUR application function: inspect the incoming session,
// tenant access and quota, then return boolean or Promise<boolean>.
export const POST = createEndpoint(
  authorizeRequest,
  request => new OpenRouterJevAdapter({ signal: request.signal }),
);
```

`authorizeRequest` is an explicit application integration point, not an SDK export. Find and adapt the existing server auth code rather than inventing an import or leaving this identifier unresolved. Set `OPENROUTER_API_KEY` on the server. Use Node 24 on Vercel. Other provider choices are in [providers.md](providers.md).

For a runnable **local mock-only** route before app auth is available:

```ts
import { createEndpoint } from "./endpoint";
export const runtime = "nodejs";
export const POST = createEndpoint(() => process.env.NODE_ENV === "development");
```

This uses the helper's mock adapter and denies non-development requests. Label the UI SIMULATED. Default mock answers are constant fixtures, so changing facts proves request propagation but may not change the selected result. Supply input-sensitive fixtures to demonstrate different outcomes, as in the [interactive quickstart](https://jev-hooks-demo.microchipgnu.workers.dev/docs/quickstart/).

Do not reuse the local mock authorization callback with a paid adapter. A public live demo needs bounded inputs, fixed questions and rate/spend policy.

## Cloudflare route

Use the copied helper in a Worker. Wire the application's existing authorization at the indicated function argument:

```ts
import { CloudflareJevAdapter, type CloudflareAiBinding } from "jev-hooks";
import { createEndpoint } from "./endpoint";

type Authorize = (request: Request) => boolean | Promise<boolean>;
export function createWorker(authorize: Authorize) {
  return {
    fetch(request: Request, env: { AI: CloudflareAiBinding }) {
      if (new URL(request.url).pathname !== "/api/jev")
        return new Response("Not found", { status: 404 });
      return createEndpoint(authorize, new CloudflareJevAdapter({ ai: env.AI }))(request);
    },
  };
}
// The application's entry exports createWorker(itsAuthorizationCallback).
```

Configure `compatibility_date: "2026-09-01"`, `compatibility_flags: ["nodejs_compat"]` and `ai: { binding: "AI" }` in Wrangler. Authorization that requires environment bindings should be constructed inside `fetch` using that request's `env`. See the [Workers guide](https://jev-hooks-demo.microchipgnu.workers.dev/docs/cloudflare/) for a complete private endpoint example and deployment commands.

## Client behavior

- Keep one `createJevClient({ endpoint: "/api/jev" })` instance per application session. Do not create it in each render.
- Same-origin session cookies accompany requests. Separate-origin deployments need an explicit CORS/authentication strategy.
- Provider keys and shared server bearer tokens never belong in the browser.
- `pressure.select(answer => answer.score)` narrows the consumed value while retaining dependency metadata. An unchanged score may reuse downstream results after pressure settles.
- Independent judgments only batch when normalized input state matches. Different exposure values produce separate concurrent requests.
- Hooks run after React commit, not during SSR. Never call React hooks in route handlers.

## Verify

Run the actual app with the mock route. Check initial rendering, a fact update, a settled downstream value, and request rejection outside the authorized context. Render loading/error states; keep the client interactive during inference. Only then switch the adapter, keeping the same component graph and endpoint contract.
