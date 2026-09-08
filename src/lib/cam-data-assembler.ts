import { inr, pct } from "@/lib/format";

export type CAMData = {
  applicationId: string;
  generatedAt: string;
  applicant: {
    name: string;
    age: number;
    pan: string;
    aadhaarMasked: string;
    employer: string;
    employerCategory: "A" | "B" | "C" | "unverified";
    designation: string;
    grossMonthlyIncome: number;
    netMonthlyIncome: number;
  };
  vehicle: {
    make: string;
    model: string;
    variant: string;
    segment: string;
    exShowroomPrice: number;
    onRoadPrice: number;
    dealerName: string;
    dealerTier: string;
  };
  loan: {
    amount: number;
    tenure: number;
    rate: number;
    emi: number;
    processingFee: number;
  };
  bureau: {
    source: string;
    score: number;
    band: string;
    flags: string[];
  };
  cashflow: {
    avgBalance: number;
    avgSalary: number;
    salaryRegularity: string;
    bounceCount: number;
    monthsAnalyzed: number;
  };
  ratios: {
    foirPct: number;
    dbrPct: number;
    ltvPct: number;
    netSurplus: number;
  };
  policyResult: {
    decision: string;
    score: number;
    band: string;
    failedRules: Array<{ id: string; description: string; severity: string }>;
  };
  recommendation: string;
};

function generateApplicationId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hex = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
  return `APP-${yyyymmdd}-${hex}`;
}

function parseVehicleString(vehicleStr: string) {
  // Best-effort split: e.g. "Hyundai Creta SX(O) 1.5 Turbo DCT"
  const parts = vehicleStr.trim().split(" ");
  const make = parts[0] ?? "";
  const rest = parts.slice(1).join(" ");
  // Simple heuristic: last token is variant/trim; everything in between is model
  const lastSpace = rest.lastIndexOf(" ");
  const model = lastSpace >= 0 ? rest.slice(0, lastSpace) : rest;
  const variant = lastSpace >= 0 ? rest.slice(lastSpace + 1) : "";
  return { make, model, variant };
}

function segmentFromPrice(price: number): string {
  if (price < 800000) return "Entry / Hatchback";
  if (price < 1500000) return "Mid / Compact SUV";
  return "Premium / Large SUV";
}

function buildRecommendation(
  decision: string,
  policyResult: { score: number; band: string; failedRules: Array<{ id: string; description: string; severity: string }> },
  ratios: { foirPct: number; ltvPct: number }
): string {
  const d = String(decision ?? "").toLowerCase();
  if (d === "approve" || d === "approved") {
    return `Application meets all policy criteria. Bureau score ${policyResult.score} (${policyResult.band}), FOIR ${pct(ratios.foirPct, 1)}, LTV ${pct(ratios.ltvPct, 1)}%. Recommended for approval.`;
  }
  if (d === "decline" || d === "declined" || d === "rejected") {
    const hardDescriptions = policyResult.failedRules
      .filter((r) => r.severity === "hard" || r.severity === "critical")
      .map((r) => r.description);
    const listStr = hardDescriptions.length ? hardDescriptions.join("; ") : "hard failure criteria not met";
    return `Application does not meet minimum criteria. Hard failures: ${listStr}.`;
  }
  // review / maybe / referred / anything else
  const descriptions = policyResult.failedRules.map((r) => r.description);
  const listStr = descriptions.length ? descriptions.join("; ") : "policy review required";
  return `Application requires manual review. ${policyResult.failedRules.length} policy flags raised: ${listStr}.`;
}

