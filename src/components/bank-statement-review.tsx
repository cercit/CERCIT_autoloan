import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CategorizedTransaction, MonthlyBreakdown, RedFlag } from '@/lib/bank-statement-analysis';
import type { TransactionCategory } from '@/lib/transaction-categorizer';

interface BankStatementReviewProps {
  transactions: CategorizedTransaction[];
  monthlyBreakdown: MonthlyBreakdown[];
  redFlags: RedFlag[];
  className?: string;
}

const fmt = (n: number): string =>
  n > 0 ? 'Rs ' + n.toLocaleString('en-IN') : '—';

const badgeColors: Record<TransactionCategory, string> = {
  salary: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  emi: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  bounce: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  upi: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  card: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  cash: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  transfer: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  interest: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  other: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
};

const severityColors: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
  MEDIUM: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100',
  LOW: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100',
};

const CATEGORIES: TransactionCategory[] = [
  'salary', 'emi', 'upi', 'card', 'cash', 'transfer', 'bounce', 'interest', 'other',
];

export function BankStatementReview({
  transactions,
  monthlyBreakdown,
  redFlags,
  className,
}: BankStatementReviewProps) {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<TransactionCategory | 'All'>('All');

  const filtered = filter === 'All'
    ? transactions
    : transactions.filter((t) => t.category === filter);

  const displayed = showAll ? filtered : filtered.slice(0, 50);

  return (
    <div className={cn('space-y-8', className)}>
      {redFlags.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">Red flags</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {redFlags.map((flag) => (
              <div
                key={flag.code}
                className={cn('rounded-lg border p-3', severityColors[flag.severity])}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold">{flag.code}</span>
                  <span className="text-xs font-bold uppercase tracking-wide">{flag.severity}</span>
                </div>
                <p className="text-sm">{flag.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-lg font-semibold">Monthly breakdown</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Debits</th>
                <th className="px-4 py-3">Avg balance</th>
                <th className="px-4 py-3">Salary</th>
                <th className="px-4 py-3">EMI</th>
                <th className="px-4 py-3">Bounces</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthlyBreakdown.map((row) => (
                <tr key={row.month} className="hover:bg-muted/50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{row.month}</td>
                  <td className="px-4 py-3">{fmt(row.credits)}</td>
                  <td className="px-4 py-3">{fmt(row.debits)}</td>
                  <td className="px-4 py-3">{fmt(row.avgBalance)}</td>
                  <td className="px-4 py-3">{fmt(row.salaryCredits)}</td>
                  <td className="px-4 py-3">{fmt(row.emiDebits)}</td>
                  <td className={cn('px-4 py-3 font-semibold', row.bounces > 0 && 'text-red-500')}>
                    {row.bounces > 0 ? row.bounces : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold">Transactions</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="bs-cat-filter" className="text-sm text-muted-foreground">Filter:</label>
            <select
              id="bs-cat-filter"
              value={filter}
              onChange={(e) => { setFilter(e.target.value as TransactionCategory | 'All'); setShowAll(false); }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="All">All</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayed.map((t, idx) => (
                <tr key={`${t.date}-${idx}`} className="hover:bg-muted/50">
                  <td className="whitespace-nowrap px-4 py-3">{t.date}</td>
                  <td className="max-w-xs truncate px-4 py-3">{t.description}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', badgeColors[t.category])}>
                      {t.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-500">{fmt(t.debit)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-500">{fmt(t.credit)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 50 && (
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {showAll ? 'Show less' : `Show all (${filtered.length})`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
