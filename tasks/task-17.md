# Task 17 — Add Supabase Auth scaffolding with login form

## Goal
Replace the fake login page with real Supabase Auth. Officer enters email + password, Supabase handles the session. No RLS yet -- just auth.

## Current state
- Login page at `src/routes/index.tsx` has a fake email/password form that navigates to `/dashboard` on click
- No Supabase Auth client calls anywhere
- `src/lib/supabase.ts` exports the Supabase client (already initialized with env vars)
- 3 demo users seeded in the `users` table but no Supabase Auth users created

## What to do

### 1. Add auth helper functions to a new file `src/lib/auth.ts`
```typescript
import { supabase, isSupabaseConfigured } from "./supabase";

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured) return { error: null, session: null };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { error, session: data?.session ?? null };
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}
```

### 2. Update login page `src/routes/index.tsx`
- Import `signIn` from `@/lib/auth`
- On form submit:
  - If Supabase is not configured, navigate to `/dashboard` (demo mode -- same as now)
  - If Supabase is configured, call `signIn(email, password)`
  - On success, navigate to `/dashboard`
  - On error, show the error message below the form in red text
- Add a loading state to the submit button (disable + show "Signing in..." while the request is in flight)

### 3. Add sign-out button to the sidebar
- In `src/components/app-shell.tsx`, import `signOut` from `@/lib/auth`
- Add a "Sign out" button at the bottom of the sidebar (below the nav links)
- On click: call `signOut()`, then navigate to `/`
- Import `LogOut` icon from `lucide-react` for the button

## Files to edit
- `src/lib/auth.ts` — new file with auth helpers
- `src/routes/index.tsx` — wire login form to Supabase Auth
- `src/components/app-shell.tsx` — add sign-out button

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
