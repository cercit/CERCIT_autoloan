# Task 41 — Add banking tab to application detail

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a "Banking" tab (Tab 5) to the application detail page tabs. Render `BankStatementSummary` at top and `BankStatementTransactions` below. Add `getBankingAnalysis(applicationId)` to api.ts with mock fallback.

## Current state

- `src/routes/applications/$id/index.tsx` has a `<Tabs>` layout with four tabs: Overview, Documents, Extracted Data, Bureau (from tasks 35 + 37)
- `src/components/bank-statement-summary.tsx` exports `BankStatementSummary` (from task 39) — takes `{ data: BankStatementSummary }` prop
- `src/components/bank-statement-transactions.tsx` exports `BankStatementTransactions` (from task 40) — takes `{ transactions: BankTransaction[] }` prop
- `src/lib/mock-data.ts` exports `BankStatementSummary` type, `mockBankStatementSummary`, `BankTransaction` type, `mockTransactions`
- `src/lib/api.ts` has no banking analysis function yet

## Steps

### 1. Add `getBankingAnalysis` to `src/lib/api.ts`

Import mock data:

```typescript
import {
  // ... existing imports ...
  mockBankStatementSummary,
  mockTransactions,
} from "./mock-data";
import type {
  Application,
  PolicyRule,
  BureauReport,
  BankStatementSummary,
  BankTransaction,
} from "./mock-data";
```

Add the function:

```typescript
export async function getBankingAnalysis(applicationId: string): Promise<{
  summary: BankStatementSummary;
  transactions: BankTransaction[];
}> {
  if (!isSupabaseConfigured) {
    return { summary: mockBankStatementSummary, transactions: mockTransactions };
  }

  const [summaryRes, txnRes] = await Promise.all([
    supabase
      .from("bank_statement_analysis")
      .select("*")
      .eq("application_id", applicationId)
      .single(),
    supabase
      .from("bank_transactions")
      .select("*")
      .eq("application_id", applicationId)
      .order("transaction_date", { ascending: true }),
  ]);

  const summary: BankStatementSummary = summaryRes.data
    ? {
        avgMonthlyBalance: Number(summaryRes.data.avg_monthly_balance) || 0,
        salaryCreditCount: Number(summaryRes.data.salary_credit_count) || 0,
        avgSalaryAmount: Number(summaryRes.data.avg_salary_amount) || 0,
        emiDebitCount: Number(summaryRes.data.emi_debit_count) || 0,
        emiDebitTotal: Number(summaryRes.data.emi_debit_total) || 0,
        cashDeposits: Number(summaryRes.data.cash_deposits) || 0,
        chequeBounceInward: Number(summaryRes.data.cheque_bounce_inward) || 0,
        chequeBounceOutward: Number(summaryRes.data.cheque_bounce_outward) || 0,
        minBalanceBreaches: Number(summaryRes.data.min_balance_breaches) || 0,
        months: Number(summaryRes.data.months) || 6,
      }
    : mockBankStatementSummary;

  const transactions: BankTransaction[] = txnRes.data
    ? (txnRes.data as any[]).map((t) => ({
        date: formatDate(t.transaction_date ?? ""),
        description: t.description ?? "",
        debit: Number(t.debit) || 0,
        credit: Number(t.credit) || 0,
        balance: Number(t.balance) || 0,
        category: t.category ?? "Other",
      }))
    : mockTransactions;

  return { summary, transactions };
}
```

Note: `formatDate` already exists in api.ts (line ~122).

Run `npx tsc --noEmit`.

### 2. Add Banking tab to `src/routes/applications/$id/index.tsx`

Import components and API:

```typescript
import { BankStatementSummary } from "@/components/bank-statement-summary";
import { BankStatementTransactions } from "@/components/bank-statement-transactions";
import { getBankingAnalysis } from "@/lib/api";
import type {
  BankStatementSummary as BankSummaryType,
  BankTransaction,
} from "@/lib/mock-data";
```

Add state:

```typescript
const [bankingSummary, setBankingSummary] = useState<BankSummaryType | null>(null);
const [bankingTxns, setBankingTxns] = useState<BankTransaction[]>([]);
```

Add fetch in a `useEffect`:

```typescript
useEffect(() => {
  getBankingAnalysis(id).then((result) => {
    setBankingSummary(result.summary);
    setBankingTxns(result.transactions);
  });
}, [id]);
```

Add the tab trigger and content:

```tsx
<TabsTrigger value="banking">Banking</TabsTrigger>
```

```tsx
<TabsContent value="banking" className="space-y-4">
  {bankingSummary ? (
    <BankStatementSummary data={bankingSummary} />
  ) : (
    <Skeleton className="h-48 w-full" />
  )}
  <BankStatementTransactions transactions={bankingTxns} />
</TabsContent>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `getBankingAnalysis`, update imports
- `src/routes/applications/$id/index.tsx` — import components, add state/fetch, add Banking tab

## Done when

- `npx tsc --noEmit` exits clean
- `getBankingAnalysis` returns mock data when Supabase is not configured
- `getBankingAnalysis` queries `bank_statement_analysis` and `bank_transactions` tables when Supabase is configured
- Application detail page has five tabs: Overview, Documents, Extracted Data, Bureau, Banking
- Banking tab renders `BankStatementSummary` at top and `BankStatementTransactions` below
- Loading state shows `Skeleton` while data is being fetched
- No `// # reason:` or `// Self-review` comments in any edited file
