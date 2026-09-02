# Task 71 — Cascading location dropdowns in new application form

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Replace the free-text city/state inputs in the new application form with cascading `Select` dropdowns: State -> City -> Branch. Selecting a state filters the city options; selecting a city filters the branch options.

## Current state

- `src/routes/applications/new.tsx` renders the new application form
- The form likely has text `Input` fields for location-related data
- `src/lib/api.ts` has the standard `isSupabaseConfigured` pattern
- shadcn `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` are available in `src/components/ui/select.tsx`

## Steps

### 1. Add `getLocationHierarchy` to `src/lib/api.ts`

```typescript
export type LocationNode = {
  state: string;
  cities: { city: string; branches: string[] }[];
};

export async function getLocationHierarchy(): Promise<LocationNode[]> {
  if (!isSupabaseConfigured) {
    return [
      { state: "Tamil Nadu", cities: [
        { city: "Chennai", branches: ["Anna Nagar", "T. Nagar", "Adyar"] },
        { city: "Coimbatore", branches: ["RS Puram", "Gandhipuram"] },
      ]},
      { state: "Karnataka", cities: [
        { city: "Bengaluru", branches: ["Koramangala", "Whitefield", "Jayanagar"] },
        { city: "Mysuru", branches: ["Saraswathipuram"] },
      ]},
      { state: "Maharashtra", cities: [
        { city: "Mumbai", branches: ["Andheri", "Bandra", "Powai"] },
        { city: "Pune", branches: ["Kothrud", "Hinjewadi"] },
      ]},
      { state: "Delhi", cities: [
        { city: "New Delhi", branches: ["Connaught Place", "Nehru Place", "Karol Bagh"] },
      ]},
    ];
  }

  const { data, error } = await supabase
    .from("branches")
    .select("state, city, branch_name")
    .order("state")
    .order("city")
    .order("branch_name");

  if (error || !data) return [];

  const map = new Map<string, Map<string, string[]>>();
  for (const row of data as any[]) {
    if (!map.has(row.state)) map.set(row.state, new Map());
    const cityMap = map.get(row.state)!;
    if (!cityMap.has(row.city)) cityMap.set(row.city, []);
    cityMap.get(row.city)!.push(row.branch_name);
  }

  return Array.from(map.entries()).map(([state, cityMap]) => ({
    state,
    cities: Array.from(cityMap.entries()).map(([city, branches]) => ({ city, branches })),
  }));
}
```

Run `npx tsc --noEmit`.

### 2. Update `src/routes/applications/new.tsx`

- Import `getLocationHierarchy` and `LocationNode`
- Fetch the hierarchy in a `useEffect` on mount, store in state
- Add three `Select` components: State, City, Branch
- When State changes, reset City and Branch. When City changes, reset Branch.
- Filter the options for each subsequent dropdown based on the selection above it
- Wire the selected values into the form submission payload

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `LocationNode` type and `getLocationHierarchy` function
- `src/routes/applications/new.tsx` — replace location inputs with cascading selects

## Done when

- `npx tsc --noEmit` exits clean
- Three cascading Select dropdowns render: State, City, Branch
- City options filter based on selected state
- Branch options filter based on selected city
- Changing state resets city and branch selections
- `getLocationHierarchy` has mock-data fallback with at least 4 states
- Selected values are included in the form submission
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/select has a working handler
