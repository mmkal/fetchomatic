// eslint-disable-next-line import/no-extraneous-dependencies
import {test, expect} from '@playwright/test'
import {createServerAdapter} from '@whatwg-node/server'
import * as http from 'node:http'
import {fetchomatic} from 'fetchomatic'
import {createTestSuite} from '../suite.js'
import {createCreateServer} from '../server.js'

const createServer = createCreateServer(async fetch => {
  const hostname = '127.0.0.1'
  const adapter = createServerAdapter(fetch, {disposeOnProcessTerminate: false})
  const server = http.createServer(adapter.requestListener)

  await new Promise<void>(resolve => server.listen(0, hostname, resolve))
  const address = server.address()

  return {
    baseUrl: `http://${hostname}:${(address as {port: number}).port.toString()}`,
    async [Symbol.asyncDispose]() {
      await adapter.dispose()
      await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()))
    },
  }
})

test.describe(`import pkg`, () => {
  createTestSuite({test, expect, fetch, fetchomatic, createServer})
})

let asyncModule: typeof import('fetchomatic')
test.beforeAll(async () => {
  asyncModule = await import('fetchomatic')
})

test.describe(`async import pkg`, () => {
  const _fetchomatic: typeof fetchomatic = Object.assign((...args) => asyncModule.fetchomatic(...args), {
    reject: (...args) => asyncModule.fetchomatic.reject(...args),
    retry: (...args) => asyncModule.fetchomatic.retry(...args),
  })
  createTestSuite({test, expect, fetch, fetchomatic: _fetchomatic, createServer})
})
