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
    - `keyv` for caching
1. Be un-surprising and honest.

## Obligatory CommonJS vs ESM stance

I want this to be usable from CommonJS or ESM, and avoid major pitfalls. So, the main export is commonjs, and there's an ESM wrapper which exposes each export. I respect [sindresorhus' opinionated-ness](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c) but there are many people who are still using CommonJS at time of writing. ESM can import CommonJS too, so the friendlier thing to do - for now, IMHO - is wrap. The default import (`require('fetchomatic')` or `import('fetchomatic')` or `import {...} from 'fetchomatic'`) minimises [the dual-package hazard](https://nodejs.org/api/packages.html#dual-package-hazard) by wrapping.
