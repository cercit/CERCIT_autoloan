import { test, expect, type Page } from "@playwright/test";

// H4: the main pages on a phone (the "mobile" project, 375 px wide). Fails when
// the page scrolls sideways or something sticks out past the screen edge.
// Wide tables may scroll inside their own box; that is allowed.
//
// Public pages always run. Staff pages run when a login is given (a site
// connected to the database): PHONE_EMAIL and PHONE_PASSWORD, e.g. the
// practice officer. Run:
//   npx playwright test phone-layout --project=mobile

const BASE = process.env["BASE_PATH"] ?? "/CERCIT_autoloan";

const PUBLIC_PAGES = ["/", "/login", "/login?as=customer", "/login?as=official", "/apply", "/check-eligibility", "/application-status"];
const STAFF_PAGES = [
  "/dashboard",
  "/applications",
  "/customer-applications",
  "/portfolio",
  "/policy-rules",
  "/document-checks",
  "/employers",
  "/rate-grid",
  "/audit-log",
  "/organisation",
];

// Elements wider than the screen that are not inside a box that scrolls on its own
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const scrollsItself = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (["auto", "scroll"].includes(s.overflowX)) return true; // "hidden" cuts content off, so it counts
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && !scrollsItself(el.parentElement)) {
        const s = getComputedStyle(el);
        if (s.position === "fixed" || s.visibility === "hidden") continue;
        const name = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "");
        out.push(`${name} ends at ${Math.round(r.right)} px`);
        if (out.length >= 5) break;
      }
    }
    return out;
  });
}

async function check(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const sticking = await overflowing(page);
  return [...(sideways > 1 ? [`${path}: scrolls sideways by ${sideways} px`] : []), ...sticking.map((s) => `${path}: ${s}`)];
}

test("public pages fit a phone screen", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 768, "phone check: run with --project=mobile");
  const problems: string[] = [];
  for (const p of PUBLIC_PAGES) problems.push(...(await check(page, p)));
  expect(problems).toEqual([]);
});

test("staff pages fit a phone screen", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 768, "phone check: run with --project=mobile");
  const email = process.env["PHONE_EMAIL"], password = process.env["PHONE_PASSWORD"];
  test.skip(!email || !password, "no staff login given (PHONE_EMAIL / PHONE_PASSWORD)");
  test.setTimeout(STAFF_PAGES.length * 20000);
  await page.goto(`${BASE}/login?as=official`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  const problems: string[] = [];
  for (const p of STAFF_PAGES) problems.push(...(await check(page, p)));
  // and the first case on the list (the case screen has the widest content)
  await page.goto(`${BASE}/applications`);
  await page.waitForLoadState("networkidle");
  const first = await page.locator('main a[href*="/applications/"]').first().getAttribute("href").catch(() => null);
  if (first) problems.push(...(await check(page, first.replace(BASE, ""))));
  expect(problems).toEqual([]);
});
