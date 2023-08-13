// eslint-disable-next-line mmkal/import/no-extraneous-dependencies
import {test, expect} from '@playwright/test'
import {fetchomatic, retry} from 'fetchomatic'
import {createRequire} from 'module'
import {createTestSuite} from '../suite.js'

const require = createRequire(import.meta.url)
test.describe(`import pkg`, async () => {
  createTestSuite({test, expect, fetch: fetch, fetchomatic, retry})
})

test.describe(`require pkg`, async () => {
  // eslint-disable-next-line mmkal/@typescript-eslint/consistent-type-imports
  const cjs = require('fetchomatic') as typeof import('fetchomatic')
  createTestSuite({test, expect, fetch: fetch, fetchomatic: cjs.fetchomatic, retry: cjs.retry})
})

// eslint-disable-next-line mmkal/@typescript-eslint/consistent-type-imports
let asyncModule: typeof import('fetchomatic')
test.beforeAll(async () => {
  asyncModule = await import('fetchomatic')
})

test.describe(`async import pkg`, async () => {
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
  })
})
