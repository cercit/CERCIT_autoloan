# Task 72 — Employer autocomplete in new application form

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Replace the plain text input for employer name in the new application form with an autocomplete/search input that suggests known employers as the user types. Selecting a known employer auto-fills the employer category.

## Current state

- `src/routes/applications/new.tsx` renders the new application form
- `src/routes/employers.tsx` shows the employer management page
- `src/lib/api.ts` has `verifyEmployer` from task 66
- shadcn `Input` and `Command` (combobox) components are available
- No autocomplete for employer exists

## Steps

### 1. Add `searchEmployers` to `src/lib/api.ts`

```typescript
export type EmployerSuggestion = {
  name: string;
  category: "CAT_A" | "CAT_B" | "CAT_C";
};

export async function searchEmployers(
  query: string
): Promise<EmployerSuggestion[]> {
  if (!isSupabaseConfigured) {
    const all: EmployerSuggestion[] = [
      { name: "Infosys", category: "CAT_A" }, { name: "TCS", category: "CAT_A" },
      { name: "Wipro", category: "CAT_A" }, { name: "HCL Technologies", category: "CAT_A" },
      { name: "Reliance Industries", category: "CAT_A" }, { name: "HDFC Bank", category: "CAT_A" },
      { name: "SBI", category: "CAT_A" }, { name: "ICICI Bank", category: "CAT_A" },
      { name: "Tech Mahindra", category: "CAT_B" }, { name: "Mindtree", category: "CAT_B" },
      { name: "L&T", category: "CAT_B" }, { name: "Bajaj Finance", category: "CAT_B" },
      { name: "Axis Bank", category: "CAT_B" }, { name: "Mphasis", category: "CAT_B" },
    ];
    const q = query.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }

  const { data, error } = await supabase
    .from("employers")
    .select("name, category")
    .ilike("name", `%${query}%`)
    .limit(8);

  if (error || !data) return [];
  return data as EmployerSuggestion[];
}
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/employer-autocomplete.tsx`

Build a component that:
- Takes `value: string`, `onChange: (name: string, category: string | undefined) => void` as props
- Uses an `Input` with a dropdown of suggestions
- Fetches suggestions as the user types (debounce 300ms using a `setTimeout` ref)
- Shows employer name and category badge in each suggestion row
- When a suggestion is selected, calls `onChange(name, category)`
- When the user types a name not in the list and blurs, calls `onChange(typed, undefined)` — allows unlisted employers

Run `npx tsc --noEmit`.

### 3. Update `src/routes/applications/new.tsx`

Replace the employer name `Input` with `<EmployerAutocomplete>`. When a known employer is selected, auto-fill an `employerCategory` field in the form state.

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `EmployerSuggestion` type and `searchEmployers` function
- `src/components/employer-autocomplete.tsx` — new file
- `src/routes/applications/new.tsx` — replace employer input with autocomplete

## Done when

- `npx tsc --noEmit` exits clean
- Autocomplete shows suggestions as user types (debounced)
- `searchEmployers` has mock-data fallback with at least 14 known employers
- Selecting a suggestion fills the employer name and category
- User can type a custom employer name not in the list
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/input has a working handler
