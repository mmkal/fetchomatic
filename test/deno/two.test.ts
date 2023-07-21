/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import {expect} from 'https://deno.land/x/expect@v0.4.0/mod.ts'
import {createTestSuite} from '../suite.ts'

createTestSuite({
  test: Object.assign((title: string, fn: Function) => Deno.test({
    name: title,
    fn,
    sanitizeResources: false,
    santizeOps: false,
  }), {skip: () => {}}),
  expect: ((value: any) => ({
    ...expect(value),
    toMatchObject: (expected: any) => expect(value).toEqual({...value, ...expected}),
    // toBe: (other: any) => expect(value).toEqual(other),
    // toHaveLength: (length: number) => expect({length: value.length}).toEqual({length}),
    // get resolves() {
    //   return new Promise(async (res, rej) => {
    //     const resolved = await value
    //     res({
    //       toMatchObject: (expected: any) => expect(resolved).toEqual({...resolved, ...expected}),
    //     })
    //   })
    // },
    // get not() {
    //   return {
    //     toEqual: (expected: any) => {
    //       try {
    //         expect(value).toEqual(expected)
    //       } catch {
    //         return
    //       }
    //       throw new Error(`Value ${JSON.stringify(value)} was not supposed to equal ${JSON.stringify(expected)}`)
    //     }
    //   }
    // }
  })) as any,
  fetch: fetch,
})
