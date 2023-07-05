# fetchomatic
Wrap fetch with retries, timeout, logging, caching, error handling and more


Aims:

1. Transparently wrap fetch. Return functions that can be swapped in for `fetch`, anywhere.
1. Work with all fetch implementations (Browsers, undici, node-fetch, minipass-fetch, make-fetch-happen, deno, bun)
1. Be well-behaved, follow best practices.
1. Be very small.
1. Have no dependencies at all - users must even pass their own `fetch` in.
1. Be very configurable.
1. Be very flexible. Work with popular tools:
    - `zod` for parsing
    - `pino` for logging
    - `debug` for debugging
    - `next` for... stuff
    - `keyv` for caching
1. Be un-surprising and honest.
