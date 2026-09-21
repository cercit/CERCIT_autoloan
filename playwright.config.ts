import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  // Runs against the published demo by default, or a local site with the
  // database connected: BASE_URL=http://localhost:3010 BASE_PATH= npx playwright test
  use: {
    baseURL: process.env["BASE_URL"] ?? "https://cercit.github.io/CERCIT_autoloan",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 720 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
  ],
});
