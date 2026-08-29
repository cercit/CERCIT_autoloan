export type Category = "A" | "B" | "C";
export type AppStatus =
  | "New"
  | "Documents Uploaded"
  | "Under Review"
  | "Referred"
  | "Sanctioned"
  | "Rejected";

export type Obligation = {
  lender: string;
  type: string;
  emi: number;
  outstanding: number;
  dpd: string;
  source: "Bureau" | "Declared" | "This application";
};

export type Application = {
  id: string;
  name: string;
  employer: string;
  category: Category;
  loanAmount: number;
  cibil: number;
  status: AppStatus;
  submitted: string;
  assignedTo: string;
  recommendation: "Approve" | "Maybe" | "Reject";
  rate: number;
  tenure: number;
  foir: number;
  ltvExShowroom: number;
  ltvOnRoad: number;
  netIncome: number;
  age: number;
  pan: string;
  aadhaar: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  address: string;
  residence: string;
  designation: string;
  totalExperience: string;
  currentTenure: string;
  salaryBank: string;
  vehicle: string;
  dealer: string;
  exShowroom: number;
  onRoad: number;
  obligations: Obligation[];
  flags: string[];
  reasons: string[];
  referredBy?: string;
  referralNote?: string;
};

const base = {
  assignedTo: "Rajeev Menon",
  state: "Tamil Nadu",
  residence: "Owned",
  salaryBank: "HDFC Bank",
};

