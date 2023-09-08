import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: process.env.TEST_DIR || './test/node',
  fullyParallel: true,
  reporter: 'html',
  webServer: {
    command: "pnpm run test-server",
    url: 'http://localhost:7001/health',
    reuseExistingServer: true,
  },
});
