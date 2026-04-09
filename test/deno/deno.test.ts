/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import {expect} from 'npm:expect'
import {createTestSuite} from '../suite.ts'
import {createCreateServer} from '../server.ts'
import {fetchomatic} from '../../src/index.ts'

const createServer = createCreateServer(async fetch => {
  const server = Deno.serve({hostname: '127.0.0.1', port: 0}, fetch)
  return {
    baseUrl: `http://127.0.0.1:${server.addr.port}`,
    async [Symbol.asyncDispose]() {
      await server.shutdown()
    },
  }
})

createTestSuite({
  test: Object.assign(
    (title: string, fn: Parameters<typeof Deno.test>[1]) => Deno.test({
      name: title,
      fn,
      sanitizeResources: false,
      sanitizeOps: false,
    }),
    {skip: () => {}},
  ),
  // use jest's expect, the API is close enough to work
  // deno-lint-ignore no-explicit-any
  expect: expect as any,
  fetch: fetch,
  fetchomatic,
  createServer,
})
