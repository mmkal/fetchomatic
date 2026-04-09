# fetchomatic

Wrap fetch with retries, timeout, logging, caching, error handling and more

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
const {fetch: myfetch} = fetchomatic(fetch).withRetry({
  maxRetries: 4,
  delays: [10],
  backoffMultiplier: 2,
  jitter: 'full',
  respectRetryAfter: true,
})

await myfetch('https://example.com', {headers: {'user-agent': 'abc'}}) // myfetch can be used exactly like the built-in `fetch`
```

Notes on how this implemented.

### TypeScript

It's written in TypeScript, and it's currently using import statements like `import {withRetry} from './retry.js'`. Then TypeScript compiles it as CommonJS, and then a post-`tsc` script renames all files from `dist/cjs/abc.js` to `dist/cjs/abc.cjs`. Then there's a generate wrapper file, with all the same exports, so that ES Modules users can import the library without using `createRequire`. There might be OSS libraries that can do some of this automatically.
