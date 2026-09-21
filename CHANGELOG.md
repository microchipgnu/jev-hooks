# Changelog

## 0.2.0

- Compose React judgments by passing semantic references in `state`; dependencies and readiness are discovered automatically.
- Optional hook names and inspector labels; named calls remain compatible.
- `SemanticScope`, explicit `useAmbient` subscriptions, and dependency-preserving `.select()` projections.
- Shared browser batching, bounded answer cache, trace snapshots and stale-response protection.
- React, Node and Workers entry points with authenticated Request/Response endpoint support.
- Published documentation and tested examples for React, backend programs, Next.js/Vercel and Cloudflare Workers.

### Upgrade from 0.1

Existing named hook calls remain supported. Prefer `useScore(config)` over `useScore(id, config)` for new code. In React, compose with the original hook result or `.select()`, and render with `.data`. Backend programs continue to read answer fields directly and execute through `run()`.

React is an optional peer. Server-only applications do not need to install it. Node 24+ and Workers with the documented Node compatibility baseline remain the supported server environments.
