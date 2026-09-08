
export const DOCUMENT_LABELS = {
  salary_slip: "Salary Slip",
  bank_statement: "Bank Statement",
  pan_card: "PAN Card",
  aadhaar: "Aadhaar Card",
  address_proof: "Address Proof",
  gst_return: "GST Return",
  itr: "Income Tax Return",
  employment_letter: "Employment Letter",
  unknown: "Unknown Document",
};

export type DocumentType = keyof typeof DOCUMENT_LABELS;

export interface ClassificationResult {
  type: DocumentType;
  confidence: "high" | "medium" | "low";
  matchCount: number;
  matches: string[];
}

const KEYWORD_MAP: Record<DocumentType, string[]> = {
  salary_slip: ["gross salary", "net pay", "basic salary", "hra", "deduction", "provident fund", "employer name", "employee", "earnings", "salary"],
  bank_statement: ["opening balance", "closing balance", "statement", "ifsc", "branch", "account number", "debit", "credit", "transaction", "current", "savings"],
  pan_card: ["permanent account number", "income tax", "department", "pan", "card number", "taxpayer"],
  aadhaar: ["unique identification", "aadhaar", "uidai", "uid", "enrolment", "identification"],
  address_proof: ["address", "residence", "house", "flat", "building", "landmark", "post office", "pincode", "pin code"],
  gst_return: ["gst", "gstin", "goods and services", "tax invoice", "return filing", "tax period"],
  itr: ["income tax return", "assessment year", "filing", "acknowledgement", "form 16", "form 26as"],
  employment_letter: ["employment", "appointment", "offer letter", "joining", "designation", "probation", "employment verification"],
  unknown: [],
};

export function classifyDocument(text: string, fileName?: string): ClassificationResult {
  const lowerText = text.toLowerCase();
  const lowerFile = (fileName || "").toLowerCase();

  const scores: Partial<Record<DocumentType, number>> = {};

  for (const [type, keywords] of Object.entries(KEYWORD_MAP)) {
    let count = 0;
    const matchedKeywords: string[] = [];
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&").toLowerCase()}\\b`, "gi");
      const matches = lowerText.match(regex);
      if (matches) {
        count += matches.length;
        matchedKeywords.push(kw);
      }
    }
    scores[type as DocumentType] = count;
  }

  // Filename hints
  if (lowerFile.includes("salary")) scores["salary_slip"] = (scores["salary_slip"] || 0) + 3;
  if (lowerFile.includes("bank") || lowerFile.includes("statement")) scores["bank_statement"] = (scores["bank_statement"] || 0) + 3;
  if (lowerFile.includes("pan")) scores["pan_card"] = (scores["pan_card"] || 0) + 3;
  if (lowerFile.includes("aadhaar")) scores["aadhaar"] = (scores["aadhaar"] || 0) + 3;
  if (lowerFile.includes("address")) scores["address_proof"] = (scores["address_proof"] || 0) + 3;
  if (lowerFile.includes("gst")) scores["gst_return"] = (scores["gst_return"] || 0) + 3;
  if (lowerFile.includes("itr") || lowerFile.includes("income_tax")) scores["itr"] = (scores["itr"] || 0) + 3;
  if (lowerFile.includes("offer") || lowerFile.includes("employment")) scores["employment_letter"] = (scores["employment_letter"] || 0) + 3;

  const sorted = Object.entries(scores) as [DocumentType, number][];
  sorted.sort((a, b) => b[1] - a[1]);

  const best = sorted[0]!;
  const bestType = best[0];
  const bestCount = best[1];

  const confidence = bestCount >= 3 ? "high" : bestCount >= 2 ? "medium" : bestCount >= 1 ? "low" : "low";

  return {
    type: bestType === "unknown" && bestCount === 0 ? "unknown" : bestType,
    confidence,
    matchCount: Math.round(bestCount),
    matches: bestType === "unknown" ? [] : KEYWORD_MAP[bestType].filter((k) => lowerText.includes(k.toLowerCase())),
  };
}
