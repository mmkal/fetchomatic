/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import {beforeAll, afterAll, beforeEach} from 'https://deno.land/std@0.158.0/testing/bdd.ts'
import {expect} from 'https://deno.land/x/expect/mod.ts'
import express from 'npm:express@4.18.2'
import {server, startServer, createTestSuite} from '../jest/server.js'

beforeAll(async () => {
  await startServer(express)
})

afterAll(async () => {
  await server.close()
})

beforeEach(async () => {
  await server.reset()
})

createTestSuite({
  test: Object.assign(Deno.test as any, {skip: () => {}}),
  expect: ((value: any) => ({
    toEqual: (expected: any) => expect(value).toEqual(expected),
    toMatchObject: (expected: any) => expect(value).toEqual({...value, ...expected}),
  })) as any,
  fetch: fetch,
})
