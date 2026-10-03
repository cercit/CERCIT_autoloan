import { test, expect, type Page } from "@playwright/test";

// H1: open every staff page as each role and fail on a page stuck loading, an
// error on screen, a page the menu offers but the role can't open, or sample
// data on a site connected to the database.
//
// Needs the logins of the site under test, from the environment (never in the code):
//   PRACTICE_PASSWORD                 the three practice logins (Officer, Manager, Head)
//   ADMIN_EMAIL, ADMIN_PASSWORD       an admin login
//   DEMO_PASSWORD                     the public demo visitor (cercit+demo@gmail.com)
//   (OFFICER_EMAIL / _PASSWORD, MANAGER_..., HEAD_... override the practice logins)
// A role without a password is skipped. Logins that hold every right sign in with an
// emailed code, which this can't read: give ADMIN_* only for an admin login that uses a password.
// Needs a site connected to the database (without one, every sign-in goes to the customer page). Run:
//   PRACTICE_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... DEMO_PASSWORD=... npx playwright test role-pages --project=desktop
// Run it after every fix batch.

const BASE = process.env["BASE_PATH"] ?? "/CERCIT_autoloan";
const env = (k: string) => process.env[k] || "";

const ROLES = [
  { role: "Officer", email: env("OFFICER_EMAIL") || "cercit+practice.officer@gmail.com", password: env("OFFICER_PASSWORD") || env("PRACTICE_PASSWORD") },
  { role: "Manager", email: env("MANAGER_EMAIL") || "cercit+practice.manager@gmail.com", password: env("MANAGER_PASSWORD") || env("PRACTICE_PASSWORD") },
  { role: "Head", email: env("HEAD_EMAIL") || "cercit+practice.head@gmail.com", password: env("HEAD_PASSWORD") || env("PRACTICE_PASSWORD") },
  { role: "Admin", email: env("ADMIN_EMAIL"), password: env("ADMIN_PASSWORD") },
  { role: "Demo", email: env("DEMO_EMAIL") || "cercit+demo@gmail.com", password: env("DEMO_PASSWORD") },
];

const PAGES = [
  "/dashboard",
  "/applications",
  "/customer-applications",
  "/approvals",
  "/portfolio",
  "/policy-rules",
  "/document-checks",
  "/employers",
  "/rate-grid",
  "/users",
  "/roles",
  "/organisation",
  "/audit-log",
];

// Text that only the built-in sample data contains
const SAMPLE_MARKERS = [/Prototype data/i, /APP-2026-008\d\d/, /CER-2026-04821/, /Anand Gopal/];
const ERROR_TEXT = /couldn't|could not|failed|permission denied|something went wrong|not authenticated/i;
const GUARD_TEXT = "Your role can't open this page";

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login?as=official`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
}

async function stillLoading(page: Page) {
  return page.locator("text=/Loading/").filter({ visible: true }).count();
}

for (const r of ROLES) {
  test(`every page opens properly as ${r.role}`, async ({ page }) => {
    test.skip(!r.email || !r.password, `no login given for ${r.role}`);
    test.skip((page.viewportSize()?.width ?? 1280) < 1024, "run on the desktop project; phone layout is H4's check");
    test.setTimeout(PAGES.length * 30000);

    const crashes: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Minified React error #418")) crashes.push(e.message);
    });

    await signIn(page, r.email, r.password);
    // Pages the menu offers this role (both copies of the menu are in the page)
    const offered = new Set<string>();
    for (const p of PAGES) if ((await page.locator(`aside a[href$="${p}"]`).count()) > 0) offered.add(p);

    const problems: string[] = [];
    for (const p of PAGES) {
      crashes.length = 0;
      await page.goto(`${BASE}${p}`);
      await page.waitForLoadState("networkidle");
      // up to 15 s for loading messages to go
      for (let i = 0; i < 30 && (await stillLoading(page)) > 0; i++) await page.waitForTimeout(500);

      const body = (await page.locator("main").first().innerText().catch(() => "")) || (await page.locator("body").innerText());
      const guarded = body.includes(GUARD_TEXT);
      if (offered.has(p) && guarded) problems.push(`${p}: in the menu but the role can't open it`);
      if (!offered.has(p) && !guarded) problems.push(`${p}: not in the menu, but opens by its address without the "can't open" note`);
      if (guarded) continue;

      if ((await stillLoading(page)) > 0) problems.push(`${p}: still loading after 15 s`);
      const alerts = await page.locator('[role="alert"]').filter({ visible: true }).allInnerTexts();
      for (const a of alerts) if (ERROR_TEXT.test(a)) problems.push(`${p}: error shown: ${a.slice(0, 120)}`);
      for (const m of SAMPLE_MARKERS) if (m.test(body)) problems.push(`${p}: sample data on screen (${m.source})`);
      for (const c of crashes) problems.push(`${p}: script error: ${c.slice(0, 120)}`);
    }
    expect(problems, `${r.role}: pages with problems`).toEqual([]);
  });
}
