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
