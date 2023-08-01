import {test, expect} from '@playwright/test'
import {createRequire} from 'module'
import {fetchomatic, retry} from '../../src/index.cjs'
import {createTestSuite} from '../suite.js'

const require = createRequire(import.meta.url)

const cases = [
  ['global.fetch', global.fetch],
  ['node-fetch', require('node-fetch')],
  ['isomorphic-fetch', require('isomorphic-fetch')],
  ['make-fetch-happen', require('make-fetch-happen')],
  ['minipass-fetch', require('minipass-fetch')],
]

cases.forEach(([name, fetch]) => {
  test.describe(`${name} impl`, async () => {
    createTestSuite({test, expect, fetch: fetch, fetchomatic, retry})
  })
})
