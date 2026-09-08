import { inr } from "./format";
import type { BankTransaction } from "./mock-data";

export type CashflowSummary = {
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
  avgMonthlyBalance: number;
  minBalance: number;
  maxBalance: number;
  salaryCredits: number[];
  avgSalary: number;
  salaryRegularity: "regular" | "irregular";
  emiDebits: number[];
  totalEmiBurden: number;
  bounceCount: number;
  bounceMonths: string[];
  cashWithdrawalRatio: number;
  monthCount: number;
};

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isSalaryCredit(desc: string, credit: number): boolean {
  if (credit <= 0) return false;
  const lower = desc.toLowerCase();
  return (
    lower.includes("sal") ||
    lower.includes("salary") ||
    lower.includes("payroll") ||
    lower.includes("wage") ||
    lower.includes("stipend")
  );
}

function isEmiDebit(desc: string, debit: number): boolean {
  if (debit <= 0) return false;
  const lower = desc.toLowerCase();
  return (
    lower.includes("emi") ||
    lower.includes("loan") ||
    lower.includes("instal") ||
    lower.includes("installment")
  );
}

function isBounce(desc: string): boolean {
  const lower = desc.toLowerCase();
  return (
    lower.includes("bounce") ||
    lower.includes("return") ||
    lower.includes("unpaid") ||
    lower.includes("dishon") ||
    lower.includes("insufficient")
  );
}

function isCashWithdrawal(desc: string, debit: number): boolean {
  if (debit <= 0) return false;
  const lower = desc.toLowerCase();
  return lower.includes("atm") || lower.includes("cash") || lower.includes("withdrawal");
}

export function analyzeCashflow(transactions: BankTransaction[]): CashflowSummary {
  if (!transactions.length) {
    return {
      totalCredits: 0,
      totalDebits: 0,
      netFlow: 0,
      avgMonthlyBalance: 0,
      minBalance: 0,
      maxBalance: 0,
      salaryCredits: [],
      avgSalary: 0,
      salaryRegularity: "irregular",
      emiDebits: [],
      totalEmiBurden: 0,
      bounceCount: 0,
      bounceMonths: [],
      cashWithdrawalRatio: 0,
      monthCount: 0,
    };
  }

  const months = new Map<string, BankTransaction[]>();
  let totalCredits = 0;
  let totalDebits = 0;
  let minBalance = Infinity;
  let maxBalance = -Infinity;
  let totalCashWithdrawals = 0;

  const salaryCredits: number[] = [];
  const emiDebits: number[] = [];
  const bounceMonthsSet = new Set<string>();

  for (const txn of transactions) {
    const monthKey = getMonthKey(txn.date);
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey)!.push(txn);

    if (txn.credit > 0) totalCredits += txn.credit;
    if (txn.debit > 0) totalDebits += txn.debit;

    if (txn.balance < minBalance) minBalance = txn.balance;
    if (txn.balance > maxBalance) maxBalance = txn.balance;

    if (isSalaryCredit(txn.description, txn.credit)) {
      salaryCredits.push(txn.credit);
    }
    if (isEmiDebit(txn.description, txn.debit)) {
      emiDebits.push(txn.debit);
    }
    if (isBounce(txn.description)) {
      bounceMonthsSet.add(monthKey);
    }
    if (isCashWithdrawal(txn.description, txn.debit)) {
      totalCashWithdrawals += txn.debit;
    }
  }

  const monthCount = months.size;
  const avgMonthlyBalance =
    monthCount > 0
      ? Array.from(months.values()).reduce((sum, txns) => {
          const lastTxn = txns[txns.length - 1];
          return sum + (lastTxn?.balance ?? 0);
        }, 0) / monthCount
      : 0;

  const avgSalary = salaryCredits.length > 0
    ? salaryCredits.reduce((a, b) => a + b, 0) / salaryCredits.length
    : 0;

  const monthsWithSalary = new Set(
    Array.from(months.entries())
      .filter(([_, txns]) => txns.some((t) => isSalaryCredit(t.description, t.credit)))
      .map(([m]) => m)
  ).size;

  const salaryRegularity = monthsWithSalary >= 5 ? "regular" : "irregular";

  const totalEmiBurden = emiDebits.reduce((a, b) => a + b, 0);

  const bounceCount = bounceMonthsSet.size;
  const bounceMonths = Array.from(bounceMonthsSet).sort();

  const cashWithdrawalRatio = totalCredits > 0 ? totalCashWithdrawals / totalCredits : 0;

  return {
    totalCredits,
    totalDebits,
    netFlow: totalCredits - totalDebits,
    avgMonthlyBalance,
    minBalance: minBalance === Infinity ? 0 : minBalance,
    maxBalance: maxBalance === -Infinity ? 0 : maxBalance,
    salaryCredits,
    avgSalary,
    salaryRegularity,
    emiDebits,
    totalEmiBurden,
    bounceCount,
    bounceMonths,
    cashWithdrawalRatio,
    monthCount,
  };
}

export function formatCashflowSummary(summary: CashflowSummary): string {
  const lines = [
    `Cash Flow Analysis (${summary.monthCount} months)`,
    `──────────────────────────────`,
    `Total Credits:     ${inr(summary.totalCredits)}`,
    `Total Debits:      ${inr(summary.totalDebits)}`,
    `Net Flow:          ${inr(summary.netFlow)}`,
    `Avg Monthly Bal:   ${inr(summary.avgMonthlyBalance)}`,
    `Min Balance:       ${inr(summary.minBalance)}`,
    `Max Balance:       ${inr(summary.maxBalance)}`,
    ``,
    `Salary Credits:    ${summary.salaryCredits.length} credits`,
    `Avg Salary:        ${inr(summary.avgSalary)}`,
    `Salary Regularity: ${summary.salaryRegularity}`,
    ``,
    `EMI Debits:        ${summary.emiDebits.length} debits`,
    `Total EMI Burden:  ${inr(summary.totalEmiBurden)}`,
    ``,
    `Bounce Count:      ${summary.bounceCount}`,
    `Bounce Months:     ${summary.bounceMonths.join(", ") || "—"}`,
    ``,
    `Cash Withdrawal Ratio: ${(summary.cashWithdrawalRatio * 100).toFixed(1)}%`,
  ];
  return lines.join("\n");
}