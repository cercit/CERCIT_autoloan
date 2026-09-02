# Hermes task rules — cercit project

Read these rules before starting any task. They override any habits or defaults you have.

## Build verification (mandatory)

Run `npx tsc --noEmit` after every file you change. If it fails, fix the errors before touching another file. The task is not done until this command exits with zero errors.

Do not skip this step. Do not assume the build passes. Do not declare done without running it.

## No self-review comments

Do NOT add any of these to the source code:
- `// # reason:` comments
- `// Self-review (vibe-check):` comments
- `// vibe-check:` comments
- Top-of-file comments explaining what you changed or why
- Inline comments narrating your compliance with these rules

The only comments allowed are ones that explain a non-obvious "why" in the code itself — a hidden constraint, a workaround for a specific bug, behavior that would surprise a future reader. If removing the comment wouldn't confuse someone, don't write it.

## No temporary files

Do not create scratch files, temp files, or intermediate output files in the project. If you create one during work, delete it before finishing.

## Type strictness

This project has `exactOptionalPropertyTypes: true` in tsconfig.json. This means:

- You cannot assign `undefined` to an optional property. `{ remarks: undefined }` is a type error when `remarks?:` string.
- Omit the property entirely instead: `const obj: T = { requiredField: "x" }` (don't include the optional field at all).
- For function arguments with optional properties: build the object with only the fields that have values. Use conditional assignment:
  ```typescript
  const payload: SomeType = { required: value };
  if (optionalValue) payload.optionalField = optionalValue;
  ```
- For JSX props where the parent's value might be `undefined`: use conditional spread:
  ```tsx
  <Child {...(value != null ? { prop: value } : {})} />
  ```

## Wire both ends

When a task says "add function X to file A and use it in file B," you must do both:
1. Write the function in file A
2. Import it in file B, add any needed state variables (`useState`), add the fetch call (`useEffect` or similar), and render the result in JSX

A function that exists but is never called is not done. A state variable referenced in JSX that was never declared is a build error.

## Respect existing state

Before writing code that references component state variables, check what state variables actually exist in that component. If your code needs `exShowroom` but the component only has `onRoad`, you have two choices: add the missing state variable with its input field, or rewrite your code to work with what exists. Referencing a variable that doesn't exist is a build error.

## Mock-data fallback

Every API function must check `isSupabaseConfigured` first. If false, return mock data or an empty result. Never call `supabase.from()` without this guard. The pattern:

```typescript
export async function getSomething(): Promise<SomeType[]> {
  if (!isSupabaseConfigured) return mockData;
  const { data, error } = await supabase.from("table").select("...");
  if (error || !data) return mockData;
  return data.map(...);
}
```

## Import paths

Use `@/` path aliases (e.g. `@/lib/api`, `@/components/app-shell`). Do not use relative paths like `../../lib/api`.

## Existing libraries in the project

Already installed and available — use these, do not install alternatives:
- `sonner` — toast notifications (component at `src/components/ui/sonner.tsx`)
- `recharts` — charts
- `lucide-react` — icons
- `@tanstack/react-router` — routing (use `createFileRoute`, `Link`, `useNavigate`)
- `@tanstack/react-query` — data fetching wrapper
- `zod` — schema validation
- `@supabase/supabase-js` — database client
- shadcn/ui components in `src/components/ui/` — Button, Input, Select, Dialog, Tabs, Checkbox, Label, Textarea, Skeleton, etc.
- `src/components/app-shell.tsx` exports `AppShell`, `SectionCard`, `LabelValue`
- `src/components/status.tsx` exports `Pill`, `StatusPill`, `CategoryBadge`, `ScoreText`
- `src/lib/format.ts` exports `inr()` (currency formatter), `emiFor()` (EMI calculator)
- `src/lib/utils.ts` exports `cn()` (class name merger)
