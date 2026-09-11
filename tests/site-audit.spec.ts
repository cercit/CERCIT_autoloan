import { test, expect } from "@playwright/test";

const BASE = "/CERCIT_autoloan";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
  });

  test("renders hero section with heading", async ({ page }) => {
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText("closer than you think");
  });

  test("Apply Now link navigates to /apply", async ({ page }) => {
    const link = page.locator('a:has-text("Apply Now")').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${BASE}/apply`);
  });

  test("Check Eligibility link navigates to /check-eligibility", async ({ page }) => {
    const link = page.locator('a:has-text("Check Eligibility")').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${BASE}/check-eligibility`);
  });

  test("Login link visible in header", async ({ page }) => {
    const link = page.locator('a:has-text("Login")').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${BASE}/login`);
  });

  test("How it works section visible below fold", async ({ page }) => {
    const section = page.locator('text="How it works"').first();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test("EMI calculator section visible", async ({ page }) => {
    const section = page.locator('text="What will my EMI be?"').first();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test("Car brands section visible", async ({ page }) => {
    const section = page.locator('text="Finance for every new car"').first();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test("FAQ section visible", async ({ page }) => {
    const section = page.locator('text="Frequently asked questions"').first();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test("footer visible", async ({ page }) => {
    const footer = page.locator("text=cercit is a product demo").first();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await expect(footer).toBeVisible({ timeout: 10000 });
  });

  test("no horizontal scroll", async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("no console errors except hydration", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      if (!err.message.includes("Minified React error #418")) {
        errors.push(err.message);
      }
    });
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");
  });

  test("renders login form", async ({ page }) => {
    await expect(page.locator('h1:has-text("Welcome back")')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test("employee email routes to dashboard", async ({ page }) => {
    await page.fill('input[type="email"]', "demo@cercit.in");
    await page.fill('input[type="password"]', "demo");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain("dashboard");
  });

  test("customer email routes to application-status", async ({ page }) => {
    await page.fill('input[type="email"]', "test@gmail.com");
    await page.fill('input[type="password"]', "test");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/application-status/, { timeout: 10000 });
    expect(page.url()).toContain("application-status");
  });

  test("Apply now link works", async ({ page }) => {
    const link = page.locator('a:has-text("Apply now")');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${BASE}/apply`);
  });
});

test.describe("Apply page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/apply`);
    await page.waitForLoadState("networkidle");
  });

  test("renders step 1 form", async ({ page }) => {
    await expect(page.locator('text="Apply for your car loan"')).toBeVisible();
    await expect(page.locator("text=Step 1 of 4")).toBeVisible();
  });

  test("has all step-1 fields", async ({ page }) => {
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#dob")).toBeVisible();
    await expect(page.locator("#pan")).toBeVisible();
    await expect(page.locator("#aadhaar")).toBeVisible();
    await expect(page.locator("#mobile")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
  });

  test("Continue button visible", async ({ page }) => {
    const btn = page.locator('button:has-text("Continue")');
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();
  });
});

test.describe("Check eligibility page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/check-eligibility`);
    await page.waitForLoadState("networkidle");
  });

  test("renders eligibility form", async ({ page }) => {
    await expect(page.locator('text="Car loan eligibility"')).toBeVisible();
    await expect(page.locator('button:has-text("Check eligibility")')).toBeVisible();
  });

  test("can fill and submit eligibility check", async ({ page }) => {
    const inputs = page.locator("input").filter({ hasNot: page.locator('[role="combobox"]') });
    await inputs.nth(0).fill("750");
    await inputs.nth(1).fill("85000");
    await inputs.nth(2).fill("800000");
    await page.click('button:has-text("Check eligibility")');
    await page.waitForTimeout(1000);
    const resultText = await page.textContent("body");
    expect(resultText?.toLowerCase()).toContain("eligible");
  });
});

test.describe("Application status page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/application-status`);
    await page.waitForLoadState("networkidle");
  });

  test("renders application status", async ({ page }) => {
    await expect(page.locator('text="Your application"')).toBeVisible();
  });

  test("shows demo application data", async ({ page }) => {
    await expect(page.locator('text="CER-2026-04821"')).toBeVisible();
    await expect(page.locator('text="Hyundai Creta SX(O)"')).toBeVisible();
    await expect(page.locator('text="Under review"')).toBeVisible();
  });

  test("shows stage timeline", async ({ page }) => {
    await expect(page.locator('text="Application received"')).toBeVisible();
    await expect(page.locator('text="Documents verified"')).toBeVisible();
    await expect(page.locator('text="Credit assessment"')).toBeVisible();
  });

  test("shows what happens next section", async ({ page }) => {
    const section = page.locator('text="What happens next?"');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test("Home link works", async ({ page }) => {
    const link = page.locator('a:has-text("Home")');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `${BASE}/`);
  });
});

test.describe("Dashboard (employee)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', "demo@cercit.in");
    await page.fill('input[type="password"]', "demo");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/dashboard/, { timeout: 10000 });
  });

  test("renders dashboard with stats", async ({ page }) => {
    await expect(page.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")').first()).toBeVisible();
    await expect(page.locator("text=Total applications").first()).toBeVisible();
  });

  test("sidebar navigation links present", async ({ page }) => {
    await expect(page.locator('a:has-text("Applications")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Policy Rules")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Audit Log")').first()).toBeVisible();
  });

  test("My Queue section visible", async ({ page }) => {
    await expect(page.locator('text="My Queue"').first()).toBeVisible();
  });
});
