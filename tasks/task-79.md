# Task 79 — Meta tags and OpenGraph for public pages

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add proper `<title>`, `<meta description>`, and OpenGraph tags to the public eligibility checker page (task 78) and the root HTML template, so the page looks good when shared on LinkedIn or WhatsApp.

## Current state

- `index.html` is the Vite entry point at the project root
- `src/routes/check-eligibility.tsx` is the public page (task 78)
- No meta tags or OpenGraph configuration exists beyond the default Vite template
- Product name is "cercit" — "Credit Evaluation and Risk Compliance Intelligence Tool"

## Steps

### 1. Update `index.html`

Add the following to the `<head>` section:

```html
<title>cercit — AI Credit Appraisal</title>
<meta name="description" content="AI-powered credit appraisal and underwriting for vehicle finance. Faster decisions, consistent policy, full audit trail." />
<meta property="og:title" content="cercit — AI Credit Appraisal" />
<meta property="og:description" content="AI-powered credit appraisal and underwriting for vehicle finance." />
<meta property="og:type" content="website" />
<meta property="og:image" content="/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="cercit — AI Credit Appraisal" />
<meta name="twitter:description" content="AI-powered credit appraisal and underwriting for vehicle finance." />
```

### 2. Update page titles per route

In `src/routes/check-eligibility.tsx`, add a `useEffect` that sets `document.title` on mount:

```typescript
useEffect(() => {
  document.title = "Check Eligibility — cercit";
  return () => { document.title = "cercit — AI Credit Appraisal"; };
}, []);
```

Do the same for the dashboard route (`src/routes/dashboard.tsx`):
```typescript
useEffect(() => {
  document.title = "Dashboard — cercit";
}, []);
```

And the applications list (`src/routes/applications/index.tsx`):
```typescript
useEffect(() => {
  document.title = "Applications — cercit";
}, []);
```

Run `npx tsc --noEmit`.

## Files to edit

- `index.html` — add meta and OpenGraph tags
- `src/routes/check-eligibility.tsx` — set page title
- `src/routes/dashboard.tsx` — set page title
- `src/routes/applications/index.tsx` — set page title

## Done when

- `npx tsc --noEmit` exits clean
- `index.html` has title, description, og:title, og:description, og:type, twitter:card tags
- Public eligibility page sets its own document title
- Dashboard and applications list set their own document titles
- No `// # reason:` or `// Self-review` comments in any edited file
