# Task 21 — Application queue column sort

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add clickable column headers to the application queue table so users can sort by Name, CIBIL, Loan Amount, Status, or Submitted date.

## Current state

File: `src/routes/applications/index.tsx`

Existing state variables (around line 50-55): `allApps`, `loading`, `query`, `status`. A `filteredRows` useMemo filters by query + status. The `<tbody>` maps over `filteredRows`. Column headers are plain `<th>` with no click handlers.

## Steps

### 1. Add sort state (near existing state, around line 54)

```typescript
const [sortKey, setSortKey] = useState<"name" | "cibil" | "loanAmount" | "status" | "submitted" | null>(null);
const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
```

### 2. Add `sortedRows` useMemo after `filteredRows`

```typescript
const sortedRows = useMemo(() => {
  if (!sortKey) return filteredRows;
  return [...filteredRows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "cibil") cmp = a.cibil - b.cibil;
    else if (sortKey === "loanAmount") cmp = a.loanAmount - b.loanAmount;
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    else if (sortKey === "submitted") cmp = a.submitted.localeCompare(b.submitted);
    return sortDir === "asc" ? cmp : -cmp;
  });
}, [filteredRows, sortKey, sortDir]);
```

### 3. Add toggle function

```typescript
function toggleSort(key: typeof sortKey) {
  if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  else { setSortKey(key); setSortDir("asc"); }
}
```

### 4. Make column headers clickable

Import `ArrowUpDown` from lucide-react. For each sortable column, wrap the header text in a button:

```tsx
<th className="...existing classes...">
  <button className="flex items-center gap-1" onClick={() => toggleSort("name")}>
    Applicant <ArrowUpDown className="size-3 text-muted-foreground" />
  </button>
</th>
```

Do this for: Applicant ("name"), CIBIL ("cibil"), Loan Amount ("loanAmount"), Status ("status"), Submitted ("submitted").

### 5. Render `sortedRows` instead of `filteredRows`

In the `<tbody>`, change `filteredRows.map(...)` to `sortedRows.map(...)`.

## Files to edit

- `src/routes/applications/index.tsx` only

## Done when

- `npx tsc --noEmit` exits clean
- Five column headers are clickable buttons with sort icons
- `<tbody>` maps over `sortedRows`
- No `// # reason:` or `// Self-review` comments in the file
