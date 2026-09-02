# Task 18 — Add auth guard to protected routes

## Goal
After Task 17 adds Supabase Auth login, protect all routes except `/` (login) so unauthenticated users get redirected to login.

## Current state
- After Task 17, `src/lib/auth.ts` has `getSession()`, `signIn()`, `signOut()`
- All routes are accessible without login
- TanStack Router supports `beforeLoad` hooks for route guards

## What to do

### 1. Add auth check utility to `src/lib/auth.ts`
Add a function:
```typescript
export async function requireAuth() {
  if (!isSupabaseConfigured) return true;
  const session = await getSession();
  return !!session;
}
```

### 2. Add `beforeLoad` guard to `src/routes/__root.tsx`
TanStack Router supports `beforeLoad` on any route. Add it to the root route:

```typescript
import { redirect } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth";
```

In the route definition, add:
```typescript
beforeLoad: async ({ location }) => {
  if (location.pathname === "/" || location.pathname === "/CERCIT_autoloan/" || location.pathname === "/CERCIT_autoloan") return;
  const isAuth = await requireAuth();
  if (!isAuth) {
    throw redirect({ to: "/" });
  }
},
```

This checks auth on every route transition. The login page (`/`) is excluded. The GitHub Pages base path variants are also excluded.

### 3. Redirect to dashboard if already logged in
In `src/routes/index.tsx`, check on mount if a session exists. If so, redirect to `/dashboard` immediately instead of showing the login form.

```typescript
import { getSession } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";

// Inside the component:
useEffect(() => {
  getSession().then((s) => { if (s) navigate({ to: "/dashboard" }); });
}, []);
```

## Files to edit
- `src/lib/auth.ts` — add `requireAuth()`
- `src/routes/__root.tsx` — add `beforeLoad` guard
- `src/routes/index.tsx` — redirect if already authenticated

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
