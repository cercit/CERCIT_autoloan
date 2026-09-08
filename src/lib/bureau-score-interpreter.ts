/**
 * Bureau Score Interpreter
 * Interprets CIBIL / Experian / CRIF credit scores into decision bands
 */

export type BureauBandName = "green" | "amber-high" | "amber-low" | "red";

export interface BureauBand {
  band: BureauBandName;
  label: string;
  minScore: number;
  maxScore: number;
  autoDecision: "approve" | "review" | "decline";
}

export const BUREAU_BANDS: BureauBand[] = [
  { band: "green", label: "Good - Approve", minScore: 750, maxScore: 900, autoDecision: "approve" },
  { band: "amber-high", label: "Fair - Review (High)", minScore: 700, maxScore: 749, autoDecision: "review" },
  { band: "amber-low", label: "Fair - Review (Low)", minScore: 650, maxScore: 699, autoDecision: "review" },
  { band: "red", label: "Poor - Decline", minScore: 300, maxScore: 649, autoDecision: "decline" },
];

export interface BureauFlags {
  highEnquiryVelocity: boolean;   // > 5 enquiries in 90 days
  recentDPD: boolean;             // any DPD in last 6 months
  severeDelinquency: boolean;      // 90+ DPD or write-off
  thinFile: boolean;              // < 2 active accounts
  overLeveraged: boolean;         // > 80% utilization
  cleanRecord: boolean;            // no flags at all
}

export interface BureauData {
  score: number;
  bureau: "CIBIL" | "Experian" | "CRIF";
  enquiries30d?: number;
  enquiries90d?: number;
  dpd30?: number;
  dpd60?: number;
  dpd90?: number;
  activeAccounts?: number;
  totalCreditLimit?: number;
  totalOutstanding?: number;
  writeOff?: boolean;
}

export interface BureauInterpretation {
  score: number;
  bureau: string;
  band: BureauBandName;
  label: string;
  autoDecision: "approve" | "review" | "decline";
  dpd30: number;
  dpd60: number;
  dpd90: number;
  flags: string[];
}

export function interpretScore(score: number, bureau: string = "CIBIL"): BureauInterpretation {
  const band = BUREAU_BANDS.find((b) => score >= b.minScore && score <= b.maxScore)
    || BUREAU_BANDS.find((b) => b.band === "red")!;

  return {
    score,
    bureau,
    band: band.band,
    label: band.label,
    autoDecision: band.autoDecision,
    dpd30: 0,
    dpd60: 0,
    dpd90: 0,
    flags: [],
  };
}

export function generateFlags(data: Partial<BureauData>): BureauFlags {
  const flags: BureauFlags = {
    highEnquiryVelocity: (data.enquiries90d ?? 0) > 5,
    recentDPD: (data.dpd30 ?? 0) > 0 || (data.dpd60 ?? 0) > 0,
    severeDelinquency: (data.dpd90 ?? 0) > 0 || (data.writeOff ?? false) === true,
    thinFile: (data.activeAccounts ?? 0) < 2,
    overLeveraged: (() => {
      const limit = data.totalCreditLimit ?? 0;
      const out = data.totalOutstanding ?? 0;
      return limit > 0 && (out / limit) > 0.8;
    })(),
    cleanRecord: false,
  };

  flags.cleanRecord = !flags.highEnquiryVelocity && !flags.recentDPD && !flags.severeDelinquency && !flags.thinFile && !flags.overLeveraged;
  return flags;
}
