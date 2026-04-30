import type {Expect} from '@playwright/test'
import ExpiryMap from 'expiry-map'
import Keyv from 'keyv'
import {z} from 'zod'
import {parseHeaders} from '../src/convert.js'
import type * as srcTypes from '../src/index.js'
import type {CreateServer} from './server.js'

export type Test = (title: string, fn: () => Promise<void>) => void

type TestSuiteInputs = {
  test: Test
  expect: Expect
  fetch: typeof fetch
  fetchomatic: typeof srcTypes.fetchomatic
  createServer: CreateServer
}

export const createTestSuite = ({test, expect, fetch, fetchomatic, createServer}: TestSuiteInputs) => {
  test('retry succeed', async () => {
    await using server = await createServer({
      fetch() {
        if (server.helpers.previousRequests.length <= 2) {
          return new Response('uh-oh', {status: 500})
        }
        return new Response('ok')
      },
    })
    const fetcher = fetchomatic(fetch, {
      retry: {
        maxRetries: 4,
        delays: [10],
        backoffMultiplier: 2,
      },
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
        if (server.helpers.previousRequests.length <= 2) {
          return new Response('uh-oh', {status: 500})
        }
        return new Response('ok')
      },
    })
    const delayMs = 50
    const fetcher = fetchomatic(fetch, {
      retry: {
        maxRetries: 3,
        delays: [delayMs],
        backoffMultiplier: 2,
      },
    })

    const start = Date.now()
    const response = await fetcher(server.baseUrl)
    const elapsedMs = Date.now() - start

    expect(response.status).toBe(200)
    expect(elapsedMs).toBeGreaterThanOrEqual(delayMs + delayMs * 2 + delayMs * 4)
    expect(server.helpers.previousRequests).toHaveLength(4)
  })

  test('retry give up', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('uh-oh', {status: 500}) // always fails
      },
    })
    const fetcher = fetchomatic(fetch, {
      retry: {
        maxRetries: 4,
        delays: [10],
        backoffMultiplier: 2,
      },
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

  test('retry function can delegate to built-in retry policy', async () => {
    await using server = await createServer({
      fetch() {
        if (server.helpers.previousRequests.length <= 2) {
          return new Response('uh-oh', {status: 500})
        }
        return new Response('ok')
      },
    })
    const attemptsMade: number[] = []
    const fetcher = fetchomatic(fetch, {
      retry: params => {
        attemptsMade.push(params.attemptsMade)
        return fetchomatic.retry(params, {
          maxRetries: 4,
          delays: [10],
          backoffMultiplier: 2,
        })
      },
    })

    const good = await fetcher(server.baseUrl)

    await expect(good.text()).resolves.toBe('ok')
    expect(server.helpers.previousRequests).toHaveLength(4)
    expect(attemptsMade).toEqual([1, 2, 3, 4])
  })

  test('retry function can retry a successful response', async () => {
    await using server = await createServer({
      fetch() {
        if (server.helpers.previousRequests.length <= 1) {
          return new Response(null, {status: 204})
        }
        return new Response('ok')
      },
    })
    const fetcher = fetchomatic(fetch, {
      retry(params) {
        if (params.response?.status === 204 && params.attemptsMade <= 3) {
          return {retry: true, delayMs: 0, reason: 'empty response'}
        }

        return {retry: false, reason: 'usable response'}
      },
    })

    const response = await fetcher(server.baseUrl)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
    expect(server.helpers.previousRequests).toHaveLength(3)
  })

  test('retry function can inspect a cloned response body', async () => {
    await using server = await createServer({
      fetch() {
        return Response.json({foo: server.helpers.previousRequests.length === 0 ? 'bar' : 'ok'})
      },
    })
    const fetcher = fetchomatic(fetch, {
      async retry(params) {
        if (!params.response) return fetchomatic.retry(params, {maxRetries: 1})

        const body = await params.response.clone().json()
        if (body.foo === 'bar') {
          return {retry: true, delayMs: 0, reason: 'transient body marker'}
        }

        return {retry: false, reason: 'body is usable'}
      },
    })

    const response = await fetcher(server.baseUrl)

    await expect(response.json()).resolves.toEqual({foo: 'ok'})
    expect(server.helpers.previousRequests).toHaveLength(2)
  })

  test('reject option throws for matching final response statuses', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('not found', {status: 404})
      },
    })
    const fetcher = fetchomatic(fetch, {reject: {statuses: [404]}})

    await expect(fetcher(server.baseUrl)).rejects.toMatchObject({
      name: 'FetchomaticResponseError',
      response: {status: 404},
    })
    expect(server.helpers.previousRequests).toHaveLength(1)
  })

  test('reject option runs after retry is exhausted', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('uh-oh', {status: 500})
      },
    })
    const fetcher = fetchomatic(fetch, {
      retry: {
        maxRetries: 2,
        delays: [0],
      },
      reject: {statuses: [500]},
    })

    await expect(fetcher(server.baseUrl)).rejects.toMatchObject({
      name: 'FetchomaticResponseError',
      response: {status: 500},
    })
    expect(server.helpers.previousRequests).toHaveLength(3)
  })

  test('reject function can delegate to built-in reject policy', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('teapot', {status: 418})
      },
    })
    const fetcher = fetchomatic(fetch, {
      reject: params => fetchomatic.reject(params, {statuses: [418]}),
    })

    await expect(fetcher(server.baseUrl)).rejects.toMatchObject({
      name: 'FetchomaticResponseError',
      response: {status: 418},
    })
  })

  test('reject function can inspect a cloned response body', async () => {
    await using server = await createServer({
      fetch() {
        return Response.json({error: 'nope'})
      },
    })
    const fetcher = fetchomatic(fetch, {
      async reject(params) {
        const body = await params.response.clone().json()
        if (body.error) return {reject: true, error: new Error(body.error)}
        return {reject: false}
      },
    })

    await expect(fetcher(server.baseUrl)).rejects.toThrow('nope')
  })

  test('reject option defaults to rejecting non-ok responses', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('bad gateway', {status: 502})
      },
    })
    const fetcher = fetchomatic(fetch, {reject: {}})

    await expect(fetcher(server.baseUrl)).rejects.toMatchObject({
      name: 'FetchomaticResponseError',
      response: {status: 502},
    })
  })

  test('parse', async () => {
    await using server = await createServer({
      fetch(request) {
        return Response.json({query: Object.fromEntries(new URL(request.url).searchParams)})
      },
    })
    const fetcher = fetchomatic(fetch, {
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
    const fetcher = fetchomatic(fetch, {timeout: {ms: 1000}})

    const good = await fetcher(`${server.baseUrl}?delay=500`)
    expect(good.status).toBe(200)

    const bad = async () => fetcher(`${server.baseUrl}?delay=1500`)
    await expect(bad()).rejects.toThrow(/aborted/i)
  })

  test('timeout is scoped per request', async () => {
    await using server = await createServer({
      async fetch(request) {
        const url = new URL(request.url)
        await sleep(Number(url.searchParams.get('delay') || 0))

        return new Response('ok')
      },
    })
    const fetcher = fetchomatic(fetch, {timeout: {ms: 100}})

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
    const fetcher = fetchomatic(fetch, {defaults: {redirect: 'follow'}})

    const good = await fetcher(`${server.baseUrl}/redirect1`)
    await expect(good.text()).resolves.toBe('ok')
  })

  test('cache avoids a second request', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('response #' + (server.helpers.previousRequests.length + 1), {
          headers: {
            'cache-control': 'immutable',
            now: new Date().toISOString(),
          },
        })
      },
    })
    const map = new Map<string, string>()
    const fetcher = fetchomatic(fetch, {
      cache: {
        keyv: new Keyv({store: map}) as import('../src/cache/keyv.js').KeyvLike<string>,
      },
    })

    const one = await fetcher(server.baseUrl)
    await sleep(1000)
    const two = await fetcher(server.baseUrl)

    expect(await one.text()).toBe('response #1')
    expect(await two.text()).toBe('response #1')
    expect(server.helpers.previousRequests).toHaveLength(1)
    expect(parseHeaders(two.headers)).not.toEqual(parseHeaders(one.headers))
    expect(two.status).toEqual(one.status)
    expect(parseHeaders(two.headers)).toMatchObject({
      ...withoutTransportHeaders(parseHeaders(one.headers)),
      date: expect.any(String),
      age: expect.any(String),
    })

    expect(Object.fromEntries(map.entries())).toEqual({
      [`keyv:${server.baseUrl}/`]: expect.stringMatching(/{.*policy.*,.*response.*}/),
    })
  })

  test('cache accepts a plain map-like store', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('response ' + (server.helpers.previousRequests.length + 1), {
          headers: {
            'cache-control': 'immutable',
            now: new Date().toISOString(),
          },
        })
      },
    })
    const store = new Map<string, string>()
    const fetcher = fetchomatic(fetch, {cache: {store}})

    const one = await fetcher(server.baseUrl)
    await sleep(1000)
    const two = await fetcher(server.baseUrl)

    expect(await one.text()).toBe('response 1')
    expect(await two.text()).toBe('response 1')
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(Object.fromEntries(store.entries())).toEqual({
      [`${server.baseUrl}/`]: expect.stringMatching(/{.*policy.*,.*response.*}/),
    })
  })

  test('cache accepts expiry-map', async () => {
    await using server = await createServer({
      fetch() {
        return new Response('request to server count: ' + (server.helpers.previousRequests.length + 1), {
          headers: {
            'cache-control': 'immutable',
            now: new Date().toISOString(),
          },
        })
      },
    })
    const store = new ExpiryMap<string, string>(500)
    const fetcher = fetchomatic(fetch, {cache: {store}})

    const one = await fetcher(server.baseUrl)
    await sleep(100)
    const two = await fetcher(server.baseUrl)

    expect(await one.text()).toBe('request to server count: 1')
    expect(await two.text()).toBe('request to server count: 1')
    expect(two.headers).not.toEqual(one.headers)
    expect(two.status).toEqual(one.status)
    expect(store.get(server.baseUrl + '/')).toEqual(expect.stringMatching(/{.*policy.*,.*response.*}/))

    await sleep(500)

    const three = await fetcher(server.baseUrl)
    expect(await three.text()).toBe('request to server count: 2')
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
    const fetcher = fetchomatic(fetch, {
      cache: {
        keyv: new Keyv({store: map}),
      },
    })

    const one = await fetcher(server.baseUrl, {headers: {label: 'first'}})
    await sleep(1200)
    const two = await fetcher(server.baseUrl, {headers: {label: 'second'}})
    await sleep(1200)
    const three = await fetcher(server.baseUrl, {headers: {label: 'third'}})

    expect(await one.text()).toBe('first')
    expect(await two.text()).toBe('first')
    expect(await three.text()).toBe('third')
    await sleep(500)
    expect(server.helpers.previousRequests).toHaveLength(3)
    expect(
      server.helpers.previousRequests
        .map(request => ({
          label: request.headers.get('label'),
          revalidating: request.headers.has('if-none-match'),
        }))
        .sort((left, right) => left.label!.localeCompare(right.label!)),
    ).toEqual([
      {label: 'first', revalidating: false},
      {label: 'second', revalidating: true},
      {label: 'third', revalidating: false},
    ])
    expect(parseHeaders(two.headers)).not.toEqual(parseHeaders(one.headers))
    expect(two.status).toEqual(one.status)
    expect(parseHeaders(two.headers)).toMatchObject({
      ...withoutTransportHeaders(parseHeaders(one.headers)),
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
