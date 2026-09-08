export interface Transaction {
  date: string; // ISO 8601 format: YYYY-MM-DD
  description: string;
  debit: number;
  credit: number;
  balance: number;
  raw: string;
}

export interface BankStatementData {
  accountNumber: string;
  holderName: string;
  bankName: string;
  period: { start: string; end: string }; // ISO dates
  transactions: Transaction[];
  openingBalance: number;
  closingBalance: number;
}

/**
 * Parses Indian date formats: DD/MM/YYYY, DD-Mon-YYYY, DD-Mon-YY
 * Returns ISO date string (YYYY-MM-DD) or null if invalid
 */
export function parseIndianDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  let match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const day = match[1]!;
    const month = match[2]!;
    const year = match[3]!;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD-Mon-YYYY (e.g., 15-Jan-2024)
  match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const day = match[1]!;
    const monthStr = match[2]!;
    const year = match[3]!;
    const month = monthStrToNumber(monthStr);
    if (month) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // DD-Mon-YY (e.g., 15-Jan-24)
  match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (match) {
    const day = match[1]!;
    const monthStr = match[2]!;
    const year = match[3]!;
    const month = monthStrToNumber(monthStr);
    if (month) {
      const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
      return `${fullYear}-${month.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  return null;
}

function monthStrToNumber(monthStr: string): number | null {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return months[monthStr.toLowerCase()] ?? null;
}

/**
 * Parses Indian amount format: handles commas, optional Dr/Cr suffix
 * Returns { value: number, isCredit: boolean }
 */
export function parseIndianAmount(amountStr: string): { value: number; isCredit: boolean } {
  const trimmed = amountStr.trim().toUpperCase();
  let isCredit = false;

  // Check for Dr/Cr suffix
  if (trimmed.endsWith('CR') || trimmed.endsWith('C')) {
    isCredit = true;
  } else if (trimmed.endsWith('DR') || trimmed.endsWith('D')) {
    isCredit = false;
  }

  // Remove Dr/Cr suffix and any currency symbols
  const cleaned = trimmed
    .replace(/CR$/, '')
    .replace(/C$/, '')
    .replace(/DR$/, '')
    .replace(/D$/, '')
    .replace(/[₹,\s]/g, '');

  const value = parseFloat(cleaned) || 0;
  return { value, isCredit };
}

/**
 * Detects bank name from statement text
 */
export function detectBank(text: string): string {
  const upperText = text.toUpperCase();

  const bankKeywords: Record<string, string[]> = {
    'State Bank of India': ['STATE BANK OF INDIA', 'SBI'],
    'HDFC Bank': ['HDFC BANK', 'HDFC'],
    'ICICI Bank': ['ICICI BANK', 'ICICI'],
    'Axis Bank': ['AXIS BANK', 'AXIS'],
    'Kotak Mahindra Bank': ['KOTAK MAHINDRA BANK', 'KOTAK BANK', 'KOTAK'],
    'Punjab National Bank': ['PUNJAB NATIONAL BANK', 'PNB'],
    'Bank of Baroda': ['BANK OF BARODA', 'BOB'],
    'Canara Bank': ['CANARA BANK'],
    'Union Bank of India': ['UNION BANK OF INDIA', 'UNION BANK'],
    'Indian Bank': ['INDIAN BANK'],
    'Bank of India': ['BANK OF INDIA'],
    'IDFC First Bank': ['IDFC FIRST BANK', 'IDFC'],
    'IndusInd Bank': ['INDUSIND BANK', 'INDUSIND'],
    'Yes Bank': ['YES BANK'],
    'Federal Bank': ['FEDERAL BANK'],
    'RBL Bank': ['RBL BANK'],
    'South Indian Bank': ['SOUTH INDIAN BANK'],
    'Karur Vysya Bank': ['KARUR VYSYA BANK', 'KVB'],
    'City Union Bank': ['CITY UNION BANK'],
    'Dhanlaxmi Bank': ['DHANLAXMI BANK'],
    'Tamilnad Mercantile Bank': ['TAMILNAD MERCANTILE BANK', 'TMB'],
    'Jammu & Kashmir Bank': ['JAMMU & KASHMIR BANK', 'J&K BANK'],
    'Karntaka Bank': ['KARNATAKA BANK'],
    'Lakshmi Vilas Bank': ['LAKSHMI VILAS BANK', 'LVB'],
  };

  for (const [bank, keywords] of Object.entries(bankKeywords)) {
    if (keywords.some((kw) => upperText.includes(kw))) {
      return bank;
    }
  }

  return 'Unknown Bank';
}

/**
 * Extracts account number from text
 */
export function extractAccountNumber(text: string): string {
  // Common patterns: A/C No, Account No, Acc No, Account Number
  const patterns = [
    /A\/?C\.?\s*(?:NO|NUMBER)?\.?\s*:?\s*(\d{9,18})/i,
    /ACCOUNT\s*(?:NO|NUMBER)\.?\s*:?\s*(\d{9,18})/i,
    /ACC\s*(?:NO|NUMBER)\.?\s*:?\s*(\d{9,18})/i,
    /\b(\d{11,16})\b/, // Fallback: long number
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return '';
}

/**
 * Extracts account holder name from text
 */
export function extractHolderName(text: string): string {
  const patterns = [
    /NAME\s*:?\s*([A-Z\s.]+)/i,
    /ACCOUNT\s*HOLDER\s*:?\s*([A-Z\s.]+)/i,
    /CUSTOMER\s*NAME\s*:?\s*([A-Z\s.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/\s+/g, ' ');
    }
  }

  return '';
}

/**
 * Extracts statement period from text
 */
export function extractPeriod(text: string): { start: string; end: string } {
  const startPatterns = [
    /FROM\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /PERIOD\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /STATEMENT\s*(?:FROM|PERIOD)\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ];

  const endPatterns = [
    /TO\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /TO\s+DATE\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /STATEMENT\s*TO\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ];

  let start = '';
  let end = '';

  for (const pattern of startPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseIndianDate(match[1]);
      if (parsed) {
        start = parsed;
        break;
      }
    }
  }

  for (const pattern of endPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseIndianDate(match[1]);
      if (parsed) {
        end = parsed;
        break;
      }
    }
  }

  return { start, end };
}

/**
 * Extracts opening/closing balance from text
 */
export function extractBalances(text: string): { opening: number; closing: number } {
  let opening = 0;
  let closing = 0;

  const openingPatterns = [
    /OPENING\s*BALANCE\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
    /BALANCE\s*B\/F\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
    /PREVIOUS\s*BALANCE\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
  ];

  const closingPatterns = [
    /CLOSING\s*BALANCE\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
    /BALANCE\s*C\/F\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
    /CURRENT\s*BALANCE\s*:?\s*([₹\d,]+(?:\.\d{2})?)\s*(?:DR|CR)?/i,
  ];

  for (const pattern of openingPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const { value, isCredit } = parseIndianAmount(match[1]);
      opening = isCredit ? value : -value;
      break;
    }
  }

  for (const pattern of closingPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const { value, isCredit } = parseIndianAmount(match[1]);
      closing = isCredit ? value : -value;
      break;
    }
  }

  return { opening, closing };
}

/**
 * Parses a single transaction line
 * Handles formats like:
 * - DD/MM/YYYY Description 1,000.00 DR 10,000.00 CR
 * - DD-Mon-YYYY Description 1,000.00 10,000.00
 * - Date Description Debit Credit Balance
 */
function parseTransactionLine(line: string): Transaction | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Date pattern at start of line
  const dateMatch = trimmed.match(/^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}-[A-Za-z]{3}-\d{2,4})/);
  if (!dateMatch) return null;

  const dateStr = dateMatch[1]!;
  const isoDate = parseIndianDate(dateStr);
  if (!isoDate) return null;

  // Remove date from line for further parsing
  const afterDate = trimmed.slice(dateMatch[0].length).trim();

  // Split by multiple spaces (common in bank statements)
  const parts = afterDate.split(/\s{2,}/).filter((p) => p.length > 0);

  if (parts.length < 2) return null;

  let description = '';
  let debit = 0;
  let credit = 0;
  let balance = 0;

  // Try to identify amounts from the end
  // Common formats:
  // 1. Desc Debit Credit Balance
  // 2. Desc Debit Balance (credit implied 0)
  // 3. Desc Credit Balance (debit implied 0)
  // 4. Desc Amount Dr/Cr Balance

  const amounts: { value: number; isCredit: boolean; raw: string }[] = [];

  for (const part of parts) {
    const parsed = parseIndianAmount(part);
    if (parsed.value > 0 || part.includes('DR') || part.includes('CR')) {
      amounts.push({ ...parsed, raw: part });
    } else if (!description) {
      description = part;
    } else {
      description += ' ' + part;
    }
  }

  // If we couldn't parse amounts from parts, try extracting from end of line
  if (amounts.length === 0) {
    const amountPattern = /([₹\d,]+\.?\d*)\s*(DR|CR)?/g;
    let match;
    while ((match = amountPattern.exec(afterDate)) !== null) {
      const { value, isCredit } = parseIndianAmount(match[0]);
      amounts.push({ value, isCredit, raw: match[0] });
    }
    // Description is everything before the first amount
    const firstAmountIndex = afterDate.search(/[₹\d]/);
    if (firstAmountIndex > 0) {
      description = afterDate.slice(0, firstAmountIndex).trim();
    }
  }

  // Assign amounts based on count and Dr/Cr
  if (amounts.length === 1) {
    // Only one amount - could be debit or credit, balance unknown
    if (amounts[0]!.isCredit) {
      credit = amounts[0]!.value;
    } else {
      debit = amounts[0]!.value;
    }
  } else if (amounts.length === 2) {
    // Two amounts - typically debit/credit and balance
    // Or debit and credit
    const a0 = amounts[0]!;
    const a1 = amounts[1]!;
    if (a0.isCredit && !a1.isCredit) {
      credit = a0.value;
      debit = a1.value;
    } else if (!a0.isCredit && a1.isCredit) {
      debit = a0.value;
      credit = a1.value;
    } else {
      // Both same type or unclear - assume first is transaction, second is balance
      if (a0.isCredit) credit = a0.value;
      else debit = a0.value;
      balance = a1.value;
    }
  } else if (amounts.length >= 3) {
    // Three or more - typically debit, credit, balance
    const a0 = amounts[0]!;
    const a1 = amounts[1]!;
    debit = a0.isCredit ? 0 : a0.value;
    credit = a0.isCredit ? a0.value : (a1.isCredit ? a1.value : 0);
    balance = amounts[amounts.length - 1]!.value;
  }

  return {
    date: isoDate,
    description: description || 'Unknown',
    debit,
    credit,
    balance,
    raw: trimmed,
  };
}

/**
 * Main parser function - parses bank statement text into structured data
 */
export function parseBankStatement(text: string): BankStatementData {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const bankName = detectBank(text);
  const accountNumber = extractAccountNumber(text);
  const holderName = extractHolderName(text);
  const period = extractPeriod(text);
  const { opening, closing } = extractBalances(text);

  const transactions: Transaction[] = [];

  for (const line of lines) {
    const txn = parseTransactionLine(line);
    if (txn) {
      transactions.push(txn);
    }
  }

  // Sort transactions by date
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // If opening balance not found, try to infer from first transaction
  let openingBalance = opening;
  if (openingBalance === 0 && transactions.length > 0) {
    const firstTxn = transactions[0]!;
    openingBalance = firstTxn.balance - firstTxn.credit + firstTxn.debit;
  }

  // If closing balance not found, use last transaction balance
  let closingBalance = closing;
  if (closingBalance === 0 && transactions.length > 0) {
    closingBalance = transactions[transactions.length - 1]!.balance;
  }

  return {
    accountNumber,
    holderName,
    bankName,
    period,
    transactions,
    openingBalance,
    closingBalance,
  };
}