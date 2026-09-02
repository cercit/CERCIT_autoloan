# Task 23 — Rate grid CSV export

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

The rate grid page has an "Export CSV" button that does nothing. Wire it to download a CSV file from the current grid data.

## Current state

File: `src/routes/rate-grid.tsx`

- Line 32: `const [gridData, setGridData] = useState(rateGrid)` — array of `{ band: string, catA: number, catB: number, catC: number }`
- Lines 57-59: The Export CSV button is `<Button variant="outline"><Download className="size-4" /> Export CSV</Button>` — no `onClick` handler

## Steps

### 1. Add export function inside `RateGridPage` component (after the `useEffect`, around line 50)

```typescript
function exportCsv() {
  const header = "CIBIL Band,Category A (%),Category B (%),Category C (%)";
  const rows = gridData.map((r) => `${r.band},${r.catA.toFixed(2)},${r.catB.toFixed(2)},${r.catC.toFixed(2)}`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cercit_rate_grid_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

The function is inside the component so it can access `gridData` directly. No parameters needed.

### 2. Wire the button

Change the Export CSV button to:
```tsx
<Button variant="outline" onClick={exportCsv}>
  <Download className="size-4" /> Export CSV
</Button>
```

That's it. Two changes in one file.

## Files to edit

- `src/routes/rate-grid.tsx` only

## Done when

- `npx tsc --noEmit` exits clean
- The Export CSV button has an `onClick={exportCsv}` handler
- The `exportCsv` function reads from `gridData` state
- No `// # reason:` or `// Self-review` comments in the file
