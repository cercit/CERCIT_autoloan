# cercit build sprint retro — September 2026

## What got built

Started with a Lovable-generated prototype and a 22-table Supabase schema. Ended with a working credit appraisal system: 15 routes, 111 components, demo mode with mock data, GitHub Pages deployment.

Key deliverables across 18 commits:

- **Decision engine pipeline** — policy rules, EMI calc, assessment functions running in Supabase
- **Application detail page** — 6 tabs (Overview, Documents, Extracted Data, Banking, Timeline, CAM Report), key metrics strip, approve/reject/escalate actions
- **Dashboard** — metric cards, exception queue, decision donut, application funnel, 30-day trend chart, portfolio quality gauges, live activity feed
- **Sanction + approval letters** — RBI-compliant, with KFS disclosures and APR calculations
- **Rate grid** — CIBIL band x employer category pricing table
- **Component library** — notification dropdown, SLA timer, activity feed, keyboard shortcuts, session timeout, theme toggle
- **Demo mode** — `demo@cercit.in` bypass with sessionStorage persistence, works across page reloads and SSR

## Where effort actually went

Roughly 60% on consolidation and integration work, 40% on new features. The breakdown tells the real story:

**Biggest time sink: Lovable-to-production migration.** 128 TypeScript errors after route migration. Most were import path mismatches and type incompatibilities between Lovable's generated components and the Hermes replacement components. Fixed in one pass, but it took careful reading — bulk find-and-replace would have introduced new bugs.

**Second biggest: demo mode.** Sounds trivial — set a flag, return mock data. Three separate bugs:
1. Login form called real Supabase because `isSupabaseConfigured` was true (env vars set). Fix: explicit email check for `demo@cercit.in`.
2. Route guard required a real Supabase session. Fix: add `|| demoMode` to `requireAuth()`.
3. HMR cleared the in-memory flag. Fix: persist to `sessionStorage`.
4. Full page reload still lost demo state. Fix: `isDemoMode()` reads sessionStorage on every call instead of caching at module init. Plus skip auth guard server-side.

Each bug only showed up after the previous one was fixed. Classic layered-auth debugging.

**Third: wiring Hermes components.** 156 components generated, ~20 actually needed. The rest duplicated existing UI or didn't fit any route. Knowing when to stop integrating saved more time than the integration itself.

## What was wasted

- **Browser automation friction.** Mobile viewport testing lost 15-20 minutes to the browser pane going hidden, form_input not triggering React controlled state, and demo sessions dying on navigation. The real testing was faster done via `get_page_text` and `read_page` than screenshots.
- **Over-generating components.** Hermes produced 156 components. We used about 20. The generation was fast but the triage was slow — reading each one, checking if the route already had that feature, deciding to skip.

## Defect class

Most bugs fell into one category: **environment-dependent auth state**. The app has three auth modes (Supabase configured + real session, Supabase configured + demo, Supabase not configured) and each was tested in isolation but not in combination with SSR, HMR, and full page reloads. The fix pattern was always the same: replace a cached boolean with a live check.

## Transferable rules

1. **Auth bypass for demos needs to be a first-class feature, not a hack.** If your app has a demo mode, wire it into every auth check from the start — route guards, API layer, session persistence. Bolting it on after the fact means debugging each layer separately.

2. **Generated code is a draft, not a deliverable.** Lovable/Hermes output needed 128 TS fixes and manual triage of 156 components. The generation saved days of typing; the integration still took hours of reading and deciding.

3. **Know when to stop wiring.** 8 Hermes components weren't connected to any route. Forcing them in would have meant building new routes with no user value. The portfolio demo works without them.

4. **Test the reload path, not just the HMR path.** Module-level state that works under HMR can break completely on a hard refresh. SessionStorage, cookies, or URL params are the only state that survives both.
