# Task 40 — Bank statement transactions table

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Create `src/components/bank-statement-transactions.tsx` showing a paginated table of bank transactions. Columns: Date, Description, Debit, Credit, Balance, Category. Add 15-20 rows of mock transaction data to `mock-data.ts`. Include simple prev/next pagination at 10 rows per page.

## Current state

- `src/lib/mock-data.ts` has no transaction data
- `src/components/app-shell.tsx` exports `SectionCard`
- `src/components/status.tsx` exports `Pill`
- `src/lib/format.ts` exports `inr()`
- `src/components/ui/button.tsx` exists for pagination buttons
- `lucide-react` provides `ChevronLeft` and `ChevronRight` icons

## Steps

### 1. Add transaction type and mock data to `src/lib/mock-data.ts`

Add at the end of the file:

```typescript
export type BankTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  category: "Salary" | "EMI" | "Rent" | "ATM" | "Transfer" | "UPI" | "Other";
};

export const mockTransactions: BankTransaction[] = [
  { date: "01 Aug 2026", description: "SAL/AUG/TCS/834210", debit: 0, credit: 85000, balance: 198400, category: "Salary" },
  { date: "02 Aug 2026", description: "EMI/HDFC/HOMELOAN/8834", debit: 22000, credit: 0, balance: 176400, category: "EMI" },
  { date: "03 Aug 2026", description: "UPI/SWIGGY/ORDER", debit: 450, credit: 0, balance: 175950, category: "UPI" },
  { date: "05 Aug 2026", description: "RENT/NEFT/LANDLORD", debit: 18000, credit: 0, balance: 157950, category: "Rent" },
  { date: "05 Aug 2026", description: "EMI/AXIS/CC/MIN", debit: 5000, credit: 0, balance: 152950, category: "EMI" },
  { date: "07 Aug 2026", description: "ATM/CASH/ANB001", debit: 10000, credit: 0, balance: 142950, category: "ATM" },
  { date: "10 Aug 2026", description: "UPI/AMAZON/PURCHASE", debit: 3200, credit: 0, balance: 139750, category: "UPI" },
  { date: "12 Aug 2026", description: "NEFT/FRIEND/TRANSFER", debit: 5000, credit: 0, balance: 134750, category: "Transfer" },
  { date: "14 Aug 2026", description: "UPI/BIGBASKET/GROCER", debit: 2800, credit: 0, balance: 131950, category: "UPI" },
  { date: "15 Aug 2026", description: "UPI/NETFLIX/SUB", debit: 649, credit: 0, balance: 131301, category: "Other" },
  { date: "18 Aug 2026", description: "NEFT/IN/FREELANCE", debit: 0, credit: 12000, balance: 143301, category: "Transfer" },
  { date: "20 Aug 2026", description: "UPI/ZOMATO/ORDER", debit: 580, credit: 0, balance: 142721, category: "UPI" },
  { date: "22 Aug 2026", description: "ATM/CASH/ANB002", debit: 5000, credit: 0, balance: 137721, category: "ATM" },
  { date: "25 Aug 2026", description: "UPI/ELECTRICITY/TNEB", debit: 1800, credit: 0, balance: 135921, category: "Other" },
  { date: "27 Aug 2026", description: "UPI/MOBILE/JIO", debit: 399, credit: 0, balance: 135522, category: "Other" },
  { date: "28 Aug 2026", description: "UPI/PETROL/IOCL", debit: 3500, credit: 0, balance: 132022, category: "Other" },
  { date: "30 Aug 2026", description: "NEFT/IN/BONUS", debit: 0, credit: 15000, balance: 147022, category: "Transfer" },
];
```

Run `npx tsc --noEmit`.

### 2. Create `src/components/bank-statement-transactions.tsx`

```typescript
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import type { BankTransaction } from "@/lib/mock-data";

const PAGE_SIZE = 10;

const categoryTone = {
  Salary: "success",
  EMI: "warning",
  Rent: "muted",
  ATM: "muted",
  Transfer: "info",
  UPI: "primary",
  Other: "muted",
} as const;

export function BankStatementTransactions({ transactions }: { transactions: BankTransaction[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(transactions.length / PAGE_SIZE);
  const pageData = transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <SectionCard
      title="Transactions"
      description={`${transactions.length} entries`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((txn, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{txn.date}</td>
                <td className="px-3 py-2 truncate max-w-[200px]">{txn.description}</td>
                <td className="px-3 py-2 text-right tabular">
                  {txn.debit > 0 ? inr(txn.debit) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular text-success">
                  {txn.credit > 0 ? inr(txn.credit) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular font-medium">{inr(txn.balance)}</td>
                <td className="px-3 py-2">
                  <Pill tone={categoryTone[txn.category]}>{txn.category}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/mock-data.ts` — add `BankTransaction` type and `mockTransactions`
- `src/components/bank-statement-transactions.tsx` — new file

## Done when

- `npx tsc --noEmit` exits clean
- `BankTransaction` type is exported from `mock-data.ts`
- `mockTransactions` has 17 realistic entries with varied categories
- Component renders a table with Date, Description, Debit, Credit, Balance, Category columns
- Debit/credit columns show "—" when zero
- Category shown as a colored `Pill`
- Pagination shows 10 rows per page with Prev/Next buttons
- Prev disabled on first page, Next disabled on last page
- No `// # reason:` or `// Self-review` comments in any edited file
