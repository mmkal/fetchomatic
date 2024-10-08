/* eslint-disable @typescript-eslint/consistent-type-imports */
import type {Expect} from '@playwright/test'
import type _express from 'express'
import Keyv from 'keyv'
import {z} from 'zod'
import type * as Src from '../src/index.js'

export type Test = (title: string, fn: () => Promise<void>) => void

type TestSuiteInputs = {
  test: Test
  expect: Expect
  fetch: typeof fetch
  fetchomatic: typeof Src.fetchomatic
  retry: typeof Src.retry
}

export const createTestSuite = ({test, expect, fetch, fetchomatic, retry}: TestSuiteInputs) => {
  const mockFn = () => {
    const calls: unknown[][] = []
    const fn = (...args: unknown[]) => void calls.push(args)

    return Object.assign(fn, {mock: {calls}, clear: () => calls.splice(0, calls.length)})
  }

  const getRetryHelpers = () => {
    const warn = mockFn()
    const error = mockFn()
    const {fetch: myfetch} = fetchomatic(fetch).withRetry({
      shouldRetry: retry.createShouldRetry(
        retry.retryOnFailure(),
        retry.delayRetry({ms: 10}),
        retry.expBackoff({power: 2}),
        retry.capRetryAttempts({attempts: 4}),
        retry.logRetry({logger: {...console, warn, error}}),
        opts => {
          const previous = opts.basis(opts)
          if (typeof previous.retryAfterMs !== 'number') {
            return previous
          }

          return {
            ...previous,
            request: parsed => {
              const headers = {...parsed.headers, retry_number: `${Number(parsed.headers.retry_number || 0) + 1}`}
              return {headers}
            },
          }
        },
      ),
    })
    return {warn, error, myfetch}
  }

  test('retry succeed', async () => {
    const {warn, error, myfetch} = getRetryHelpers()
    const good = await myfetch('http://localhost:7001/get', {headers: {request_failures: '3'}})

    await expect(good.json()).resolves.toMatchObject({headers: {request_failures: '3'}})

    expect(error.mock.calls).toHaveLength(4)
    expect(warn.mock.calls).toHaveLength(1)
  })

  test('retry give up', async () => {
    const {warn, error, myfetch} = getRetryHelpers()
    const bad = await myfetch('http://localhost:7001/get', {headers: {request_failures: '10'}}) // Our 4 retries won't be enough, this should fail
    expect(bad.status).toBe(500)
    expect(await bad.json()).toMatchObject({
      message: 'Failed 5 times',
    })

    expect(error.mock.calls).toHaveLength(5)
    expect(warn.mock.calls).toHaveLength(1)
  })

  test('parse', async () => {
    // todo: consider removing withParser in favour of `.client`
    const {fetch: myfetch} = fetchomatic(fetch).withParser({
      parser: {
        json: z.object({query: z.object({foo: z.string()})}),
      },
    })

    const good = await myfetch('http://localhost:7001/get?foo=x')
    await expect(good.json()).resolves.toMatchObject({query: {foo: 'x'}})

    const bad = await myfetch('http://localhost:7001/get?notfoo=x')
    await expect(bad.json().catch(e => e.message)).resolves.toEqual(
      JSON.stringify(
        [
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'undefined',
            path: ['query', 'foo'],
            message: 'Required',
          },
        ],
        null,
        2,
      ).trim(),
    )
  })

  test('timeout', async () => {
    const {fetch: myfetch} = fetchomatic(fetch).withTimeout({ms: 1000})

    const good = await myfetch('http://localhost:7001/get?foo=x', {headers: {delay_ms: '500'}})
    await expect(good.json()).resolves.toMatchObject({query: {foo: 'x'}})

    // make sure this is a function, not a promise, for bun's sake: https://github.com/oven-sh/bun/issues/1546#issuecomment-1645239445
    const bad = async () => myfetch('http://localhost:7001/get?foo=x', {headers: {delay_ms: '1500'}})
    // https://github.com/nodejs/node/issues/40692#issuecomment-956658594
    await expect(bad).rejects.toThrow(/aborted/i)
  })

  test('redirect', async () => {
    const good = await fetchomatic(fetch)
      .withDefaults({redirect: 'follow'})
      .fetch('http://localhost:7001/redirect?times=3&to=/get')
    await expect(good.json()).resolves.toMatchObject({
      query: {
        original: '/redirect?times=3&to=/get',
        redirects: '3',
        times: '0',
        to: '/get',
      },
      url: '/?original=%2Fredirect%3Ftimes%3D3%26to%3D%2Fget&times=0&to=%2Fget&redirects=3',
    })
  })

  test('fetchomatic, cache, log, client', async () => {
    const map = new Map<string, string>()
    const log = mockFn()

    const client = fetchomatic(fetch)
      .withBeforeRequest(({parsed}) => log('before raw fetch: ' + parsed.headers.label))
      .withCache({
        // hopefully https://github.com/jaredwray/keyv/pull/805 will be merged, otherwise will have to work around this to avoid the `as KeyvLike`
        keyv: new Keyv({store: map}) as import('../src/cache/keyv.js').KeyvLike<string>,
      })
      .withBeforeRequest(({parsed}) => log('before cached fetch: ' + parsed.headers.label))
      .client({baseUrl: 'http://localhost:7001'})

    const one = await client.get.text('/get', {headers: {label: 'first'}})
    await new Promise(r => setTimeout(r, 1000))
    const two = await client.get.text('/get', {headers: {label: 'second'}})

    expect(log.mock.calls.map(c => c[0])).toMatchObject([
      'before cached fetch: first',
      'before raw fetch: first',
      'before cached fetch: second',
    ])
    expect(two.data).toEqual(one.data)
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(two.headers).toEqual({
      ...one.headers,
      date: expect.any(String),
      age: expect.any(String),
      connection: undefined,
      'keep-alive': undefined,
    })

    expect(Object.fromEntries(map.entries())).toEqual({
      'keyv:http://localhost:7001/get': expect.stringMatching(/{.*policy.*,.*response.*}/),
    })
  })

  test('client with zod', async () => {
    const client = fetchomatic(fetch).client({
      baseUrl: 'http://localhost:7001',
      parsers: {
        '/get': {
          json: z.object({
            query: z.object({x: z.string()}),
          }),
        },
      },
    })

    const res = await client.get.json('/get', {query: {x: 'yy'}})
    expect(res.data).toEqual({query: {x: 'yy'}})

    const bad = async () => client.get.json('/get', {query: {a: 'bb'}}).catch(e => e.message)
    expect(await bad()).toMatch(/invalid_type.*expected.*string.*received.*undefined.*path.*query.*x/s)
  })

  test('stale while revalidate', async () => {
    const map = new Map<string, string>()
    const log = mockFn()

    const client = fetchomatic(fetch)
      .withBeforeRequest(({parsed}) =>
        log(`[${parsed.headers.label}] before raw fetch (swr: ${parsed.headers.swr || 'false'})`),
      )
      .withHeaders({
        'set-response-headers': 'age=0&cache-control=max-age=1, stale-while-revalidate=2',
      })
      .withBeforeRequest(({args, parsed}) => {
        args[1]!.headers = {
          ...parsed.headers,
          // add an `swr` header based on `if-none-match`, since http-cache-semantics adds `if-none-match` based on etag
          swr: Boolean(parsed.headers['if-none-match']).toString(),
        }

        if (parsed.headers.label === 'second' && parsed.headers.swr) {
          // artificially slow down the second swr request so we can see that the third request blocks since it's outside the max-age and swr windows
          args[1]!.headers = {...parsed.headers, delay_ms: '3000'}
        }

        return args
      })
      .withCache({
        // hopefully https://github.com/jaredwray/keyv/pull/805 will be merged, otherwise will have to work around this to avoid the `as KeyvLike`
        keyv: new Keyv({store: map}) as import('../src/cache/keyv.js').KeyvLike<string>,
      })
      .withBeforeRequest(({parsed}) => log(`[${parsed.headers.label}] before cooked fetch`))
      .client({
        baseUrl: 'http://localhost:7001',
        parsers: {
          '/get': {json: {parse: x => x as any}},
        },
      })

    const one = await client.get.json('/get', {headers: {label: 'first'}})
    await new Promise(r => setTimeout(r, 2000))
    const two = await client.get.json('/get', {headers: {label: 'second'}})
    await new Promise(r => setTimeout(r, 2000))
    const three = await client.get.json('/get', {headers: {label: 'third'}})

    expect(one.data).toMatchObject({
      query: {},
      url: '/',
    })
    expect(one.data).toMatchObject({
      query: {},
      url: '/',
    })

    expect(log.mock.calls.map(c => c[0])).toMatchObject([
      '[first] before cooked fetch',
      '[first] before raw fetch (swr: false)',
      '[second] before cooked fetch',
      '[second] before raw fetch (swr: true)',
      '[third] before cooked fetch',
      '[third] before raw fetch (swr: false)',
    ])

    expect(one.data.headers).toMatchObject({label: 'first'})
    expect(two.data.headers).toMatchObject({label: 'first'})
    expect(three.data.headers).toMatchObject({label: 'third'})

    expect(two.data).toEqual(one.data)
    expect(three.data).not.toEqual(two.data) // three should have got a fresh response because two's swr request was slowed down
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(two.headers).toEqual({
      ...one.headers,
      date: expect.any(String),
      age: expect.any(String),
      connection: undefined,
      'keep-alive': undefined,
    })

    expect([...map.entries()][0][1]).toEqual(expect.stringMatching(/{.*policy.*,.*response.*}/))
  })

  // eslint-disable-next-line vitest/no-commented-out-tests
  // test.skip('errors', async () => {
  //   const myfetch = fetch

  //   await expect(myfetch('http://localhost:7002/get')).rejects.toMatchInlineSnapshot(`[TypeError: fetch failed]`)
  //   const err = await myfetch('http://localhost:7002/get').catch(e => e)
  //   expect(err.constructor.name).toMatchInlineSnapshot(`"TypeError"`)
  //   expect(err.message).toMatchInlineSnapshot(`"fetch failed"`)
  //   expect(err.name).toMatchInlineSnapshot(`"TypeError"`)
  //   expect(err.stack).toMatchInlineSnapshot(`
  //     "TypeError: fetch failed
  //         at Object.fetch (node:internal/deps/undici/undici:11413:11)
  //         at processTicksAndRejections (node:internal/process/task_queues:95:5)
  //         at Object.<anonymous> (/Users/mmkal/src/scratch/test/fetchomatic.test.ts:289:15)"
  //   `)
  //   await expect(myfetch('http://localhost:7002/get')).rejects.toMatchObject({
  //     code: 'foo',
  //   })
  // })
  // });
}
