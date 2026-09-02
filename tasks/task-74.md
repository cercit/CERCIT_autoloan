# Task 74 — Responsive layout audit and fixes

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Audit and fix responsive layout issues across the main pages. The app should work well on tablet (768px) and mobile (375px) viewports, not just desktop.

## Current state

- All pages use tailwind classes but may not have responsive breakpoints
- `src/components/app-shell.tsx` defines the main layout (sidebar + content)
- Key pages: dashboard, applications list, application detail, new application form
- shadcn components are generally responsive, but custom layouts may not be

## Steps

### 1. Fix `src/components/app-shell.tsx` sidebar for mobile

- Add a hamburger menu button visible only on `md:hidden`
- Make the sidebar hideable on mobile (toggle with state)
- On mobile, sidebar should overlay the content (absolute positioned, z-50)
- Desktop (md+): sidebar stays visible as-is

### 2. Fix `src/routes/dashboard.tsx` grid layouts

- Summary cards grid: change `grid-cols-4` to `grid-cols-2 md:grid-cols-4`
- Chart sections: ensure charts use `ResponsiveContainer` (Recharts) and don't overflow
- Stack chart sections vertically on mobile instead of side-by-side

### 3. Fix `src/routes/applications/index.tsx` table

- Wrap the table in a `div` with `overflow-x-auto` so it scrolls horizontally on mobile
- Optionally hide less-important columns on mobile: `hidden md:table-cell` on columns like FOIR, LTV

### 4. Fix `src/routes/applications/new.tsx` form

- Form grids: change multi-column grids to `grid-cols-1 md:grid-cols-2` or similar
- Ensure the eligibility indicator (task 73) stacks below the form on mobile instead of beside it

### 5. Fix `src/routes/applications/$id/index.tsx` detail page

- Copilot review sections: ensure Collapsible sections don't overflow on mobile
- Grid layouts inside sections: responsive column counts

Run `npx tsc --noEmit` after each file.

## Files to edit

- `src/components/app-shell.tsx` — mobile sidebar toggle
- `src/routes/dashboard.tsx` — responsive grid classes
- `src/routes/applications/index.tsx` — table overflow and column hiding
- `src/routes/applications/new.tsx` — form grid responsiveness
- `src/routes/applications/$id/index.tsx` — detail page grid responsiveness

## Done when

- `npx tsc --noEmit` exits clean
- Sidebar collapses to a hamburger menu on mobile
- Dashboard cards wrap to 2 columns on mobile
- Applications table scrolls horizontally on mobile
- New application form stacks to single column on mobile
- No horizontal page-level overflow on any page at 375px width
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button has a working handler (hamburger toggle)
