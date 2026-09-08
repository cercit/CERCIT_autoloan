---
type: edit
target: src/components/transaction-table.tsx
---

## Instructions

Add pagination to the existing transaction-table.tsx component. The component already has category filter chips — keep those. Add pagination below the table.

Changes to make:

1. Add a `PAGE_SIZE` constant set to 15 at the top of the file.

2. Add a `page` state: `const [page, setPage] = useState(0);`

3. After filtering by category, slice for the current page:
```typescript
const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
const pageData = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
```

4. Reset page to 0 when category filter changes. Add a useEffect:
```typescript
useEffect(() => { setPage(0); }, [selectedCategories.length]);
```

5. Use `pageData` instead of `filteredTransactions` in the table tbody map.

6. Add pagination controls after the closing `</div>` of the overflow-x-auto wrapper, before the outer closing `</div>`:
```tsx
{totalPages > 1 && (
  <div className="flex items-center justify-between text-sm pt-3 border-t border-border">
    <span className="text-muted-foreground">
      Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}
    </span>
    <div className="flex gap-2">
      <button
        disabled={page === 0}
        onClick={() => setPage(p => p - 1)}
        className="px-3 py-1 text-sm rounded border border-border disabled:opacity-40 hover:bg-accent"
      >
        Prev
      </button>
      <button
        disabled={page >= totalPages - 1}
        onClick={() => setPage(p => p + 1)}
        className="px-3 py-1 text-sm rounded border border-border disabled:opacity-40 hover:bg-accent"
      >
        Next
      </button>
    </div>
  </div>
)}
```

7. Add `useEffect` to the import from "react" if not already there.

Keep all existing code intact. Only add the pagination. The file must compile with `npx tsc --noEmit`.
