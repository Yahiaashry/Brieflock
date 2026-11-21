import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
const hostname = new URL(baseURL).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
  throw new Error("Browser tests require a local, disposable BriefLock instance.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  retries: 0,
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    },
  }],
});
