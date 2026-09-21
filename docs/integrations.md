# Deploy Jev Hooks

Choose hosting and inference independently. A Next.js app on Vercel can call TypeSafe directly. A Cloudflare Worker can use Workers AI, TypeSafe, OpenRouter or Vercel AI Gateway.

| Application | Browser entry | Server endpoint | Inference adapter |
| --- | --- | --- | --- |
| Next.js / Vercel | `jev-hooks/react` | App Router route, Node 24 | `VercelJevAdapter` or another server adapter |
| React / Cloudflare | `jev-hooks/react` | Worker with `nodejs_compat` | `CloudflareJevAdapter` or another server adapter |
| Node backend | None required | Your handler / job | Any server adapter |
| Offline development | `jev-hooks/react` or root | Optional | `MockJudgmentAdapter` |

## The boundary

```text
Browser                            Server
useScore / useNoul                  authenticated POST /api/jev
        ↓                                     ↓
createJevClient({ endpoint })  →    createJevHandler({ adapter, authorize })
                                              ↓
                                      TypeSafe / provider
```

The browser owns its React subscription lifecycle and batching. The server validates and authorizes requests and calls the provider. Secrets never enter the browser bundle.

- [Next.js and Vercel](vercel.md): Node route and AI Gateway configuration.
- [Cloudflare Workers](cloudflare.md): Worker, AI binding and Wrangler configuration.
- [Production behavior](deployment.md): authorization, rate limits, caches, failures and usage accounting.

## Other servers

`createJevHandler` accepts a standard `Request` and returns a `Promise<Response>`. Adapt your framework's request/response boundary to it. The server package requires Node-compatible APIs; arbitrary edge runtimes are not claimed supported.

For React Server Components, keep interactive hooks in a `"use client"` component. Use `run()` on the server for a server computation. React hooks do not perform inference during server rendering.