export function assembleCAM(parts: {
  applicant: any;
  vehicle: any;
  loan: any;
  bureau: any;
  cashflow: any;
  ratios: any;
  policyResult: any;
}): CAMData {
  const app = parts.applicant ?? {};
  const veh = parts.vehicle ?? {};
  const ln = parts.loan ?? {};
  const bur = parts.bureau ?? {};
  const cf = parts.cashflow ?? {};
  const rat = parts.ratios ?? {};
  const pol = parts.policyResult ?? {};

  const vehicleStr = veh.name ?? veh.model ?? veh.vehicle ?? "";
  const parsed = parseVehicleString(vehicleStr);

  const aadhaarRaw = app.aadhaar ?? "";
  const maskedAadhaar = aadhaarRaw
    .split("")
    .map((ch: string, i: number, arr: string[]) => {
      if (i >= arr.length - 4) return ch;
      return /\d/.test(ch) ? "X" : ch;
    })
    .join("");

  const employerCategory = (() => {
    const cat = String(app.employerCategory ?? app.category ?? "").trim();
    if (["A", "B", "C"].includes(cat)) return cat as "A" | "B" | "C";
    if (cat === "unverified") return "unverified";
    return "unverified";
  })();

  const recommendation = buildRecommendation(
    pol.decision ?? "",
    {
      score: Number(pol.score ?? bur.score ?? 0),
      band: String(pol.band ?? bur.band ?? ""),
      failedRules: Array.isArray(pol.failedRules) ? pol.failedRules : [],
    },
    {
      foirPct: Number(rat.foirPct ?? rat.foir ?? 0),
      ltvPct: Number(rat.ltvPct ?? rat.ltvPct ?? rat.ltvExShowroom ?? 0),
    }
  );

  return {
    applicationId: generateApplicationId(),
    generatedAt: new Date().toISOString(),
    applicant: {
      name: String(app.name ?? ""),
      age: Number(app.age ?? 0),
      pan: String(app.pan ?? ""),
      aadhaarMasked: maskedAadhaar,
      employer: String(app.employer ?? ""),
      employerCategory,
      designation: String(app.designation ?? ""),
      grossMonthlyIncome: Number(app.grossMonthlyIncome ?? app.netIncome ?? app.grossIncome ?? 0),
      netMonthlyIncome: Number(app.netMonthlyIncome ?? app.netIncome ?? app.netMonthlyIncome ?? 0),
    },
    vehicle: {
      make: parsed.make,
      model: parsed.model,
      variant: parsed.variant,
      segment: veh.segment ?? segmentFromPrice(Number(veh.exShowroomPrice ?? veh.exShowroom ?? 0)),
      exShowroomPrice: Number(veh.exShowroomPrice ?? veh.exShowroom ?? 0),
      onRoadPrice: Number(veh.onRoadPrice ?? veh.onRoad ?? 0),
      dealerName: String(veh.dealerName ?? veh.dealer ?? ""),
      dealerTier: veh.dealerTier ?? (employerCategory === "A" ? "Tier-1" : employerCategory === "B" ? "Tier-2" : "Tier-3"),
    },
    loan: {
      amount: Number(ln.amount ?? ln.loanAmount ?? 0),
      tenure: Number(ln.tenure ?? ln.months ?? 0),
      rate: Number(ln.rate ?? 0),
      emi: Number(ln.emi ?? 0),
      processingFee: Number(ln.processingFee ?? ln.fee ?? 0),
    },
    bureau: {
      source: String(bur.source ?? bur.bureauSource ?? "Bureau"),
      score: Number(bur.score ?? bur.cibil ?? 0),
      band: bur.band ?? (Number(bur.score ?? bur.cibil ?? 0) >= 750 ? "Good" : Number(bur.score ?? bur.cibil ?? 0) >= 650 ? "Average" : "Poor"),
      flags: Array.isArray(bur.flags) ? bur.flags : Array.isArray(bur.flagsArr) ? bur.flagsArr : [],
    },
    cashflow: {
      avgBalance: Number(cf.avgBalance ?? cf.avgBankBalance ?? 0),
      avgSalary: Number(cf.avgSalary ?? cf.avgCredit ?? 0),
      salaryRegularity: String(cf.salaryRegularity ?? (cf.bounceCount === 0 ? "Regular" : "Irregular")),
      bounceCount: Number(cf.bounceCount ?? 0),
      monthsAnalyzed: Number(cf.monthsAnalyzed ?? 6),
    },
    ratios: {
      foirPct: Number(rat.foirPct ?? rat.foir ?? 0),
      dbrPct: Number(rat.dbrPct ?? rat.dbr ?? 0),
      ltvPct: Number(rat.ltvPct ?? rat.ltvExShowroom ?? 0),
      netSurplus: Number(rat.netSurplus ?? 0),
    },
    policyResult: {
      decision: String(pol.decision ?? pol.result ?? ""),
      score: Number(pol.score ?? 0),
      band: String(pol.band ?? ""),
      failedRules: Array.isArray(pol.failedRules)
        ? pol.failedRules.map((r: any) => ({
            id: String(r.id ?? r.ruleId ?? r.rule ?? ""),
            description: String(r.description ?? r.desc ?? r.message ?? ""),
            severity: String(r.severity ?? r.level ?? "medium"),
          }))
        : [],
    },
    recommendation,
  };
}
