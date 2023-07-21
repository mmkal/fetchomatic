import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/playwright',
  fullyParallel: true,
  webServer: {
    command: "pnpm run test-server",
    url: 'http://localhost:7001/health',
    reuseExistingServer: true,
  },
});
