---
status: ready-for-review
size: large
created: 2026-04-30
---

# Fetchomatic press-release rethink

Status summary: discovery, the first-pass strategy doc, lint/tooling cleanup, and the retry surface reduction are done. The latest published npm version is `0.1.0`, published on 2025-09-16; current `main` has 11 commits after `v0.1.0`. Missing pieces are broader product decisions, fuller docs, and the remaining cleanup items.

## Discovery checklist

- [x] Confirm latest published artifact. *The npm registry reports `fetchomatic@0.1.0` as latest, published 2025-09-16; the tarball includes `client`, `hooks`, `logging`, and `exports` modules.*
- [x] Compare current `main` to the last published tag. *`git diff v0.1.0..HEAD` shows the chainable API/client/hooks/logging removal, new top-level options API, map-like cache support, retry option policy work, and test harness refactors.*
- [x] Verify current local behavior. *`pnpm test` passes 55 Playwright tests, and `pnpm build` passes with `tsconfig.lib.json`.*
- [x] Record and fix broken verification path. *`pnpm lint` initially failed in dependency types and then in ESLint 8/9 plugin mismatches; the current working tree has `pnpm lint`, `pnpm test`, and `pnpm build` passing.*
- [x] Map competing retry concepts. *The old source exposed simple `RetryOptions`, advanced `ShouldRetry` policy composition, `megaRetry`, and exported example presets; the current working tree has a single `RetryPolicy`/`RetryDecision` protocol plus `fetchomatic.retry(params, options)`.*

## Working-backwards press release

Today we are releasing Fetchomatic 1.0, a tiny policy layer for `fetch`.

Fetchomatic is for people who like the platform `fetch` API but still need production HTTP behavior: bounded retries, per-attempt timeouts, response validation, and standards-aware caching. It does not ask users to adopt a new client object, new request model, or new runtime dependency graph. You pass in the `fetch` implementation you already use, declare the policies you want, and get back another `fetch`-compatible function.

The core promise is simple: keep `fetch`, add the boring production defaults, and make every policy explicit.

```ts
import {fetchomatic} from 'fetchomatic'

const apiFetch = fetchomatic(fetch, {
  defaults: {
    headers: {'user-agent': 'my-app/1.0'},
  },
  timeout: {ms: 5_000},
  retry: {
    maxRetries: 3,
    delays: [100],
    backoffMultiplier: 2,
    maxDelayMs: 5_000,
    jitter: 'full',
    methods: ['GET', 'PUT'],
    statuses: [429, 500, 502, 503, 504],
    respectRetryAfter: true,
  },
})

const response = await apiFetch('https://api.example.com/widgets')
```

Fetchomatic 1.0 is deliberately small. It is not an API client generator. It is not an HTTP framework. It is not a replacement for `fetch`. It is a composable, runtime-agnostic way to make existing `fetch` calls safer and clearer.

## Customer problem

Raw `fetch` is a good primitive, but real applications keep rebuilding the same surrounding behavior:

- Timeouts need to be scoped correctly per request and per retry attempt.
- Retries need to be safe by default, bounded, observable, and respectful of server hints like `Retry-After`.
- JSON parsing often needs runtime validation without hiding the underlying `Response`.
- Caching should use HTTP semantics instead of bespoke "memoize this URL" logic.
- The wrapper should work with the `fetch` already present in Node, browsers, Deno, Bun, test harnesses, or package-specific implementations.

The current repo already points in this direction, but the product surface is not crisp enough. The docs still read like an experiment, retry policy has multiple overlapping APIs, and the last published version exposed client/hook/logging concepts that the current source has since removed.

## Product tenets

- Fetch-compatible first: the main API returns a function that can be passed anywhere `fetch` can be passed.
- Policies, not clients: retries, timeout, parsing, caching, and defaults are policy wrappers around `fetch`.
- Runtime-agnostic: users bring their own `fetch`; the package should avoid runtime dependencies.
- Honest by default: no hidden retries on unsafe methods, no infinite retry defaults, no swallowed errors, no undocumented ordering.
- Simple path and escape hatch: common retry behavior should be declarative; advanced users should still be able to provide a custom policy.
- Observable without coupling: expose enough structured retry/cache/parse information for logging or tracing, but do not own logging adapters.

## Current state since `0.1.0`

The published `0.1.0` API exposed a fluent object:

```ts
const {fetch: myfetch} = fetchomatic(fetch).withRetry({shouldRetry})
```

The current source now exposes:

```ts
const myfetch = fetchomatic(fetch, {
  retry: {maxRetries: 4, delays: [10], backoffMultiplier: 2},
})
```

Main changes after `v0.1.0`:

- Removed the generated/fluent `fetchomatic(fetch).withX().fetch` shape.
- Removed `client`, `hooks`, `logging`, and `exports` source modules.
- Removed `retry.logRetry`, `failureOrRetrySuccessLogMethod`, and logger coupling.
- Added top-level `FetchomaticOptions` for `defaults`, `headers`, `userAgent`, `authorization`, `cache`, `retry`, `timeout`, and `parser`.
- Added declarative `RetryOptions` and `createRetryPolicy`.
- Replaced the advanced `ShouldRetry`/`RetryInstruction` pipeline with `RetryPolicy` and `RetryDecision`.
- Added map-like cache stores in addition to Keyv-like stores.
- Refactored tests around disposable in-process servers across several fetch implementations.
- Added Deno config/lock coverage and adjusted package tests.

