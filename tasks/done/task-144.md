---
type: new
target: src/lib/supabase-auth.ts
context: src/lib/supabase.ts
---

## Instructions

Create a TypeScript module for authentication and session management using Supabase Auth.

Requirements:
- Import supabase client from `@/lib/supabase`
- Named export type `UserProfile`:
  - `id: string`
  - `email: string`
  - `name: string`
  - `role: "admin" | "credit_officer" | "reviewer" | "viewer"`
  - `branch: string | null`
  - `employeeId: string | null`
  - `avatarUrl: string | null`
  - `lastLoginAt: string | null`
- Named export `async function signInWithEmail(email: string, password: string): Promise<{user: UserProfile | null; error: string | null}>`
  - Use supabase.auth.signInWithPassword
  - On success, fetch user profile from a "profiles" table
- Named export `async function signOut(): Promise<void>`
  - Use supabase.auth.signOut
- Named export `async function getCurrentUser(): Promise<UserProfile | null>`
  - Use supabase.auth.getUser, then fetch profile
- Named export `async function getSession(): Promise<{accessToken: string; expiresAt: number} | null>`
  - Use supabase.auth.getSession
- Named export `async function resetPassword(email: string): Promise<{success: boolean; error: string | null}>`
  - Use supabase.auth.resetPasswordForEmail
- Named export `function onAuthStateChange(callback: (event: string, session: unknown) => void): {unsubscribe: () => void}`
  - Use supabase.auth.onAuthStateChange
- Named export `ROLE_PERMISSIONS: Record<string, string[]>` — what each role can do:
  - admin: ["view_all", "create_application", "evaluate", "override", "manage_users", "manage_policies", "manage_dealers", "view_audit"]
  - credit_officer: ["view_assigned", "create_application", "evaluate", "view_audit"]
  - reviewer: ["view_assigned", "evaluate", "override", "view_audit"]
  - viewer: ["view_assigned"]
- Named export `function hasPermission(role: string, action: string): boolean`
- If supabase not configured, mock: signIn always succeeds with a test user (role: credit_officer), getCurrentUser returns the test user.
- No React
