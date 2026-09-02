# Task 15 — Add responsive mobile sidebar

## Goal
The app shell sidebar (inside `src/components/app-shell.tsx`) is always visible. On mobile viewports (< 768px), collapse it behind a hamburger menu button.

## Current state
- `AppShell` renders a sidebar with nav links + a main content area
- No mobile toggle exists — sidebar is always visible
- The sidebar contains: logo, nav links (Dashboard, Applications, Rate Grid, Policy Rules, Employers, Users, Audit Log), and a bottom section

## What to do

### 1. Add mobile toggle state
- Add `const [sidebarOpen, setSidebarOpen] = useState(false)` inside `AppShell`
- Import `Menu` and `X` icons from `lucide-react`

### 2. Add hamburger button
- Above the main content area (inside the top bar), add a button that's only visible on mobile: `<button className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>`
- Show `Menu` icon when closed, `X` when open

### 3. Make sidebar responsive
- On desktop (`md:` and up): sidebar stays fixed and visible as it is now
- On mobile (below `md:`): sidebar gets `fixed inset-y-0 left-0 z-40` positioning
  - Hidden by default (translate off-screen: `-translate-x-full`)
  - When `sidebarOpen` is true: `translate-x-0`
  - Add transition: `transition-transform duration-200`
- Add a backdrop overlay when sidebar is open on mobile: `fixed inset-0 z-30 bg-black/40` that closes sidebar on click

### 4. Close sidebar on navigation
- When a nav link is clicked on mobile, close the sidebar
- Add `onClick={() => setSidebarOpen(false)}` to each nav `<Link>`

## Files to edit
- `src/components/app-shell.tsx` — add mobile sidebar toggle

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
