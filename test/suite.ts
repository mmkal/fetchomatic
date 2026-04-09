/* eslint-disable @typescript-eslint/consistent-type-imports */
import type {Expect} from '@playwright/test'
import Keyv from 'keyv'
import {z} from 'zod'
import type * as srcTypes from '../src/index.js'
import type {CreateServer} from './server.js'

export type Test = (title: string, fn: () => Promise<void>) => void

type TestSuiteInputs = {
  test: Test
  expect: Expect
  fetch: typeof fetch
  fetchomatic: typeof srcTypes.fetchomatic
  retry: typeof srcTypes.retry
  createServer: CreateServer
}

export const createTestSuite = ({test, expect, fetch, fetchomatic, retry, createServer}: TestSuiteInputs) => {
  const mockFn = () => {
    const calls: unknown[][] = []
    const fn = (...args: unknown[]) => void calls.push(args)

    return Object.assign(fn, {mock: {calls}, clear: () => calls.splice(0, calls.length)})
  }

  test('retry succeed', async () => {
    await using server = await createServer({
      fetch() {
        if (server.helpers.previousRequests.length < 3) {
          return new Response('uh-oh', {status: 500})
        }

        return new Response('ok')
      },
    })
    const {fetcher} = fetchomatic(fetch).withRetry({
      shouldRetry: retry.createShouldRetry(
        retry.retryOnFailure(),
        retry.delayRetry({ms: 10}),
        retry.expBackoff({power: 2}),
        retry.capRetryAttempts({attempts: 4}),
      ),
    })
    const good = await fetcher(server.baseUrl)

    await expect(good.text()).resolves.toBe('ok')

    expect(server.helpers.previousRequests).toHaveLength(4)
    await expect(Promise.all(server.helpers.previousResponses.map(response => response.text()))).resolves.toEqual([
      'uh-oh',
      'uh-oh',
      'uh-oh',
      'ok',
    ])
  })

  test('retry delay waits between attempts', async () => {
    await using server = await createServer({
      fetch() {
        return server.helpers.previousRequests.length < 2
          ? new Response('uh-oh', {status: 500})
          : new Response('ok')
      },
    })
    const delayMs = 100
    const {fetcher} = fetchomatic(fetch).withRetry({
      shouldRetry: retry.createShouldRetry(
        retry.retryOnFailure(),
        retry.delayRetry({ms: delayMs}),
        retry.capRetryAttempts({attempts: 2}),
      ),
    })

    const start = Date.now()
    const response = await fetcher(server.baseUrl)
    const elapsedMs = Date.now() - start

    expect(response.status).toBe(200)
    expect(elapsedMs).toBeGreaterThanOrEqual(delayMs * 2 - 20)
    expect(server.helpers.previousRequests).toHaveLength(3)
  })

  test('retry give up', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('uh-oh', {status: 500}) // just always fails
      },
    })
    const {fetcher} = fetchomatic(fetch).withRetry({
      shouldRetry: retry.createShouldRetry(
        retry.retryOnFailure(),
        retry.delayRetry({ms: 10}),
        retry.expBackoff({power: 2}),
        retry.capRetryAttempts({attempts: 4}),
      ),
    })
    const bad = await fetcher(server.baseUrl)
    expect(bad.status).toBe(500)
    expect(await bad.text()).toBe('uh-oh')

    expect(server.helpers.previousRequests).toHaveLength(5)
    expect(server.helpers.previousResponses).toHaveLength(5)
    await expect(Promise.all(server.helpers.previousResponses.map(response => response.text()))).resolves.toEqual([
      'uh-oh',
      'uh-oh',
      'uh-oh',
      'uh-oh',
      'uh-oh',
    ])
  })

  test('parse', async () => {
    await using server = await createServer({
      fetch(request) {
        return Response.json({query: Object.fromEntries(new URL(request.url).searchParams)})
      },
    })
    const {fetcher} = fetchomatic(fetch).withParser({
      parser: {
        json: z.object({query: z.object({foo: z.string()})}),
      },
    })

    const good = await fetcher(`${server.baseUrl}?foo=x`)
    await expect(good.json()).resolves.toMatchObject({query: {foo: 'x'}})

    const bad = await fetcher(`${server.baseUrl}?notfoo=x`)
    await expect(bad.json().catch(e => e.message)).resolves.toEqual(
      `✖ Invalid input: expected string, received undefined → at query.foo`,
    )
  })

  test('timeout', async () => {
    await using server = await createServer({
      async fetch(request) {
        const url = new URL(request.url)
        await sleep(Number(url.searchParams.get('delay') || 0))

        return new Response('ok')
      },
    })
    const {fetcher} = fetchomatic(fetch).withTimeout({ms: 1000})

    const good = await fetcher(`${server.baseUrl}?foo=x&delay=500`)
    expect(good.status).toBe(200)

    const bad = async () => fetcher(`${server.baseUrl}?foo=x&delay=1500`)
    await expect(bad).rejects.toThrow(/aborted/i)
  })

  test('timeout is scoped per request', async () => {
    await using server = await createServer({
      async fetch(request) {
        const url = new URL(request.url)
        await sleep(Number(url.searchParams.get('delay') || 0))

        return new Response('ok')
      },
    })
    const {fetcher} = fetchomatic(fetch).withTimeout({ms: 100})

    const first = await fetcher(`${server.baseUrl}?delay=10`)
    expect(first).toMatchObject({status: 200})

    await sleep(150)

    const second = await fetcher(`${server.baseUrl}?delay=10`)
    expect(second).toMatchObject({status: 200})
  })

  test('redirect', async () => {
    await using server = await createServer({
      fetch(request) {
        const url = new URL(request.url)

        if (url.pathname === '/redirect1') {
          return Response.redirect(new URL('/redirect2', url.origin), 302)
        }

        if (url.pathname === '/redirect2') {
          return Response.redirect(new URL('/redirect3', url.origin), 302)
        }

        if (url.pathname === '/redirect3') {
          return Response.redirect(new URL('/', url.origin), 302)
        }

        if (url.pathname === '/') {
          return new Response('ok')
        }

        return new Response('Not found', {status: 404})
      },
    })
    const {fetcher} = fetchomatic(fetch)
      .withDefaults({redirect: 'follow'})

    const good = await fetcher(`${server.baseUrl}/redirect1`)
    await expect(good.text()).resolves.toBe('ok')
  })

  test('fetchomatic, cache, log, client', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('cached response', {
          headers: {
            'cache-control': 'immutable',
            now: new Date().toISOString(),
          },
        })
      },
    })
    const map = new Map<string, string>()
    const log = mockFn()

    const client = fetchomatic(fetch)
      .withBeforeRequest(({parsed}) => log('before raw fetch: ' + parsed.headers.label))
      .withCache({
        keyv: new Keyv({store: map}) as import('../src/cache/keyv.js').KeyvLike<string>,
      })
      .withBeforeRequest(({parsed}) => log('before cached fetch: ' + parsed.headers.label))
      .client({baseUrl: server.baseUrl})

    const one = await client.get.text('/', {headers: {label: 'first'}})
    await sleep(1000)
    const two = await client.get.text('/', {headers: {label: 'second'}})

    expect(log.mock.calls.map(c => c[0])).toMatchObject([
      'before cached fetch: first',
      'before raw fetch: first',
      'before cached fetch: second',
    ])
    expect(one.data).toBe('cached response')
    expect(two.data).toEqual(one.data)
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(two.headers).toMatchObject({
      ...withoutTransportHeaders(one.headers),
      date: expect.any(String),
      age: expect.any(String),
    })

    expect(Object.fromEntries(map.entries())).toEqual({
      [`keyv:${server.baseUrl}/`]: expect.stringMatching(/{.*policy.*,.*response.*}/),
    })
  })

  test('client with zod', async () => {
    await using server = await createServer({
      fetch(request) {
        return Response.json({query: Object.fromEntries(new URL(request.url).searchParams)})
      },
    })
    const client = fetchomatic(fetch).client({
      baseUrl: server.baseUrl,
      parsers: {
        '/': {
          json: z.object({
            query: z.object({x: z.string()}),
          }),
        },
      },
    })

    const res = await client.get.json('/', {query: {x: 'yy'}})
    expect(res.data).toEqual({query: {x: 'yy'}})

    const bad = async () => client.get.json('/', {query: {a: 'bb'}}).catch(e => e.message)
    expect(await bad()).toMatch(/Invalid input: expected string, received undefined → at query.x/s)
  })

  test('stale while revalidate', async () => {
    await using server = await createServer({
      async fetch(request) {
        const label = request.headers.get('label') || 'missing'

        if (label === 'second' && request.headers.has('if-none-match')) {
          await sleep(1500)
        }

        return new Response(label, {
          headers: {
            age: '0',
            'cache-control': 'max-age=1, stale-while-revalidate=1',
            etag: `"${label}"`,
          },
        })
      },
    })
    const map = new Map<string, string>()
    const log = mockFn()

    const client = fetchomatic(fetch)
      .withBeforeRequest(({parsed}) =>
        log(`[${parsed.headers.label}] before raw fetch (swr: ${parsed.headers.swr || 'false'})`),
      )
      .withBeforeRequest(({args, parsed}) => {
        args[1]!.headers = {
          ...parsed.headers,
          swr: Boolean(parsed.headers['if-none-match']).toString(),
        }

        return args
      })
      .withCache({
        keyv: new Keyv({store: map}),
      })
      .withBeforeRequest(({parsed}) => log(`[${parsed.headers.label}] before cooked fetch`))
      .client({baseUrl: server.baseUrl})

    const one = await client.get.text('/', {headers: {label: 'first'}})
    await sleep(1200)
    const two = await client.get.text('/', {headers: {label: 'second'}})
    await sleep(1200)
    const three = await client.get.text('/', {headers: {label: 'third'}})

    expect(log.mock.calls.map(c => c[0])).toMatchObject([
      '[first] before cooked fetch',
      '[first] before raw fetch (swr: false)',
      '[second] before cooked fetch',
      '[second] before raw fetch (swr: true)',
      '[third] before cooked fetch',
      '[third] before raw fetch (swr: false)',
    ])

    expect(one.data).toBe('first')
    expect(two.data).toBe('first')
    expect(three.data).toBe('third')
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(two.headers).toMatchObject({
      ...withoutTransportHeaders(one.headers),
      date: expect.any(String),
      age: expect.any(String),
    })

    expect([...map.entries()][0][1]).toEqual(expect.stringMatching(/{.*policy.*,.*response.*}/))
  })
}

const withoutTransportHeaders = (headers: Record<string, string>) => {
  const {connection, 'keep-alive': keepAlive, 'transfer-encoding': transferEncoding, ...rest} = headers
  void connection
  void keepAlive
  void transferEncoding
  return rest
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