export const applications: Application[] = [
  {
    ...base,
    id: "APP-2026-00847",
    name: "Rajesh Kumar Sharma",
    employer: "Tata Consultancy Services",
    category: "A",
    loanAmount: 850000,
    cibil: 782,
    status: "Under Review",
    submitted: "28 Aug 2026",
    recommendation: "Approve",
    rate: 8.99,
    tenure: 60,
    foir: 53.3,
    ltvExShowroom: 46.2,
    ltvOnRoad: 40.2,
    netIncome: 83450,
    age: 32,
    pan: "ABCDE1234F",
    aadhaar: "4321 8765 9012",
    phone: "+91 98400 12345",
    email: "rajesh.sharma@tcs.com",
    address: "12/4 Anna Nagar East, 3rd Street",
    city: "Chennai",
    designation: "Senior Software Engineer",
    totalExperience: "8 years",
    currentTenure: "3.5 years",
    vehicle: "Hyundai Creta SX(O) 1.5 Turbo DCT",
    dealer: "Lakshmi Hyundai, Chennai",
    exShowroom: 1840000,
    onRoad: 2115000,
    obligations: [
      {
        lender: "HDFC Bank",
        type: "Home Loan",
        emi: 22000,
        outstanding: 1850000,
        dpd: "0",
        source: "Bureau",
      },
      {
        lender: "Axis Bank",
        type: "Credit Card",
        emi: 5000,
        outstanding: 45000,
        dpd: "0",
        source: "Bureau",
      },
    ],
    flags: ["3 bureau enquiries in last 90 days (threshold: 4)"],
    reasons: [
      "CIBIL 782 — above 750 threshold",
      "FOIR 53.3% — above 50% limit, officer review needed",
      "LTV 46.2% — within 120% limit",
      "All documents verified — no mismatches",
      "Employer: Tata Consultancy Services (Category A)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00846",
    name: "Priya Venkatesan",
    employer: "Infosys",
    category: "A",
    loanAmount: 1120000,
    cibil: 801,
    status: "Documents Uploaded",
    submitted: "28 Aug 2026",
    recommendation: "Approve",
    rate: 8.75,
    tenure: 60,
    foir: 34.1,
    ltvExShowroom: 62.4,
    ltvOnRoad: 55.8,
    netIncome: 96200,
    age: 29,
    pan: "BXVPS8821K",
    aadhaar: "9087 3321 4410",
    phone: "+91 90031 44521",
    email: "priya.v@infosys.com",
    address: "48 Velachery Main Road",
    city: "Chennai",
    designation: "Technology Analyst",
    totalExperience: "6 years",
    currentTenure: "4 years",
    vehicle: "Maruti Suzuki Grand Vitara Alpha AT",
    dealer: "ABT Maruti, Chennai",
    exShowroom: 1795000,
    onRoad: 2005000,
    obligations: [
      {
        lender: "ICICI Bank",
        type: "Personal Loan",
        emi: 12800,
        outstanding: 320000,
        dpd: "0",
        source: "Bureau",
      },
    ],
    flags: [],
    reasons: [
      "CIBIL 801 — above 750 threshold",
      "FOIR 34.1% — within 50% limit",
      "LTV 62.4% — within 120% limit",
      "Employer: Infosys (Category A)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00845",
    name: "Mohammed Irfan",
    employer: "Ashok Leyland",
    category: "B",
    loanAmount: 640000,
    cibil: 712,
    status: "Referred",
    submitted: "27 Aug 2026",
    recommendation: "Maybe",
    rate: 9.75,
    tenure: 48,
    foir: 48.9,
    ltvExShowroom: 78.2,
    ltvOnRoad: 70.5,
    netIncome: 54300,
    age: 37,
    pan: "CDXPM4432L",
    aadhaar: "3312 6650 9871",
    phone: "+91 91760 22114",
    email: "irfan.m@ashokleyland.com",
    address: "7 Ambattur Industrial Estate Road",
    city: "Chennai",
    residence: "Rented",
    designation: "Assistant Manager — Plant",
    totalExperience: "11 years",
    currentTenure: "2 years",
    salaryBank: "Indian Bank",
    vehicle: "Tata Nexon Fearless+ PS DCA",
    dealer: "Sundaram Motors, Chennai",
    exShowroom: 818000,
    onRoad: 908000,
    obligations: [
      {
        lender: "Bajaj Finance",
        type: "Personal Loan",
        emi: 9400,
        outstanding: 210000,
        dpd: "30",
        source: "Bureau",
      },
    ],
    flags: ["30 DPD on Bajaj Finance personal loan in last 6 months"],
    reasons: [
      "CIBIL 712 — below 750 auto-approve threshold",
      "FOIR 48.9% — within 50% limit but close",
      "30 DPD observed on one active account",
      "Employer: Ashok Leyland (Category B)",
    ],
    referredBy: "Rajeev Menon",
    referralNote:
      "CIBIL just under threshold with a single 30 DPD. Income and tenure look stable — requesting manager view on a rate-loaded approval.",
  },
  {
    ...base,
    id: "APP-2026-00844",
    name: "Anitha Raghavan",
    employer: "Zoho Corporation",
    category: "A",
    loanAmount: 980000,
    cibil: 768,
    status: "Sanctioned",
    submitted: "27 Aug 2026",
    recommendation: "Approve",
    rate: 8.99,
    tenure: 60,
    foir: 41.2,
    ltvExShowroom: 58.1,
    ltvOnRoad: 51.3,
    netIncome: 91500,
    age: 34,
    pan: "AKRPA7712M",
    aadhaar: "5521 8890 1123",
    phone: "+91 98847 55120",
    email: "anitha.r@zohocorp.com",
    address: "22 Estancia, Guduvanchery",
    city: "Chengalpattu",
    designation: "Product Manager",
    totalExperience: "10 years",
    currentTenure: "5 years",
    vehicle: "Kia Seltos GTX+ DCT",
    dealer: "KUN Kia, Chennai",
    exShowroom: 1687000,
    onRoad: 1910000,
    obligations: [],
    flags: [],
    reasons: [
      "CIBIL 768 — above 750 threshold",
      "FOIR 41.2% — within 50% limit",
      "No existing obligations",
      "Employer: Zoho Corporation (Category A)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00843",
    name: "Suresh Babu",
    employer: "Sri Lakshmi Traders",
    category: "C",
    loanAmount: 520000,
    cibil: 624,
    status: "Rejected",
    submitted: "26 Aug 2026",
    recommendation: "Reject",
    rate: 11.5,
    tenure: 48,
    foir: 61.4,
    ltvExShowroom: 92.5,
    ltvOnRoad: 84.1,
    netIncome: 31200,
    age: 41,
    pan: "DFRPS9921N",
    aadhaar: "7781 2234 8890",
    phone: "+91 94440 78123",
    email: "sureshbabu41@gmail.com",
    address: "3 Bazaar Street, Tambaram",
    city: "Chennai",
    residence: "Rented",
    designation: "Sales Supervisor",
    totalExperience: "9 years",
    currentTenure: "8 months",
    salaryBank: "Karur Vysya Bank",
    vehicle: "Maruti Suzuki Swift ZXI+ AMT",
    dealer: "Popular Wheels, Chennai",
    exShowroom: 562000,
    onRoad: 618000,
    obligations: [
      {
        lender: "HDB Financial",
        type: "Two Wheeler",
        emi: 4200,
        outstanding: 62000,
        dpd: "60",
        source: "Bureau",
      },
      {
        lender: "SBI Card",
        type: "Credit Card",
        emi: 3500,
        outstanding: 88000,
        dpd: "30",
        source: "Bureau",
      },
    ],
    flags: ["60 DPD in last 12 months", "Employer category C with 8 month tenure"],
    reasons: [
      "CIBIL 624 — below 650 floor",
      "FOIR 61.4% — breaches 50% limit",
      "Current employer tenure 8 months — below 1 year minimum",
      "Employer: Sri Lakshmi Traders (Category C)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00842",
    name: "Deepak Nair",
    employer: "Cognizant",
    category: "A",
    loanAmount: 1450000,
    cibil: 754,
    status: "New",
    submitted: "26 Aug 2026",
    recommendation: "Maybe",
    rate: 9.25,
    tenure: 72,
    foir: 46.7,
    ltvExShowroom: 71.9,
    ltvOnRoad: 64.2,
    netIncome: 118400,
    age: 38,
    pan: "AZQPN1188R",
    aadhaar: "2210 6674 3390",
    phone: "+91 99620 33417",
    email: "deepak.nair@cognizant.com",
    address: "9 OMR Perungudi",
    city: "Chennai",
    designation: "Delivery Manager",
    totalExperience: "14 years",
    currentTenure: "1.2 years",
    vehicle: "Toyota Innova Hycross ZX(O)",
    dealer: "Lanson Toyota, Chennai",
    exShowroom: 2017000,
    onRoad: 2258000,
    obligations: [
      {
        lender: "Kotak Mahindra",
        type: "Home Loan",
        emi: 38000,
        outstanding: 4210000,
        dpd: "0",
        source: "Bureau",
      },
    ],
    flags: ["Current employer tenure 1.2 years — recently switched"],
    reasons: [
      "CIBIL 754 — just above 750 threshold",
      "FOIR 46.7% — within 50% limit",
      "Employer tenure 1.2 years — recently switched",
      "Employer: Cognizant (Category A)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00841",
    name: "Kavitha Selvam",
    employer: "Apollo Hospitals",
    category: "B",
    loanAmount: 720000,
    cibil: 739,
    status: "Under Review",
    submitted: "25 Aug 2026",
    recommendation: "Maybe",
    rate: 9.5,
    tenure: 60,
    foir: 44.3,
    ltvExShowroom: 66.8,
    ltvOnRoad: 60.1,
    netIncome: 62800,
    age: 31,
    pan: "BNKPK5540T",
    aadhaar: "6612 4478 2201",
    phone: "+91 90800 65412",
    email: "kavitha.s@apollohospitals.com",
    address: "18 Greams Road",
    city: "Chennai",
    designation: "Nursing Superintendent",
    totalExperience: "7 years",
    currentTenure: "3 years",
    salaryBank: "Axis Bank",
    vehicle: "Honda Elevate ZX CVT",
    dealer: "Dakshin Honda, Chennai",
    exShowroom: 1078000,
    onRoad: 1198000,
    obligations: [
      {
        lender: "Muthoot Finance",
        type: "Gold Loan",
        emi: 6500,
        outstanding: 140000,
        dpd: "0",
        source: "Declared",
      },
    ],
    flags: [],
    reasons: [
      "CIBIL 739 — below 750 auto-approve threshold",
      "FOIR 44.3% — within 50% limit",
      "Employer: Apollo Hospitals (Category B)",
    ],
  },
  {
    ...base,
    id: "APP-2026-00840",
    name: "Arun Prakash",
    employer: "Larsen & Toubro",
    category: "A",
    loanAmount: 890000,
    cibil: 776,
    status: "Sanctioned",
    submitted: "25 Aug 2026",
    recommendation: "Approve",
    rate: 8.99,
    tenure: 60,
    foir: 39.8,
    ltvExShowroom: 55.4,
    ltvOnRoad: 49.2,
    netIncome: 88900,
    age: 35,
    pan: "AWTPA3391B",
    aadhaar: "1123 7789 4456",
    phone: "+91 98410 99871",
    email: "arun.prakash@lnt.com",
    address: "5 Mount Poonamallee Road",
    city: "Chennai",
    designation: "Construction Manager",
    totalExperience: "12 years",
    currentTenure: "6 years",
    vehicle: "Mahindra XUV700 AX7 L",
    dealer: "TVS Mahindra, Chennai",
    exShowroom: 1607000,
    onRoad: 1812000,
    obligations: [],
    flags: [],
    reasons: [
      "CIBIL 776 — above 750 threshold",
      "FOIR 39.8% — within 50% limit",
      "No existing obligations",
      "Employer: Larsen & Toubro (Category A)",
    ],
  },
];

export const getApplication = (id: string): Application =>
  applications.find((a) => a.id === id) ?? applications[0]!;

export const dashboardStats = [
  { label: "New Applications", value: 12, trend: "+18%", up: true },
  { label: "In Progress", value: 8, trend: "-4%", up: false },
  { label: "Sanctioned Today", value: 5, trend: "+25%", up: true },
  { label: "Rejected Today", value: 2, trend: "-9%", up: false },
];

export const decisionDistribution = [
  { name: "Auto-Approved", value: 148, key: "approved" },
  { name: "Manual Review", value: 63, key: "maybe" },
  { name: "Rejected", value: 41, key: "rejected" },
];

export const tatData = [
  { week: "W31", minutes: 92 },
  { week: "W32", minutes: 78 },
  { week: "W33", minutes: 64 },
  { week: "W34", minutes: 55 },
];

export const documents = [
  { name: "PAN Card", status: "Extracted", confidence: 98, fields: [["PAN", "ABCDE1234F"], ["Name", "Rajesh Kumar Sharma"], ["DOB", "14 Mar 1994"]] },
  { name: "Aadhaar Card", status: "Extracted", confidence: 96, fields: [["Aadhaar", "XXXX XXXX 9012"], ["Address", "Anna Nagar East, Chennai"]] },
  { name: "Salary Slip — Jul 2026", status: "Extracted", confidence: 94, fields: [["Gross", "Rs 1,04,200"], ["Net", "Rs 85,000"], ["Employer", "TCS"]] },
  { name: "Salary Slip — Jun 2026", status: "Extracted", confidence: 95, fields: [["Gross", "Rs 1,04,200"], ["Net", "Rs 85,000"]] },
  { name: "Salary Slip — May 2026", status: "Extracted", confidence: 93, fields: [["Gross", "Rs 1,04,200"], ["Net", "Rs 84,600"]] },
  { name: "Bank Statement — 6 months", status: "Processing", confidence: 0, fields: [["Avg credit", "Rs 83,450"]] },
  { name: "Form 16", status: "Extracted", confidence: 91, fields: [["Annual income", "Rs 10,10,000"], ["TDS", "Rs 62,400"]] },
  { name: "Employee ID / Appointment Letter", status: "Extracted", confidence: 89, fields: [["Employee ID", "TCS-884210"]] },
  { name: "Dealer Quotation", status: "Failed", confidence: 0, fields: [["Error", "Unreadable scan — re-upload"]] },
];

export const policyChecks = [
  { rule: "Min CIBIL Score", expected: "750", actual: "782", pass: true },
  { rule: "Max FOIR", expected: "50%", actual: "53.3%", pass: false },
  { rule: "Max LTV", expected: "120%", actual: "46.2%", pass: true },
  { rule: "Min Employment Tenure", expected: "1 year", actual: "3.5 years", pass: true },
  { rule: "Min Age", expected: "21", actual: "32", pass: true },
  { rule: "Max Age", expected: "60", actual: "32", pass: true },
  { rule: "Employer Category", expected: "A / B", actual: "A", pass: true },
  { rule: "Zero Writeoffs", expected: "Yes", actual: "Yes", pass: true },
  { rule: "Zero Bounces", expected: "Yes", actual: "Yes", pass: true },
  { rule: "Max Enquiries (90 days)", expected: "4", actual: "3", pass: true },
];

export const incomeSources = [
  { source: "Salary Slip", amount: 85000, status: "Extracted" },
  { source: "Bank Credit", amount: 83450, status: "Extracted" },
  { source: "Form 16 (annualized)", amount: 84166, status: "Extracted" },
];

export const bureauMetrics: [string, string][] = [
  ["Active Accounts", "4"],
  ["Overdue Accounts", "0"],
  ["Total Outstanding", "Rs 18,95,000"],
  ["Enquiries (90 days)", "3"],
  ["Oldest Account", "9 yr 4 mo"],
  ["Writeoffs", "No"],
  ["Settlements", "No"],
  ["Suits Filed", "No"],
];

export const dpdHistory = [
  { account: "HDFC Home Loan", months: Array(12).fill("0") },
  { account: "Axis Credit Card", months: [...Array(10).fill("0"), "0", "0"] },
  { account: "SBI Auto Loan (closed)", months: [...Array(9).fill("0"), "30", "0", "0"] },
];

export const activityLog = [
  { text: "Application submitted", time: "28 Aug 2026, 10:15 AM" },
  { text: "Documents uploaded (9 files)", time: "28 Aug 2026, 10:16 AM" },
  { text: "OCR extraction completed", time: "28 Aug 2026, 10:18 AM" },
  { text: "Bureau pull — CIBIL 782", time: "28 Aug 2026, 10:19 AM" },
  { text: "AI assessment generated", time: "28 Aug 2026, 10:20 AM" },
  { text: "Assigned to Rajeev Menon", time: "28 Aug 2026, 10:20 AM" },
];

export const overrideHistory = [
  {
    who: "Rajeev Menon",
    when: "27 Aug 2026, 4:12 PM",
    what: "Rate changed 9.25% → 9.75%",
    why: "Risk loading for 30 DPD on active personal loan",
  },
  {
    who: "Rajeev Menon",
    when: "27 Aug 2026, 4:14 PM",
    what: "Decision Reject → Refer to Credit Manager",
    why: "Income stability supports an exception; needs manager delegation",
  },
];

export type PolicyRule = {
  name: string;
  parameter: string;
  operator: string;
  threshold: string;
  action: "Approve" | "Maybe" | "Reject";
  from: string;
  to: string;
  active: boolean;
};

export const policyRules: Record<string, PolicyRule[]> = {
  CIBIL: [
    { name: "Minimum CIBIL for auto approval", parameter: "cibil_score", operator: ">=", threshold: "750", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "CIBIL manual review band", parameter: "cibil_score", operator: "between", threshold: "650 – 749", action: "Maybe", from: "01 Apr 2026", to: "—", active: true },
    { name: "CIBIL hard floor", parameter: "cibil_score", operator: "<", threshold: "650", action: "Reject", from: "01 Apr 2026", to: "—", active: true },
    { name: "New to credit (-1)", parameter: "cibil_score", operator: "=", threshold: "-1", action: "Maybe", from: "01 Jun 2026", to: "—", active: true },
  ],
  FOIR: [
    { name: "Max FOIR salaried", parameter: "foir", operator: "<=", threshold: "50%", action: "Approve", from: "28 Aug 2026", to: "—", active: true },
    { name: "FOIR review band", parameter: "foir", operator: "between", threshold: "50% – 55%", action: "Maybe", from: "28 Aug 2026", to: "—", active: true },
    { name: "FOIR breach", parameter: "foir", operator: ">", threshold: "55%", action: "Reject", from: "28 Aug 2026", to: "—", active: true },
    { name: "Legacy FOIR cap", parameter: "foir", operator: "<=", threshold: "55%", action: "Approve", from: "01 Jan 2026", to: "27 Aug 2026", active: false },
  ],
  LTV: [
    { name: "Max LTV on ex-showroom", parameter: "ltv_ex_showroom", operator: "<=", threshold: "120%", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Max LTV on-road", parameter: "ltv_on_road", operator: "<=", threshold: "100%", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "LTV breach", parameter: "ltv_ex_showroom", operator: ">", threshold: "120%", action: "Reject", from: "01 Apr 2026", to: "—", active: true },
  ],
  Tenure: [
    { name: "Max loan tenure", parameter: "tenure_months", operator: "<=", threshold: "84", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Max tenure Category C", parameter: "tenure_months", operator: "<=", threshold: "60", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
  ],
  Age: [
    { name: "Minimum applicant age", parameter: "age_at_application", operator: ">=", threshold: "21", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Maximum age at maturity", parameter: "age_at_maturity", operator: "<=", threshold: "60", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
  ],
  Employment: [
    { name: "Min current employer tenure", parameter: "employer_tenure_years", operator: ">=", threshold: "1", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Min total work experience", parameter: "total_experience_years", operator: ">=", threshold: "2", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Employer category allowed", parameter: "employer_category", operator: "=", threshold: "A, B", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Category C referral", parameter: "employer_category", operator: "=", threshold: "C", action: "Maybe", from: "01 Apr 2026", to: "—", active: true },
  ],
  Documentation: [
    { name: "Salary variance across sources", parameter: "income_variance", operator: "<=", threshold: "5%", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Name match across KYC", parameter: "kyc_name_match", operator: "=", threshold: "Yes", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
    { name: "Bank statement months", parameter: "bank_statement_months", operator: ">=", threshold: "6", action: "Approve", from: "01 Apr 2026", to: "—", active: true },
  ],
};

export const policyTabs = Object.keys(policyRules);

export const employers = [
  { name: "Tata Consultancy Services", category: "A" as Category, sector: "IT Services", listed: "Listed", employees: "600,000+", approved: 128, updated: "12 Aug 2026" },
  { name: "Infosys", category: "A" as Category, sector: "IT Services", listed: "Listed", employees: "320,000+", approved: 96, updated: "12 Aug 2026" },
  { name: "Zoho Corporation", category: "A" as Category, sector: "Software", listed: "Private", employees: "15,000+", approved: 41, updated: "04 Aug 2026" },
  { name: "Cognizant", category: "A" as Category, sector: "IT Services", listed: "Listed", employees: "340,000+", approved: 88, updated: "12 Aug 2026" },
  { name: "Larsen & Toubro", category: "A" as Category, sector: "Engineering", listed: "Listed", employees: "45,000+", approved: 57, updated: "20 Jul 2026" },
  { name: "Apollo Hospitals", category: "B" as Category, sector: "Healthcare", listed: "Listed", employees: "70,000+", approved: 34, updated: "20 Jul 2026" },
  { name: "Ashok Leyland", category: "B" as Category, sector: "Automotive", listed: "Listed", employees: "12,000+", approved: 29, updated: "18 Jun 2026" },
  { name: "Chennai Metro Rail Ltd", category: "B" as Category, sector: "Public Sector", listed: "Government", employees: "3,000+", approved: 18, updated: "18 Jun 2026" },
  { name: "Sri Lakshmi Traders", category: "C" as Category, sector: "Retail Trade", listed: "Proprietorship", employees: "40", approved: 2, updated: "02 May 2026" },
  { name: "Vetri Logistics", category: "C" as Category, sector: "Transport", listed: "Private", employees: "120", approved: 5, updated: "02 May 2026" },
];

export const rateGrid = [
  { band: "780+", catA: 8.75, catB: 9.15, catC: 10.25 },
  { band: "750 – 779", catA: 8.99, catB: 9.45, catC: 10.75 },
  { band: "700 – 749", catA: 9.25, catB: 9.85, catC: 11.25 },
  { band: "650 – 699", catA: 9.95, catB: 10.5, catC: 11.95 },
  { band: "Below 650", catA: 11.5, catB: 12.25, catC: 13.5 },
];

export const users = [
  { name: "Rajeev Menon", email: "rajeev.menon@cercit.in", role: "Credit Officer", limit: "Rs 10,00,000", branch: "Chennai — Anna Nagar", status: "Active" },
  { name: "Divya Ramesh", email: "divya.ramesh@cercit.in", role: "Credit Manager", limit: "Rs 25,00,000", branch: "Chennai — Regional", status: "Active" },
  { name: "Karthik Subramanian", email: "karthik.s@cercit.in", role: "Credit Officer", limit: "Rs 10,00,000", branch: "Coimbatore", status: "Active" },
  { name: "Meera Iyer", email: "meera.iyer@cercit.in", role: "Risk Analyst", limit: "—", branch: "Head Office", status: "Active" },
  { name: "Anand Gopal", email: "anand.gopal@cercit.in", role: "Administrator", limit: "—", branch: "Head Office", status: "Active" },
  { name: "Nithya Balan", email: "nithya.balan@cercit.in", role: "Credit Officer", limit: "Rs 10,00,000", branch: "Madurai", status: "Suspended" },
];

export const auditLog = [
  { time: "28 Aug 2026, 10:20 AM", user: "System", action: "Decision Made", app: "APP-2026-00847", details: "AI recommendation: Approve at 8.99% / 60 months", ip: "10.4.2.19" },
  { time: "28 Aug 2026, 10:16 AM", user: "Rajeev Menon", action: "Document Uploaded", app: "APP-2026-00847", details: "9 documents uploaded", ip: "10.4.2.19" },
  { time: "28 Aug 2026, 10:15 AM", user: "Rajeev Menon", action: "Application Created", app: "APP-2026-00847", details: "New car loan application", ip: "10.4.2.19" },
  { time: "28 Aug 2026, 09:02 AM", user: "Rajeev Menon", action: "Login", app: "—", details: "Successful sign-in", ip: "10.4.2.19" },
  { time: "27 Aug 2026, 6:41 PM", user: "Divya Ramesh", action: "Override", app: "APP-2026-00845", details: "Reject → Refer to Credit Manager", ip: "10.4.7.88" },
  { time: "27 Aug 2026, 5:55 PM", user: "Anand Gopal", action: "Policy Changed", app: "—", details: "FOIR limit changed from 55% to 50%", ip: "10.4.1.3" },
  { time: "27 Aug 2026, 3:30 PM", user: "Karthik Subramanian", action: "Decision Made", app: "APP-2026-00844", details: "Sanctioned Rs 9,80,000 at 8.99%", ip: "10.9.5.21" },
  { time: "26 Aug 2026, 7:10 PM", user: "Rajeev Menon", action: "Decision Made", app: "APP-2026-00843", details: "Rejected — Low CIBIL, High FOIR", ip: "10.4.2.19" },
  { time: "26 Aug 2026, 6:02 PM", user: "Meera Iyer", action: "Logout", app: "—", details: "Session ended", ip: "10.4.1.44" },
  { time: "25 Aug 2026, 11:48 AM", user: "System", action: "Document Uploaded", app: "APP-2026-00841", details: "Bank statement re-upload", ip: "—" },
];

export const auditActions = [
  "Application Created",
  "Decision Made",
  "Override",
  "Policy Changed",
  "Document Uploaded",
  "Login",
  "Logout",
];

export const makes: Record<string, string[]> = {
  "Maruti Suzuki": ["Swift", "Baleno", "Grand Vitara", "Brezza"],
  Hyundai: ["i20", "Venue", "Creta", "Verna"],
  Tata: ["Tiago", "Nexon", "Harrier", "Safari"],
  Mahindra: ["XUV300", "Scorpio N", "XUV700", "Thar"],
  Kia: ["Sonet", "Seltos", "Carens"],
  Toyota: ["Glanza", "Urban Cruiser", "Innova Hycross"],
  Honda: ["Amaze", "City", "Elevate"],
  MG: ["Astor", "Hector", "ZS EV"],
  Skoda: ["Kushaq", "Slavia"],
  VW: ["Taigun", "Virtus"],
  Jeep: ["Compass", "Meridian"],
  Renault: ["Kiger", "Triber"],
};

export const currentUser = {
  name: "Rajeev Menon",
  role: "Credit Officer",
  initials: "RM",
};
