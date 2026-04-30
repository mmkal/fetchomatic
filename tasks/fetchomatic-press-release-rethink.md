---
status: ready
size: large
created: 2026-04-30
updated: 2026-04-30
---

# Fetchomatic press-release rethink

Status summary: the rethink has moved from discovery to execution. The published baseline is still `fetchomatic@0.1.0`, published on 2025-09-16, and `main` now contains the first cleanup commit, `186e7ab Simplify retry policy surface`. Completed: npm/package comparison, lint baseline, test baseline, retry API reduction, and the first pass at final-response rejection. Missing: a full README rewrite, a release/migration decision, public API audit, and a few compatibility cleanups around request parsing, caching, and observability.

## Reframed thesis

Fetchomatic should be a tiny policy layer for people who already want to use `fetch`.

The product is not a generated client, a hook system, or a logging framework. It should let users keep the platform-shaped `fetch(input, init)` API while adding the production policies that every real integration eventually needs: retries, timeouts, response validation, and HTTP-aware caching.

The core promise:

> Bring any `fetch`; get a better `fetch` back.

That sentence should guide the docs and code. If a feature requires users to learn a new request model, a fluent client object, a plugin lifecycle, or a logger abstraction before they can understand it, it probably does not belong in the primary surface.

## Press release draft

Today we are releasing Fetchomatic 1.0, a small, runtime-agnostic policy layer for `fetch`.

Fetchomatic is for teams who like the standard `fetch` API but need safer production behavior: bounded retries, per-attempt timeouts, opt-in HTTP rejection, runtime response validation, request defaults, and standards-aware HTTP caching. Users pass in the `fetch` implementation they already use, declare the policies they want, and receive another `fetch`-compatible function.

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
  reject: {
    statuses: [400, 401, 403, 404, 500],
  },
})

const response = await apiFetch('https://api.example.com/widgets')
```

When the built-in retry policy is not enough, the same concept stays in place: `retry` becomes a function that returns an explicit decision.

```ts
const apiFetch = fetchomatic(fetch, {
  retry: async params => {
    if (!params.response) return fetchomatic.retry(params, {maxRetries: 3})

    const body = await params.response.clone().json()
    if (body.status === 'pending') {
      return {retry: true, delayMs: 250, reason: 'pending response'}
    }

    return {retry: false}
  },
})
```

Fetchomatic does not hide the original `Response`, clone bodies automatically, or turn `fetch` into a different client model. It adds policies, and the policies stay explicit.

Rejection is similarly explicit. Fetchomatic keeps the default `fetch` behavior unless users opt into `reject`, and rejection runs only after retry has decided not to try again.

## Settled decisions

- [x] Keep the main API fetch-compatible. *The primary return value is a callable `BaseFetch`, not a chainable object or generated client.*
- [x] Treat current `main` as a breaking line from `0.1.0`. *The published package exposed fluent chaining, `client`, `hooks`, `logging`, and `exports`; local source has intentionally removed those modules.*
- [x] Reduce retry to one mental model. *`retry` is now either declarative `RetryOptions` or a `RetryPolicy` function returning `RetryDecision`.*
- [x] Make the declarative retry policy reusable. *`fetchomatic.retry(params, options)` is the built-in policy helper and is also the implementation path for object config.*
- [x] Call retry policy for all settled attempts. *Custom policies can retry on 204, 200, body markers, thrown errors, or whatever else they can observe.*
- [x] Do not auto-clone responses for retry policies. *Docs now tell body-inspecting policies to use `params.response.clone()` so users who do not inspect bodies do not pay that cost.*
- [x] Remove first-class retry composition helpers and example presets. *`ShouldRetry`, `RetryInstruction`, `createShouldRetry`, `megaRetry`, and provider-flavored examples are gone from source/root types.*
- [x] Add opt-in final-response rejection. *`reject` can be declarative `RejectOptions` or a `RejectPolicy`, and runs after retry has finished.*
- [x] Restore verification baseline. *`pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:pkg`, and `pnpm test-all` pass after the cleanup.*

## Current public surface

Primary entrypoint:

```ts
fetchomatic(fetch, {
  defaults,
  headers,
  userAgent,
  authorization,
  timeout,
  retry,
  reject,
  cache,
  parser,
})
```

Retry surface:

```ts
type RetryPolicy = (params: RetryParams) => RetryDecision | Promise<RetryDecision>

type RetryDecision =
  | {retry: true; delayMs: number; reason?: string}
  | {retry: false; reason?: string}
```

The retry policy receives `attemptsMade`, `method`, `request`, `response`, `error`, and `errorCode`. `attemptsMade` is intentionally not called `attempt` because it avoids off-by-one ambiguity: the first completed fetch attempt reports `attemptsMade: 1`.

Reject surface:

```ts
type RejectPolicy = (params: RejectParams) => RejectDecision | Promise<RejectDecision>

