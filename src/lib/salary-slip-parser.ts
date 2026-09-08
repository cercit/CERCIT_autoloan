export type SalarySlipData = {
  gross: number;
  basic: number;
  hra: number;
  deductions: number;
  pf: number;
  tax: number;
  netSalary: number;
  employerName: string;
  month: string;
  confidence: "high" | "medium" | "low";
};

function extractIndianNumber(text: string): number {
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match || !match[1]) return 0;
  return parseFloat(match[1]);
}

function findAmount(text: string, keywords: string[]): number {
  const lines = text.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        const amount = extractIndianNumber(line);
        if (amount > 0) return amount;
      }
    }
  }
  return 0;
}

function findEmployerName(text: string): string {
  const lines = text.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("company") ||
      lower.includes("employer") ||
      lower.includes("organisation") ||
      lower.includes("organization")
    ) {
      const parts = line.split(/[:|]/);
      if (parts.length > 1 && parts[1]) {
        const name = parts[1].trim();
        if (name.length > 2) return name;
      }
    }
  }
  return "Unknown";
}

function findMonth(text: string): string {
  const monthPattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i;
  const match = text.match(monthPattern);
  if (match) return match[0];

  const datePattern = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;
  const dateMatch = text.match(datePattern);
  if (dateMatch && dateMatch[1] && dateMatch[3]) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = parseInt(dateMatch[1], 10);
    const year = dateMatch[3];
    if (month >= 1 && month <= 12) {
      return `${monthNames[month - 1]} ${year}`;
    }
  }
  return "Unknown";
}

export function parseSalarySlip(text: string): SalarySlipData {
  const gross = findAmount(text, [
    "gross",
    "total earnings",
    "gross salary",
    "gross pay",
  ]);
  const basic = findAmount(text, ["basic", "basic pay", "basic salary"]);
  const hra = findAmount(text, ["hra", "house rent", "h.r.a"]);
  const deductions = findAmount(text, [
    "total deduction",
    "total deductions",
    "deductions",
  ]);
  const pf = findAmount(text, ["pf", "provident fund", "e.p.f", "epf"]);
  const tax = findAmount(text, ["tax", "income tax", "t.d.s", "tds", "professional tax"]);
  const netSalary = findAmount(text, [
    "net pay",
    "net salary",
    "net amount",
    "take home",
    "amount payable",
  ]);
  const employerName = findEmployerName(text);
  const month = findMonth(text);

  let confidence: "high" | "medium" | "low" = "low";
  if (gross > 0 && netSalary > 0) confidence = "high";
  else if (netSalary > 0) confidence = "medium";

  return {
    gross,
    basic,
    hra,
    deductions,
    pf,
    tax,
    netSalary,
    employerName,
    month,
    confidence,
  };
}