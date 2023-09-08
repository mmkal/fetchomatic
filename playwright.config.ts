import { defineConfig } from '@playwright/test';
import * as path from 'path'

const testDir = process.env.TEST_DIR || './test/node'
const outputDir = path.join('playwright-report', path.basename(testDir));

export default defineConfig({
  testDir,
  fullyParallel: true,
  outputDir,
  reporter: [['html', {outputFolder: outputDir}]],
  webServer: {
    command: "pnpm run test-server",
    url: 'http://localhost:7001/health',
    reuseExistingServer: true,
  },
});
