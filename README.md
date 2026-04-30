# fetchomatic

Wrap fetch with retries, timeout, caching, error handling and more

🚧 Work in progress, probably shouldn't be used yet unless you're me or you want to help debug/design 🚧

Aims:

1. Transparently wrap fetch. Return functions that can be swapped in for `fetch`, anywhere.
1. Work with all fetch implementations (Browsers, undici, node-fetch, minipass-fetch, make-fetch-happen, deno, bun)
1. Be well-behaved, follow best practices.
1. Be very small.
1. Have no dependencies at all - users must even pass their own `fetch` in.
1. Be very configurable.
1. Work anywhere.
1. Be very flexible. Work with popular tools:
    - `zod` for parsing
    - `pino` for logging
    - `debug` for debugging
    - `next` for... stuff
    - `keyv` or any map-like store for caching
1. Be un-surprising and honest.

## Usage

```ts
const myfetch = fetchomatic(fetch, {
  retry: {
    maxRetries: 4,
    delays: [10],
    backoffMultiplier: 2,
    jitter: 'full',
    respectRetryAfter: true,
  },
})

await myfetch('https://example.com', {headers: {'user-agent': 'abc'}}) // myfetch can be used exactly like the built-in `fetch`
```

The `retry` option can also be a policy function. Fetchomatic calls it after every response or thrown error, including successful responses, and retries only when it returns `{retry: true}`.

```ts
const myfetch = fetchomatic(fetch, {
  retry: params =>
    fetchomatic.retry(params, {
      maxRetries: 4,
      delays: [10],
      backoffMultiplier: 2,
    }),
})
```

Custom policies can retry on anything they can observe:

```ts
const myfetch = fetchomatic(fetch, {
  async retry(params) {
    if (!params.response) return fetchomatic.retry(params, {maxRetries: 4})

    const body = await params.response.clone().json()
    if (body.foo === 'bar') {
      return {retry: true, delayMs: 250, reason: 'transient body marker'}
    }

    return {retry: false}
  },
})
```

Fetchomatic does not automatically clone responses for retry policies. If a policy needs to read a response body and still return that response to the caller, it should read from `params.response.clone()`.

Notes on how this implemented.

### TypeScript

It's written in TypeScript, and it's currently using import statements like `import {fetchomatic} from './index.js'`. Then TypeScript compiles it as CommonJS, and then a post-`tsc` script renames all files from `dist/cjs/abc.js` to `dist/cjs/abc.cjs`. Then there's a generate wrapper file, with all the same exports, so that ES Modules users can import the library without using `createRequire`. There might be OSS libraries that can do some of this automatically.
