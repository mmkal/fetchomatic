// eslint-disable-next-line import/no-extraneous-dependencies
import {test, expect} from '@playwright/test'
import {createServerAdapter} from '@whatwg-node/server'
import * as http from 'node:http'
import {fetchomatic, retry} from 'fetchomatic'
import {createTestSuite} from '../suite.js'
import {testServerFetch} from '../server.js'

const hostname = '127.0.0.1'

test.describe(`import pkg`, () => {
  createTestSuite({test, expect, fetch: fetch, fetchomatic, retry, createServer})
})

let asyncModule: typeof import('fetchomatic')
test.beforeAll(async () => {
  asyncModule = await import('fetchomatic')
})

test.describe(`async import pkg`, () => {
  createTestSuite({
    test,
    expect,
    fetch,
    fetchomatic: (...args) => asyncModule.fetchomatic(...args),
    retry: new Proxy({} as typeof retry, {
      get(target, prop) {
        return asyncModule.retry[prop as keyof typeof asyncModule.retry]
      },
    }),
    createServer,
  })
})

async function createServer() {
  const adapter = createServerAdapter(testServerFetch, {disposeOnProcessTerminate: false})
  const server = http.createServer(adapter.requestListener)

  await new Promise<void>(resolve => server.listen(0, hostname, resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error(`Expected server to listen on a TCP port`)
  }

  return {
    baseUrl: `http://${hostname}:${address.port}`,
    async [Symbol.asyncDispose]() {
      await adapter.dispose()
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}
