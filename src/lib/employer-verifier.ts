export interface EmployerVerification {
  employerName: string;
  matchedCategory: "A" | "B" | "Unknown";
  sector: string;
  verified: boolean;
  panValid?: boolean;
  panType?: string;
}

export const CATEGORY_A_EMPLOYERS = [
  "SBI", "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank",
  "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Canara Bank",
  "Tata Consultancy Services", "TCS", "Infosys", "Wipro", "HCL Technologies", "HCL",
  "Reliance Industries", "Reliance", "Larsen & Toubro", "L&T", "Maruti Suzuki",
  "Government of India", "Indian Railways", "Indian Army", "Indian Navy", "Indian Air Force",
  "Indian Space Research Organisation", "ISRO", "Oil and Natural Gas Corporation", "ONGC",
  "Life Insurance Corporation", "LIC", "Bharat Heavy Electricals Limited", "BHEL",
  "National Thermal Power Corporation", "NTPC", "Power Grid Corporation of India", "PGCIL",
];

export const CATEGORY_B_EMPLOYERS = [
  "Mahindra", "Kia Motors", "Toyota Kirloskar", "Honda Cars India", "Renault India",
  "MG Motor India", "Skoda Auto India", "Volkswagen India",
  "Mid-tier IT companies", "Mid-tier manufacturing", "Private universities",
  "State government departments", "Public sector undertakings (state)",
  "Cooperative banks", "Private hospitals", "Medium construction firms",
  "Retail chains (national)", "Logistics companies (national)",
];

const SECTOR_MAP: Record<string, string[]> = {
  Banking: ["bank", "banking", "financial", "insurance", "lic", "sbi", "hdfc", "icici", "axis", "kotak", "pnb", "canara", "baroda", "cooperative"],
  IT: ["tcs", "infosys", "wipro", "hcl", "tech", "software", "it", "consulting", "services"],
  Manufacturing: ["reliance", "l&t", "tata", "mahindra", "maruti", "suzuki", "kia", "toyota", "honda", "renault", "mg", "skoda", "volkswagen", "manufacturing", "automotive", "auto"],
  Government: ["government", "govt", "railways", "army", "navy", "air force", "isro", "defence", "public sector", "psu", "bhel", "ntpc", "ongc", "pgcil"],
};

export function classifyEmployer(name: string): EmployerVerification {
  const lowerName = name.toLowerCase();
  const upperName = name.toUpperCase();

  const isA = CATEGORY_A_EMPLOYERS.some((e) => lowerName.includes(e.toLowerCase()) || upperName.includes(e));
  const isB = !isA && CATEGORY_B_EMPLOYERS.some((e) => lowerName.includes(e.toLowerCase()) || upperName.includes(e));

  let sector = "Other";
  for (const [sec, keywords] of Object.entries(SECTOR_MAP)) {
    if (keywords.some((kw) => lowerName.includes(kw.toLowerCase()))) {
      sector = sec;
      break;
    }
  }

  return {
    employerName: name,
    matchedCategory: isA ? "A" : isB ? "B" : "Unknown",
    sector,
    verified: isA || isB,
  };
}

export function verifyEmployerPAN(pan: string): { valid: boolean; entityType?: string } {
  const clean = pan.trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(clean)) return { valid: false };
  const fourthChar = clean[3];
  const types: Record<string, string> = {
    P: "Individual",
    C: "Company",
    H: "HUF",
    F: "Firm",
    A: "AOP",
    T: "Trust",
    B: "BOI",
    L: "Local Authority",
    G: "Government",
    J: "Artificial Juridical Person",
  };
  return { valid: true, entityType: types[fourthChar] || "Unknown" };
}
