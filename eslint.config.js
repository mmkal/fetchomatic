import * as mmkal from 'eslint-plugin-mmkal'

export default [
  ...mmkal.recommendedFlatConfigs,
  {ignores: ['test/deno', 'test/bun', 'playwright.config.ts']}, // eslint struggles finding a tsconfig
]
