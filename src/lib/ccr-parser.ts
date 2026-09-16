import type { ExtractionField } from "./aws-doc-api";

export interface BureauParsed {
  bureauName: string;
  score: number;
  dpd30: number;
  dpd60: number;
  dpd90: number;
  activeAccounts: number;
  totalAccounts: number;
  totalOutstanding: number;
  totalCreditLimit: number;
  enquiries90d: number;
  pan: string;
  reportDate: string;
  utilization: number;
}

export function parseBureauExtraction(
  fields: Record<string, ExtractionField>
): BureauParsed {
  const score = num(fields["score"]);
  const totalOutstanding = num(fields["total_outstanding"]);
  const totalCreditLimit = num(fields["total_credit_limit"]);

  return {
    bureauName: str(fields["bureau_name"]) || "CIBIL",
    score,
    dpd30: num(fields["dpd_30"]),
    dpd60: num(fields["dpd_60"]),
    dpd90: num(fields["dpd_90"]),
    activeAccounts: num(fields["active_accounts"]),
    totalAccounts: num(fields["total_accounts"]),
    totalOutstanding,
    totalCreditLimit,
    enquiries90d: num(fields["enquiries_90d"]),
    pan: str(fields["pan"]),
    reportDate: str(fields["report_date"]),
    utilization:
      totalCreditLimit > 0
        ? Math.round((totalOutstanding / totalCreditLimit) * 100)
        : 0,
  };
}

export function scoreBand(
  score: number
): "green" | "amber-high" | "amber-low" | "red" {
  if (score >= 750) return "green";
  if (score >= 700) return "amber-high";
  if (score >= 650) return "amber-low";
  return "red";
}

export function scoreLabel(band: ReturnType<typeof scoreBand>): string {
  switch (band) {
    case "green":
      return "Strong";
    case "amber-high":
      return "Acceptable";
    case "amber-low":
      return "Needs review";
    case "red":
      return "High risk";
  }
}

export function hasDpdIssues(parsed: BureauParsed): boolean {
  return parsed.dpd30 > 0 || parsed.dpd60 > 0 || parsed.dpd90 > 0;
}

export function highEnquiryVelocity(parsed: BureauParsed): boolean {
  return parsed.enquiries90d > 5;
}

export function highUtilization(parsed: BureauParsed): boolean {
  return parsed.utilization > 75;
}

export function generateBureauFlags(parsed: BureauParsed): string[] {
  const flags: string[] = [];

  if (parsed.score < 650) flags.push("Bureau score below 650");
  if (parsed.dpd90 > 0) flags.push(`${parsed.dpd90} accounts with 90+ DPD`);
  if (parsed.dpd60 > 0) flags.push(`${parsed.dpd60} accounts with 60+ DPD`);
  if (parsed.dpd30 > 0) flags.push(`${parsed.dpd30} accounts with 30+ DPD`);
  if (parsed.enquiries90d > 5)
    flags.push(`High enquiry velocity: ${parsed.enquiries90d} in 90 days`);
  if (parsed.utilization > 75)
    flags.push(`Credit utilization at ${parsed.utilization}%`);

  return flags;
}

function num(field?: ExtractionField): number {
  if (!field) return 0;
  const v = field.value;
  return typeof v === "number" ? v : Number(v) || 0;
}

function str(field?: ExtractionField): string {
  if (!field) return "";
  return String(field.value);
}
