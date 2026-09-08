export type TransactionCategory =
  | 'salary'
  | 'emi'
  | 'upi'
  | 'card'
  | 'cash'
  | 'transfer'
  | 'bounce'
  | 'interest'
  | 'other';

export interface Transaction {
  description: string;
  debit: number;
  credit: number;
}

export interface CategorizedTransaction extends Transaction {
  category: TransactionCategory;
}

const BOUNCE_KEYWORDS = ['bounce', 'returned', 'unpaid', 'dishonor', 'rejected'];
const SALARY_KEYWORDS = ['salary', 'payroll', 'wages', 'stipend', 'pension'];
const EMI_KEYWORDS = ['emi', 'loan', 'installment', 'repayment'];
const UPI_KEYWORDS = ['upi', 'bhim', 'phonepe', 'gpay', 'paytm', 'google pay', 'phone pe'];
const CARD_KEYWORDS = ['card', 'visa', 'mastercard', 'rupay', 'debit card', 'credit card', 'pos', 'swipe'];
const CASH_KEYWORDS = ['cash', 'atm', 'withdrawal', 'deposit'];
const TRANSFER_KEYWORDS = ['transfer', 'neft', 'rtgs', 'imps', 'wire', 'fund transfer'];
const INTEREST_KEYWORDS = ['interest', 'int.', 'intrst'];

function matchesKeywords(description: string, keywords: string[]): boolean {
  const lower = description.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function categorizeByKeywords(description: string, debit: number, credit: number): TransactionCategory {
  if (matchesKeywords(description, BOUNCE_KEYWORDS)) return 'bounce';
  if (credit > 0 && matchesKeywords(description, SALARY_KEYWORDS)) return 'salary';
  if (debit > 0 && matchesKeywords(description, EMI_KEYWORDS)) return 'emi';
  if (matchesKeywords(description, UPI_KEYWORDS)) return 'upi';
  if (matchesKeywords(description, CARD_KEYWORDS)) return 'card';
  if (matchesKeywords(description, CASH_KEYWORDS)) return 'cash';
  if (matchesKeywords(description, TRANSFER_KEYWORDS)) return 'transfer';
  if (matchesKeywords(description, INTEREST_KEYWORDS)) return 'interest';
  return 'other';
}

export function categorizeTransaction(description: string, debit: number, credit: number): TransactionCategory {
  return categorizeByKeywords(description, debit, credit);
}

export function categorizeAll(transactions: Transaction[]): CategorizedTransaction[] {
  return transactions.map((txn) => ({
    ...txn,
    category: categorizeTransaction(txn.description, txn.debit, txn.credit),
  }));
}