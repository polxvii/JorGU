import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    // A fake Maps key: the app runs in mode A, and every test serves a stub for the Maps script (helpers.ts),
    // so no test ever loads real Google Maps or spends a billed map load.
    env: { ...(process.env as Record<string, string>), VITE_GOOGLE_MAPS_API_KEY: 'e2e-fake-key', VITE_GOOGLE_MAP_ID: 'e2e-map-id' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 600 } },
    },
  ],
});
