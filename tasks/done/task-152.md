---
type: new
target: src/lib/indian-date-utils.ts
---

## Instructions

Create a TypeScript utility module for Indian locale date and time formatting.

Requirements:
- Named export `formatDateIN(isoDate: string): string` — "01 Sep 2026"
- Named export `formatDateTimeIN(isoDate: string): string` — "01 Sep 2026, 14:32"
- Named export `formatDateShort(isoDate: string): string` — "01 Sep"
- Named export `formatRelativeTime(isoDate: string): string` — "2 minutes ago", "3 hours ago", "1 day ago", "5 days ago", "01 Sep 2026" (if older than 7 days)
- Named export `formatMonthYear(isoDate: string): string` — "Sep 2026"
- Named export `parseMMYY(mmyy: string): {month: number; year: number; label: string}` — "0826" → {month: 8, year: 2026, label: "Aug-26"}
- Named export `getFinancialYear(date: Date): string` — "FY2026-27" (April to March)
- Named export `isWeekday(date: Date): boolean` — Monday-Friday
- Named export `addMonths(isoDate: string, months: number): string` — returns ISO date string
- Named export `diffMonths(from: string, to: string): number` — difference in months between two ISO dates
- Named export `MONTH_NAMES_SHORT: string[]` — ["Jan", "Feb", ..., "Dec"]
- Named export `MONTH_NAMES_FULL: string[]` — ["January", "February", ..., "December"]
- All functions handle invalid input gracefully: return empty string or 0 rather than throwing.
- Use built-in Date methods only, no external dependencies.
- Pure TypeScript, no React
