import {test, expect} from '@playwright/test'
import {createServerAdapter} from '@whatwg-node/server'
import * as http from 'node:http'
import {createRequire} from 'module'
import {fetchomatic, retry} from '../../src/index.js'
import {createTestSuite} from '../suite.js'
import {createCreateServer} from '../server.js'

const require = createRequire(import.meta.url)
const createServer = createCreateServer(async fetch => {
  const hostname = '127.0.0.1'
  const adapter = createServerAdapter(fetch, {disposeOnProcessTerminate: false})
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
})

const cases = [
  ['global.fetch', global.fetch],
  ['node-fetch', require('node-fetch')],
  ['isomorphic-fetch', require('isomorphic-fetch')],
  ['make-fetch-happen', require('make-fetch-happen')],
  ['minipass-fetch', require('minipass-fetch')],
]

cases.forEach(([name, fetch]) => {
  test.describe(`${name} impl`, () => {
    createTestSuite({test, expect, fetch: fetch, fetchomatic, retry, createServer})
  })
})
