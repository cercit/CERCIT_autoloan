# Task 27 — Policy rules toggle active/inactive

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The policy rules page is read-only. Add the ability to toggle a rule's active/inactive status via a clickable pill, with the change saved to Supabase.

## Current state

File: `src/routes/policy-rules.tsx`
- State: `policyRules` (Record<string, PolicyRule[]>), `policyTabs` (string[]), `tab` (string)
- Rules fetched via `getMappedPolicyRules()` which returns `{ rules, tabs }`
- Each rule rendered in a table row — no toggle capability
- "Add new rule" button exists but does nothing

File: `src/lib/api.ts` — `getMappedPolicyRules()` function:
- Queries `policy_rules` table
- Maps DB rows to `PolicyRule` type from mock-data.ts
- Currently does NOT include `rule_id` in the returned objects

File: `src/lib/mock-data.ts` — `PolicyRule` type:
- Check the type definition. It likely has `name`, `description`, `value`, `active` (boolean), etc.
- It does NOT have an `id` field

## Steps

### 1. Add `id` to `PolicyRule` type in `src/lib/mock-data.ts`

Find the `PolicyRule` type definition and add `id: string` to it. For mock rules in the `policyRules` array, add `id: "mock-0"`, `id: "mock-1"`, etc. to each rule object.

Run `npx tsc --noEmit` — this will show errors wherever `PolicyRule` objects are created without `id`. Fix each one.

### 2. Include `rule_id` in `getMappedPolicyRules()` in `src/lib/api.ts`

In the `.select()` call, add `rule_id`. In the mapping function, add `id: row.rule_id` to the returned object.

### 3. Add `togglePolicyRule()` to `src/lib/api.ts`

```typescript
export async function togglePolicyRule(ruleId: string, isActive: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase
    .from("policy_rules")
    .update({ is_active: isActive })
    .eq("rule_id", ruleId);
  return !error;
}
```

Run `npx tsc --noEmit` after adding this.

### 4. Add toggle UI in `policy-rules.tsx`

Import `togglePolicyRule` from `@/lib/api`.

In each table row where the rule's status is displayed, replace the static pill with a clickable button:

```tsx
<button
  className="cursor-pointer"
  onClick={async () => {
    const ok = await togglePolicyRule(rule.id, !rule.active);
    if (ok) {
      // Update local state
      setPolicyRules((prev) => {
        const updated = { ...prev };
        updated[tab] = updated[tab].map((r) =>
          r.id === rule.id ? { ...r, active: !r.active } : r
        );
        return updated;
      });
    }
  }}
>
  <Pill tone={rule.active ? "success" : "muted"}>
    {rule.active ? "Active" : "Inactive"}
  </Pill>
</button>
```

Run `npx tsc --noEmit` after this change.

## Files to edit

- `src/lib/mock-data.ts` — add `id` to `PolicyRule` type and mock data
- `src/lib/api.ts` — include `rule_id` in query, add `togglePolicyRule()`
- `src/routes/policy-rules.tsx` — add toggle button

## Done when

- `npx tsc --noEmit` exits clean
- `PolicyRule` type has `id: string`
- `getMappedPolicyRules()` returns `id` for each rule
- `togglePolicyRule()` exists with `isSupabaseConfigured` guard
- Clicking Active/Inactive pill toggles the rule and updates local state
- No `// # reason:` or `// Self-review` comments in any edited file