type RejectDecision =
  | {reject: true; error: Error; reason?: string}
  | {reject: false; reason?: string}
```

The reject policy receives `method`, `request`, and the final `response`. Network errors already reject naturally, so the built-in reject policy is response-oriented rather than a second error-handling system.

## What should not come back by default

- The chainable `fetchomatic(fetch).withRetry(...).withParser(...).fetch` shape. It creates a new object model for something that should remain a fetch wrapper.
- `client` as part of the core package. A typed API client could be a future package or entrypoint, but it distracts from the main value prop.
- First-party logging wrappers. Logging should probably come from an event/observer surface or custom policy code, not a baked-in logger interface.
- Provider-flavored retry presets. They look useful, but they are product commitments. Examples in docs are safer until we know they are worth supporting.
- Low-level retry middleware composition as the common path. Plain functions compose well enough for the escape hatch.

## Remaining plan

- [ ] Decide release posture: `0.2.0` breaking cleanup or `1.0.0` stabilization.
- [ ] Rewrite the README around the new thesis. Keep the current README snippets, but replace the old aims/implementation notes with a real guide.
- [ ] Add a migration section from `0.1.0`. Cover removed fluent chaining, removed modules, removed `retry` namespace, and the new `fetchomatic.retry` helper.
- [ ] Add public API/package tests for generated `.d.ts` and import paths. The package test caught the `fetchomatic.retry` static property issue; make that kind of contract intentional.
- [ ] Add focused retry tests for `Retry-After`, `x-ratelimit-reset`, jitter boundaries, `maxDelayMs`, unsafe methods, and direct `error.code` retry matching.
- [ ] Add focused reject tests for method filtering, default non-ok rejection, cached rejected responses, and generated `.d.ts` surface.
- [ ] Document and test policy ordering. Be explicit about defaults/headers, timeout, retry, cache, and parser order.
- [ ] Revisit `parseFetchArgs` support for `Request` inputs. Rejecting `RequestInfo` is hard to square with the fetch-compatible promise.
- [ ] Revisit cache key semantics. URL-only keys may be surprising for `Vary`, authorization, and request-header-dependent responses.
- [ ] Decide whether cache belongs in core or in an optional entrypoint like `fetchomatic/cache`.
- [ ] Decide on an observability story. The likely direction is structured hooks/events, not logger wrappers.

## README shape

The next README should be short and product-led:

- One-sentence value prop: "Bring any `fetch`; get a better `fetch` back."
- Install and compatibility.
- Quick start with defaults, timeout, and retry.
- Retry recipe: bounded retries on normal failure statuses.
- Retry recipe: custom policy that delegates to `fetchomatic.retry`.
- Retry recipe: successful/body-based retry using `response.clone()`.
- Reject recipe: throw on selected final HTTP statuses after retry.
- Reject recipe: body-based rejection using `response.clone()`.
- Timeout semantics, especially per-attempt behavior with retry.
- Parser/validation with Standard Schema and Zod-like parsers.
- HTTP caching with Keyv-like and Map-like stores.
- Policy ordering.
- Migration from `0.1.0`.
- API reference.

## Open decisions

- Is `maxRetries` the final name, or should it become `retries` before release? Current code keeps `maxRetries`; `retries` is terser but may be less explicit.
- Should delay config stay as `delays` plus `backoffMultiplier`, or become a more structured `delay` object before release?
- Should `fetchomatic.retry` be the only static helper, or should helpers live in a namespace/secondary entrypoint if more appear?
- Should `reject: {}` continue to mean \"reject non-ok responses\", or should the default be more explicit before release?
- Is parser a core policy or a separate concern that belongs in an optional entrypoint later?
- What level of browser support do we want to promise while cache stores and tests are more Node-centric?

## Implementation notes

- 2026-04-30: Confirmed npm latest with `npm view fetchomatic version time dist-tags --json`.
- 2026-04-30: Packed `fetchomatic@0.1.0` to inspect the actual published artifact.
- 2026-04-30: Compared local `main` against `v0.1.0`; this line is a breaking API cleanup from the published package.
- 2026-04-30: Fixed lint/tooling baseline by adding `skipLibCheck`, aligning ESLint with the plugin stack, and cleaning reported lint issues.
- 2026-04-30: Reduced retry to `RetryOptions | RetryPolicy`, added `fetchomatic.retry(params, options)`, and added tests for custom response/body retry policies.
- 2026-04-30: Verified with `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:pkg`, and `pnpm test-all`.
- 2026-04-30: Committed and pushed `186e7ab Simplify retry policy surface` to `origin/main`.
- 2026-04-30: Added `RejectOptions | RejectPolicy`, `fetchomatic.reject(params, options)`, and tests for status, retry-before-reject, delegated, default, and body-based rejection.
