
export interface BureauRequest {
  pan: string;
  applicantName?: string;
  applicationId?: string;
}

export interface BureauAccount {
  accountType: string;
  lender: string;
  amount: number;
  openedDate: string;
  status: string;
}

export interface BureauMockResponse {
  score: number;
  scoreRange: number; // 550-850
  pan: string;
  accounts: BureauAccount[];
  enquiries: { date: string; lender: string }[];
  dpdSummary: { dpd30: number; dpd60: number; dpd90: number };
  flags: { cleanRecord: boolean; thinFile: boolean; highEnquiryVelocity: boolean };
  success: boolean;
  error?: string;
}

export function hashPanToScore(pan: string): number {
  let hash = 0;
  for (let i = 0; i < pan.length; i++) {
    hash = ((hash << 5) - hash) + pan.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  return 550 + (absHash % 301); // 550-850
}

function getLenders(): string[] {
  return ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Bank"];
}

export async function fetchBureauReport(request: BureauRequest): Promise<BureauMockResponse> {
  // 500-1500ms delay
  const delay = 500 + Math.floor(Math.random() * 1001);
  await new Promise((r) => setTimeout(r, delay));

  // 5% failure rate
  if (Math.random() < 0.05) {
    return { score: 0, scoreRange: 0, pan: request.pan || "", accounts: [], enquiries: [], dpdSummary: { dpd30: 0, dpd60: 0, dpd90: 0 }, flags: { cleanRecord: false, thinFile: false, highEnquiryVelocity: false }, success: false, error: "Mock API error: service unavailable" };
  }

  const score = hashPanToScore(request.pan);
  const lenders = getLenders();
  const accountCount = 2 + Math.floor(Math.random() * 4);
  const accounts: BureauAccount[] = Array.from({ length: accountCount }, (_, i) => ({
    accountType: ["Home Loan", "Personal Loan", "Credit Card", "Auto Loan", "Education Loan"][i % 5],
    lender: lenders[i % lenders.length],
    amount: 120000 + Math.floor(Math.random() * 800000),
    openedDate: `202${1 + Math.floor(Math.random() * 4)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`,
    status: ["Active", "Closed", "Active", "Active"][i % 4],
  }));

  const enquiryCount = 1 + Math.floor(Math.random() * 3);
  const enquiries = Array.from({ length: enquiryCount }, () => ({
    date: new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000).toISOString().slice(0, 10),
    lender: lenders[Math.floor(Math.random() * lenders.length)],
  }));

  return {
    score,
    scoreRange: 550,
    pan: request.pan,
    accounts,
    enquiries,
    dpdSummary: { dpd30: score > 700 ? 0 : Math.floor(Math.random() * 2), dpd60: score > 650 ? 0 : Math.floor(Math.random() * 2), dpd90: score > 650 ? 0 : Math.floor(Math.random() * 2) },
    flags: { cleanRecord: score >= 700 && Math.random() > 0.3, thinFile: accounts.length < 3, highEnquiryVelocity: enquiries.length > 3 },
    success: true,
  };
}
