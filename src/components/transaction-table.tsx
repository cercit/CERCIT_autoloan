"use client";

import { useState, useEffect } from "react";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

interface Transaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  category: string;
}

interface TransactionTableProps {
  transactions: Transaction[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Salary: "bg-green-100 text-green-800",
  Food: "bg-orange-100 text-orange-800",
  Transport: "bg-blue-100 text-blue-800",
  Shopping: "bg-purple-100 text-purple-800",
  Utilities: "bg-yellow-100 text-yellow-800",
  Entertainment: "bg-pink-100 text-pink-800",
  Healthcare: "bg-red-100 text-red-800",
  Education: "bg-indigo-100 text-indigo-800",
  Transfer: "bg-gray-100 text-gray-800",
  Other: "bg-slate-100 text-slate-800",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(/ /g, " ");
}

export function TransactionTable({ transactions }: TransactionTableProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [selectedCategories.length]);

  const allCategories = Array.from(
    new Set(transactions.map((t) => t.category))
  ).sort();

  const filteredTransactions = transactions.filter((t) =>
    selectedCategories.length === 0 || selectedCategories.includes(t.category)
  );

  const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  const pageData = filteredTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const categoryCounts = allCategories.reduce(
    (acc, cat) => {
      acc[cat] = transactions.filter((t) => t.category === cat).length;
      return acc;
    },
    {} as Record<string, number>
  );

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const isCategoryActive = (category: string) => selectedCategories.includes(category);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategories([])}
          className={cn(
            "px-3 py-1 text-sm rounded-full border transition-colors",
            selectedCategories.length === 0
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-accent"
          )}
        >
          All ({transactions.length})
        </button>
        {allCategories.map((category) => (
          <button
            key={category}
            onClick={() => toggleCategory(category)}
            className={cn(
              "px-3 py-1 text-sm rounded-full border transition-colors",
              isCategoryActive(category)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-accent"
            )}
          >
            {category} ({categoryCounts[category]})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 font-medium text-foreground">Date</th>
              <th className="text-left p-3 font-medium text-foreground">Description</th>
              <th className="text-right p-3 font-medium text-foreground">Debit</th>
              <th className="text-right p-3 font-medium text-foreground">Credit</th>
              <th className="text-right p-3 font-medium text-foreground">Balance</th>
              <th className="text-left p-3 font-medium text-foreground">Category</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((txn, index) => (
              <tr
                key={`${txn.date}-${txn.description}-${index}`}
                className="border-b border-border/50 hover:bg-accent/50"
              >
                <td className="p-3 text-foreground">{formatDate(txn.date)}</td>
                <td className="p-3 text-foreground">{txn.description}</td>
                <td className="p-3 text-right text-red-600 font-medium">
                  {txn.debit > 0 ? inr(txn.debit) : "—"}
                </td>
                <td className="p-3 text-right text-green-600 font-medium">
                  {txn.credit > 0 ? inr(txn.credit) : "—"}
                </td>
                <td className="p-3 text-right text-foreground font-mono">
                  {inr(txn.balance)}
                </td>
                <td className="p-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      CATEGORY_COLORS[txn.category] ||
                        "bg-slate-100 text-slate-800"
                    )}
                  >
                    {txn.category}
                  </span>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm pt-3 border-t border-border">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}
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
    </div>
  );
}