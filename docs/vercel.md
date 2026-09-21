# Next.js on Vercel

Use an App Router route on the Node runtime. The browser imports `jev-hooks/react`; provider adapters remain in the route module.

## Install and configure

```sh
npm install jev-hooks
```

Set your application's `package.json` engine to `"node": "24.x"`. Vercel supports [Node.js 24 for builds and functions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Configure these server environment variables in local `.env.local` and your Vercel project environments:

```text
AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
JEV_ENDPOINT_TOKEN=your-private-endpoint-token
```

Neither variable should use a `NEXT_PUBLIC_` prefix. The endpoint token below is a private server-to-server example, not browser authentication.

## Add the route

Save as `app/api/jev/route.ts`:

<!-- include: snippets/next-route.ts -->

The adapter uses Vercel's documented TypeSafe-compatible endpoint and model `typesafe-ai/jev`. See [Vercel's TypeSafe integration](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe). This adapter uses an API key; it does not automatically refresh Vercel OIDC tokens.

Start your existing Next app with `npm run dev`, then make a request from a trusted terminal with `JEV_ENDPOINT_TOKEN` exported:

```sh
curl http://localhost:3000/api/jev \
  -H "Authorization: Bearer $JEV_ENDPOINT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"state":{"changePct":-4},"questions":{"pressure":{"type":"score","instructions":"How much economic pressure exists?","criteria":["Normal","Elevated","Severe"]}}}'
```

Expect an `answers.pressure` score response. This makes a paid inference request. Deploy the existing Next project through Vercel after configuring its environment variables. These examples use standard [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).

## Connect React

For a signed-in browser app, replace the example bearer authorization with your application's server-side session verification and quota policy. `authorize` receives the incoming `Request` and must resolve to a boolean. A missing or rejected session should return false. The generic SDK intentionally does not invent an authentication system.

Then initialize a stable browser client:

```tsx
"use client";
import { useState, type ReactNode } from "react";
import { createJevClient, JevProvider } from "jev-hooks/react";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createJevClient({ endpoint: "/api/jev" }));
  return <JevProvider client={client}>{children}</JevProvider>;
}
```

Wrap your client components with `Providers`. Same-origin cookies are sent normally. Do not copy `JEV_ENDPOINT_TOKEN` into React. For an anonymous public demo, use a fixed question allowlist, input bounds and server-enforced rate/spend budgets, as the Worldline endpoint does.

## Use direct TypeSafe instead

Install `@typesafe-ai/sdk@0.6.0`, set `TYPESAFE_API_KEY` and replace only the route's adapter:

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { TypeSafeJevAdapter } from "jev-hooks";

// Inside createJevHandler options:
const adapter = (request: Request) => new TypeSafeJevAdapter(
  new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    retry: { maxRetries: 0 },
  }),
  { signal: request.signal },
);
```

Hosting stays on Vercel. Inference billing goes to the selected provider. See [production behavior](deployment.md) before connecting a public endpoint.
