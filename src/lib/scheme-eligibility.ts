import { inr } from "./format";

export type SchemeName = "Standard Car Loan" | "Premium Car" | "First-Time Buyer" | "OEM Subvention" | "Commercial Vehicle";

export interface SchemeCriteria {
  name: SchemeName;
  bureauMin: number;
  maxFoirPercent: number;
  segments: string[];
  employerTier?: number;
  noAutoLoan?: boolean;
  rateRange?: { min: number; max: number };
  feePercent?: number;
  description: string;
}

export const DEFAULT_SCHEMES: SchemeCriteria[] = [
  { name: "Standard Car Loan", bureauMin: 650, maxFoirPercent: 60, segments: ["car", "suv", "lcv", "scv", "3w"], description: "General purpose new vehicle finance for all segments" },
  { name: "Premium Car", bureauMin: 750, maxFoirPercent: 50, segments: ["car", "suv"], employerTier: 3, description: "Preferential rates for A/B tier employers" },
  { name: "First-Time Buyer", bureauMin: 700, maxFoirPercent: 55, segments: ["car", "suv"], noAutoLoan: true, description: "Special scheme for applicants without existing auto loans" },
  { name: "OEM Subvention", bureauMin: 700, maxFoirPercent: 50, segments: ["car", "suv", "lcv"], rateRange: { min: 7.99, max: 8.99 }, feePercent: 0, description: "Manufacturer-subsidized rate with zero processing fee" },
  { name: "Commercial Vehicle", bureauMin: 650, maxFoirPercent: 55, segments: ["lcv", "scv", "3w"], description: "Commercial goods/passenger vehicle financing" },
];

export interface EligibilityCheckResult {
  eligible: boolean;
  scheme: SchemeName;
  failedCriteria: string[];
  matchScore: number;
  notes: string[];
}

export interface EligibilityInput {
  bureauScore: number;
  foirPercent: number;
  segment: string;
  employerTier?: number;
  hasExistingAutoLoan?: boolean;
}

export function checkEligibility(input: EligibilityInput, schemes?: SchemeCriteria[]): EligibilityCheckResult[] {
  const schemesToCheck = schemes || DEFAULT_SCHEMES;
  const results: EligibilityCheckResult[] = [];
  for (const scheme of schemesToCheck) {
    const failed: string[] = [];
    if (input.bureauScore < scheme.bureauMin) failed.push(`Bureau score ${input.bureauScore} < ${scheme.bureauMin}`);
    if (input.foirPercent > scheme.maxFoirPercent) failed.push(`FOIR ${input.foirPercent}% > ${scheme.maxFoirPercent}%`);
    if (!scheme.segments.includes(input.segment)) failed.push(`Segment ${input.segment} not eligible`);
    if (scheme.employerTier && (input.employerTier ?? 0) < scheme.employerTier) failed.push(`Employer tier below ${scheme.employerTier}`);
    if (scheme.noAutoLoan && input.hasExistingAutoLoan === true) failed.push("Existing auto loan found");
    const score = Math.max(0, 100 - failed.length * 30);
    results.push({ eligible: failed.length === 0, scheme: scheme.name, failedCriteria: failed, matchScore: score, notes: failed.length === 0 ? [scheme.description] : failed });
  }
  return results.sort((a, b) => b.matchScore - a.matchScore);
}
