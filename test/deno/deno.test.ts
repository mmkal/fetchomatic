/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import {expect} from 'npm:expect'
import {createTestSuite} from '../suite.ts'

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
  // deno-lint-ignore no-explicit-any
  expect: expect as any,
  fetch: fetch,
})
