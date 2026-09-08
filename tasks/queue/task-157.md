---
type: edit
target: src/lib/auth.ts
context: src/lib/supabase-auth.ts
---

## Instructions

Merge `src/lib/supabase-auth.ts` into `src/lib/auth.ts`, then the caller will delete supabase-auth.ts.

Keep EVERYTHING from auth.ts (AppUser type, DEMO_USER, getSession, requireAuth, getCurrentUser, signIn, signOut, isSupabaseConfigured re-export). Then ADD these from supabase-auth.ts:

1. Add this type export after AppUser:
```typescript
export type UserRole = "admin" | "credit_officer" | "reviewer" | "viewer";
```

2. Add ROLE_PERMISSIONS constant after DEMO_USER:
```typescript
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["view_assigned", "create", "evaluate", "override", "approve", "decline", "manage_users", "view_reports", "export", "audit"],
  credit_officer: ["view_assigned", "create", "evaluate", "approve", "decline", "view_reports", "export"],
  reviewer: ["view_assigned", "view_reports", "override", "export"],
  viewer: ["view_assigned", "view_reports", "export"],
};
```

3. Add hasPermission function:
```typescript
export function hasPermission(role: string, action: string): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}
```

4. Add resetPassword function:
```typescript
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}
```

5. Add onAuthStateChange function:
```typescript
export function onAuthStateChange(callback: (event: string, session: unknown) => void): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return { unsubscribe: data.subscription.unsubscribe };
}
```

Do NOT change any existing function signatures or the import line. Keep `isSupabaseConfigured` guard pattern on all functions. The file must compile with `npx tsc --noEmit`.
