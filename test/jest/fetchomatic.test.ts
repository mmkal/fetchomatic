import express from 'express'
import {createTestSuite, server, startServer} from './server'

beforeAll(async () => {
  await startServer(express)
})

afterAll(async () => {
  await server.close()
})

beforeEach(async () => {
  await server.reset()
})

describe.each([
  ['global.fetch', global.fetch],
  ['node-fetch', require('node-fetch')],
  ['isomorphic-fetch', require('isomorphic-fetch')],
  ['make-fetch-happen', require('make-fetch-happen')],
  ['minipass-fetch', require('minipass-fetch')],
] as Array<[name: string, fetch: typeof global.fetch]>)('fetch with %s', (_name, fetch) => {
  createTestSuite({test, expect, fetch})
})
