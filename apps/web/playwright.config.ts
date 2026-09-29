import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const WEB = 'http://localhost:3001';

/**
 * End-to-end tests (TESTING.md). Locally they reuse `pnpm dev` if it's running, or start it.
 * In CI they run against production builds (`pnpm build` first). Emails are read from the
 * outbox folder, so no mail server is needed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // the flows share rate-limit counters and the outbox
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Microsoft Edge on the owner's Windows machine (not on CI runners). It skips the journeys that
    // register accounts: registration is limited to 5 per hour per IP, and every local run is one IP.
    ...(isCI
      ? []
      : [
          {
            name: 'edge',
            use: { ...devices['Desktop Edge'], channel: 'msedge' },
            testIgnore: /member-journey|membership/,
          },
        ]),
  ],
  webServer: [
    {
      command: isCI ? 'pnpm --filter @iua/api start' : 'pnpm --filter @iua/api dev',
      url: 'http://localhost:4000/health/ready',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
    },
    {
      command: isCI ? 'pnpm --filter @iua/web start' : 'pnpm --filter @iua/web dev',
      url: `${WEB}/he`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      cwd: '../..',
    },
  ],
});