This should be treated as a breaking release line. The deleted published modules and changed `fetchomatic` return type are not compatible with `0.1.0`.

## Messy concept map

Retry currently has too many first-class concepts:

- `RetryOptions`: declarative object used by `fetchomatic(fetch, {retry})`.
- `RetryPolicy`: custom function called after every settled attempt.
- `RetryDecision`: explicit `{retry: true, delayMs}` or `{retry: false}` return shape.
- `fetchomatic.retry(params, options)`: the built-in policy helper, also used internally to implement declarative retry options.

The intended public model is:

- Primary API: one declarative retry policy shape for 90% of users.
- Advanced escape hatch: one custom `retry` function for users with special rules.
- Internal/low-level composition helpers removed from the root surface.
- No example presets as root exports unless they become supported product features with docs and tests.

Suggested rename direction:

- Prefer `retries` over `maxRetries` if it means "additional attempts after the first request".
- Prefer `delay` over `delays` plus `backoffMultiplier` for new docs.
- Prefer `maxDelayMs` over `capRetryTimeout`, and keep "disable retry if too long" as a distinct option only if there is a clear use case.
- Split "when to retry" from "when to stop" from "how long to wait".

Possible retry shape:

```ts
retry: {
  maxRetries: 3,
  methods: ['GET', 'PUT', 'HEAD', 'OPTIONS'],
  statuses: [408, 429, 500, 502, 503, 504],
  errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'],
  delays: [100],
  backoffMultiplier: 2,
  maxDelayMs: 5_000,
  jitter: 'full',
  respectRetryAfter: true,
}
```

For custom behavior:

```ts
retry({attemptsMade, request, response, error}) {
  return {retry: true, delayMs: 250}
}
```

That advanced return shape is intentionally clearer than the old `RetryInstruction.retryAfterMs: number | null` because it separates decision from scheduling.

## Documentation plan

Rewrite the README around the press-release promise instead of the current list of aims.

Proposed README structure:

- One-sentence value prop.
- Install and compatibility.
- "Wrap fetch, get fetch back" quick start.
- Retry recipes:
  - bounded retries for idempotent methods
  - exponential backoff with full jitter
  - respecting `Retry-After`
  - custom retry function
- Timeout behavior, especially per-attempt semantics when combined with retry.
- Parsing/validation with Standard Schema and Zod-like parsers.
- HTTP caching with Keyv-like and Map-like stores.
- Policy ordering:
  - defaults/headers are applied before cache/retry/timeout see the request
  - timeout is per attempt
  - cache wraps network fetches and revalidation
  - parser wraps the final response
- API reference.
- Migration from `0.1.0`.
- Explicit experimental/unstable notes if this is not ready for 1.0.

## Code cleanup plan

- [ ] Decide release posture: `0.2.0` breaking cleanup vs `1.0.0` stabilization.
- [x] Fix the verification baseline. *Added dependency declaration skipping for typecheck, aligned ESLint with the plugin stack, ignored excluded package fixtures, and cleaned up reported lint issues.*
- [ ] Decide whether deleted published modules stay deleted. If yes, document migration from `client`, `hooks`, `logging`, `fetchWrapper`, and `retry` namespace exports.
- [x] Consolidate retry into primary declarative options plus one custom escape hatch. *`retry` now accepts either `RetryOptions` or a `RetryPolicy`, and both use the same `RetryDecision` protocol.*
- [x] Remove or de-publicize retry examples/presets that are not product commitments. *Removed the old `createShouldRetry`/preset helper surface from source and root types.*
- [ ] Add focused retry tests for `Retry-After`, `x-ratelimit-reset`, jitter boundaries, max delay, unsafe methods, thrown error codes, and custom retry behavior.
- [ ] Add API/package tests that assert the generated `.d.ts` surface and import paths match the intended public contract.
- [ ] Document and test wrapper ordering.
- [ ] Revisit `parseFetchArgs` support for `Request` inputs, because rejecting `RequestInfo` limits fetch compatibility.
- [ ] Revisit error-code extraction, because current retry checks `error.cause.code` but common thrown errors may expose `error.code` directly.
- [ ] Revisit cache key semantics, because caching only by URL may be surprising for `Vary` or request headers.
- [ ] Rewrite README from the new product framing.

## Open decisions

- Is Fetchomatic mainly a "safe fetch policy wrapper", or should the typed client idea return later as a separate package/module?
- Should low-level retry composition remain gone, or should any advanced helpers come back under an explicitly separate namespace?
- Should logging be entirely user-land via custom callbacks/events, or should there be a first-party observability hook?
- Should cache stay in the core package, or move behind an optional entrypoint like `fetchomatic/cache`?
- How strongly should docs promise browser support while cache stores and some tests are Node-centric?

## Implementation notes

- 2026-04-30: Confirmed npm latest with `npm view fetchomatic version time dist-tags --json`.
- 2026-04-30: Packed `fetchomatic@0.1.0` to inspect the actual published artifact.
- 2026-04-30: Compared local `main` against `v0.1.0`; the branch is 11 commits ahead of the published tag.
- 2026-04-30: Ran `pnpm test`: 55 tests passed.
- 2026-04-30: Ran `pnpm build`: library build passed.
- 2026-04-30: Ran `pnpm lint`: failed in dependency type checking on `URLPattern` and `expiry-map` iterator types.
- 2026-04-30: Fixed lint baseline; `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- 2026-04-30: Reduced retry to `RetryOptions | RetryPolicy`; added `fetchomatic.retry(params, options)` and tests for custom response/body retry policies.
