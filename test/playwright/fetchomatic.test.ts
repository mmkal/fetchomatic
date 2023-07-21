import { test, expect } from '@playwright/test';
import express from 'express'
import {createTestSuite} from './suite.ts'
import { createRequire } from 'module';

const require = createRequire(import.meta.url)

const cases = [
  ['global.fetch', global.fetch],
  ['node-fetch', require('node-fetch')],
  ['isomorphic-fetch', require('isomorphic-fetch')],
  ['make-fetch-happen', require('make-fetch-happen')],
  ['minipass-fetch', require('minipass-fetch')],
]

cases.slice(0, 1).forEach(([name, fetch]) => {
  // test.describe(`${name} impl`, async () => {
    createTestSuite({name, test, expect, fetch: fetch})
  // })
})