Built a credit appraisal system from PRD to deployed prototype this week. Here's what the build actually looked like.

The product: cercit, a vehicle loan underwriting tool for credit officers. Dashboard, application pipeline, policy engine, sanction letters, rate grids. The kind of internal ops tool that a mid-size NBFC would use to process 40 loan files a day.

Started with a Lovable prototype and a Supabase backend with 22 tables and 8 PostgreSQL functions already running. The prototype looked right but nothing was connected — mock data everywhere, broken routes, generated components that duplicated each other.

The consolidation took longer than the feature build. 128 TypeScript errors after migrating routes. A code generator had produced 156 UI components; about 20 were actually needed. The rest either duplicated existing screens or didn't map to any real user flow. Knowing which to skip was slower than generating them.

Demo mode was the instructive part. Sounds like a one-line feature — check a flag, return mock data. It took four separate fixes across three layers: login bypass, route guard, session persistence, and SSR compatibility. Each bug only appeared after fixing the previous one. The pattern was always the same: a cached boolean that worked in one context but broke in another.

The PM lesson from this sprint: generated code shifts the bottleneck from writing to reading. The typing is fast. The triage — what to keep, what to skip, what to fix — that's where the hours go. And the hardest decisions weren't technical; they were scope calls. Eight components sat there ready to wire in, and the right move was to leave them out because they didn't serve a real user flow.

Then the scope expanded. The original build was employee-facing only -- a dashboard for credit officers. But a real lending product needs a customer entry point. So the second half of the sprint added a public landing page with an EMI calculator, a 4-step loan application form, and a dedicated login page. The landing page was ported from a separate design reference, which meant adapting asset pipelines, route structures, and data models instead of building from zero. Different muscle than feature development -- more like a codebase merge with design constraints.

17 routes now, live on GitHub Pages with a working demo login. Customer-facing pages are public; the officer dashboard sits behind auth. Not a production system, but complete enough to walk through both sides of the product: apply for a loan, then switch roles and review it.

#ProductManagement #CreditUnderwriting #VehicleFinance #BuildInPublic
