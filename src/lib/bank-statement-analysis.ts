import type { Transaction, BankStatementData } from '@/lib/bank-statement-parser';
import type { TransactionCategory } from '@/lib/transaction-categorizer';
import { categorizeTransaction } from '@/lib/transaction-categorizer';
import type { BankStatementSummary } from '@/lib/mock-data';

export type CategorizedTransaction = Transaction & { category: TransactionCategory };

export type MonthlyBreakdown = {
  month: string;
  credits: number;
  debits: number;
  avgBalance: number;
  salaryCredits: number;
  emiDebits: number;
  bounces: number;
};

export type RedFlag = {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
};

export type AnalysisResult = {
  summary: BankStatementSummary;
  categorizedTransactions: CategorizedTransaction[];
  monthlyBreakdown: MonthlyBreakdown[];
  redFlags: RedFlag[];
};

export function analyzeBankStatement(data: BankStatementData): AnalysisResult {
  const categorizedTransactions: CategorizedTransaction[] = data.transactions.map((t) => ({
    ...t,
    category: categorizeTransaction(t.description, t.debit, t.credit),
  }));

  type MonthEntry = {
    balances: number[];
    minBalance: number;
    credits: number;
    debits: number;
    salaryCredits: number;
    emiDebits: number;
    bounces: number;
  };

  const monthMap = new Map<string, MonthEntry>();

  for (const t of categorizedTransactions) {
    const month = t.date.slice(0, 7);

    if (!monthMap.has(month)) {
      monthMap.set(month, {
        balances: [],
        minBalance: Infinity,
        credits: 0,
        debits: 0,
        salaryCredits: 0,
        emiDebits: 0,
        bounces: 0,
      });
    }

    const entry = monthMap.get(month)!;
    entry.balances.push(t.balance);
    entry.minBalance = Math.min(entry.minBalance, t.balance);
    entry.credits += t.credit;
    entry.debits += t.debit;

    if (t.category === 'salary') entry.salaryCredits += t.credit;
    if (t.category === 'emi') entry.emiDebits += t.debit;
    if (t.category === 'bounce') entry.bounces += 1;
  }

  const sortedMonths = Array.from(monthMap.keys()).sort();
  const monthlyBreakdown: MonthlyBreakdown[] = sortedMonths.map((month) => {
    const entry = monthMap.get(month)!;
    const avgBalance = entry.balances.reduce((s, b) => s + b, 0) / entry.balances.length || 0;
    return {
      month,
      credits: entry.credits,
      debits: entry.debits,
      avgBalance,
      salaryCredits: entry.salaryCredits,
      emiDebits: entry.emiDebits,
      bounces: entry.bounces,
    };
  });

  const months = sortedMonths.length;

  const salaryTxns = categorizedTransactions.filter((t) => t.category === 'salary');
  const salaryCreditCount = salaryTxns.length;
  const salaryCreditTotal = salaryTxns.reduce((s, t) => s + t.credit, 0);
  const avgSalaryAmount = salaryCreditCount > 0 ? salaryCreditTotal / salaryCreditCount : 0;

  const emiTxns = categorizedTransactions.filter((t) => t.category === 'emi');
  const emiDebitCount = emiTxns.length;
  const emiDebitTotal = emiTxns.reduce((s, t) => s + t.debit, 0);

  const cashTxns = categorizedTransactions.filter((t) => t.category === 'cash');
  const cashDeposits = cashTxns.reduce((s, t) => s + t.credit, 0);

  const bounceTxns = categorizedTransactions.filter((t) => t.category === 'bounce');
  const totalBounces = bounceTxns.length;

  const chequeBounceInward = bounceTxns.filter((t) => {
    const desc = t.description.toLowerCase();
    return !(desc.includes('outward') || desc.includes('issued') || desc.includes('drawn'));
  }).length;
  const chequeBounceOutward = totalBounces - chequeBounceInward;

  const minBalanceBreaches = Array.from(monthMap.values()).filter((v) => v.minBalance < 0).length;

  const avgMonthlyBalance = monthlyBreakdown.reduce((s, m) => s + m.avgBalance, 0) / months || 0;

  const redFlags: RedFlag[] = [];

  if (totalBounces > 2) {
    redFlags.push({
      code: 'BOUNCE_MULTIPLE',
      severity: 'HIGH',
      message: `Multiple cheque bounces detected: ${totalBounces}`,
    });
  }

  const monthsWithSalary = monthlyBreakdown.filter((m) => m.salaryCredits > 0).length;
  if (months > 0 && monthsWithSalary / months < 0.8) {
    redFlags.push({
      code: 'SALARY_IRREGULAR',
      severity: 'MEDIUM',
      message: `Salary present in only ${monthsWithSalary} of ${months} months (${Math.round((monthsWithSalary / months) * 100)}%)`,
    });
  }

  if (avgSalaryAmount > 0 && cashDeposits > 3 * avgSalaryAmount) {
    redFlags.push({
      code: 'LARGE_CASH_DEPOSIT',
      severity: 'MEDIUM',
      message: `Cash deposits exceed 3x average salary`,
    });
  }

  if (monthlyBreakdown.length > 1) {
    const half = Math.floor(monthlyBreakdown.length / 2);
    const firstHalfAvg = monthlyBreakdown.slice(0, half).reduce((s, m) => s + m.avgBalance, 0) / (half || 1);
    const secondHalfAvg = monthlyBreakdown.slice(half).reduce((s, m) => s + m.avgBalance, 0) / (monthlyBreakdown.length - half || 1);
    if (secondHalfAvg < firstHalfAvg * 0.8) {
      redFlags.push({
        code: 'DECLINING_BALANCE',
        severity: 'MEDIUM',
        message: 'Average monthly balance shows declining trend over the period',
      });
    }
  }

  const totalDebits = categorizedTransactions.reduce((s, t) => s + t.debit, 0);
  const cashDebits = cashTxns.reduce((s, t) => s + t.debit, 0);
  if (totalDebits > 0 && cashDebits / totalDebits > 0.3) {
    redFlags.push({
      code: 'HIGH_CASH_WITHDRAWAL',
      severity: 'LOW',
      message: `Cash withdrawals account for ${(cashDebits / totalDebits * 100).toFixed(1)}% of total debits`,
    });
  }

  const summary: BankStatementSummary = {
    avgMonthlyBalance,
    salaryCreditCount,
    avgSalaryAmount,
    emiDebitCount,
    emiDebitTotal,
    cashDeposits,
    chequeBounceInward,
    chequeBounceOutward,
    minBalanceBreaches,
    months,
  };

  return { summary, categorizedTransactions, monthlyBreakdown, redFlags };
}
