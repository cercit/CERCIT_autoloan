export const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDateIN(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid date";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTimeIN(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid date";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES_SHORT[d.getMonth()]}`;
}

export function formatMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid";
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return formatDateIN(date);
}

export function parseMMYY(value: string): { month: number; year: number; label: string } | null {
  const clean = value.replace(/\s/g, "");
  const match4 = clean.match(/^([01]\d)[/]?([0-9]{4})$/);
  if (match4) {
    const m = parseInt(match4[1], 10);
    const y = parseInt(match4[2], 10);
    if (m >= 1 && m <= 12) return { month: m, year: y, label: `${MONTH_NAMES_SHORT[m - 1]}-${y.toString().slice(-2)}` };
  }
  const match2 = clean.match(/^([01]\d)[/]?([0-9]{2})$/);
  if (match2) {
    const m = parseInt(match2[1], 10);
    const yShort = parseInt(match2[2], 10);
    const y = yShort >= 50 ? 1900 + yShort : 2000 + yShort;
    if (m >= 1 && m <= 12) return { month: m, year: y, label: `${MONTH_NAMES_SHORT[m - 1]}-${y.toString().slice(-2)}` };
  }
  return null;
}

export function getFinancialYear(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 4 ? `FY${year}-${String(year + 1).slice(-2)}` : `FY${year - 1}-${String(year).slice(-2)}`;
}

export function isWeekday(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function diffMonths(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}
