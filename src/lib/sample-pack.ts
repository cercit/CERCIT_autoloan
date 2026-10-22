// Sample documents for demo visitors (fix list L1, approved 22 Oct 2026).
// Builds a made-up set of KYC, income and car documents in the browser, in the
// visitor's own name, so nobody needs to upload a real Aadhaar or PAN. Every page
// says SPECIMEN · DEMO ONLY. Each visitor gets a fresh PAN, so no two clash
// (a PAN can sit on only one account). Laid out so the document readers can read them.
import type { jsPDF as JsPDF } from "jspdf";

export type SampleCase = "clean" | "review";

export interface SamplePerson {
  name: string;
  fatherName: string;
  dob: string; // dd/mm/yyyy
  pan: string;
  aadhaar: string; // 4-4-4
  address: string;
  employer: string;
  employerCity: string;
  tan: string;
  grossMonthly: number;
  netMonthly: number;
  existingEmi: number;
  caseType: SampleCase;
}

export interface SampleVehicle {
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  dealer_name?: string | null;
  ex_showroom?: number | null;
  on_road?: number | null;
}

/** doc_type -> files to upload (PDFs). */
export type SamplePack = Record<string, File[]>;

// --- made-up but stable per application ------------------------------------

function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const FATHERS = [
  "Ramesh",
  "Suresh",
  "Mahesh",
  "Prakash",
  "Venkatesh",
  "Ashok",
  "Rajendra",
  "Mohan",
  "Anil",
  "Sunil",
];
const EMPLOYERS: [string, string, string][] = [
  ["Bluepeak Software Pvt Ltd", "Bengaluru", "BLRB"],
  ["Riverstone Logistics Pvt Ltd", "Chennai", "CHER"],
  ["Meridian Health Services Pvt Ltd", "Hyderabad", "HYDM"],
  ["Northwind Analytics Pvt Ltd", "Pune", "PNEN"],
];
const PLACES: [string, string, string][] = [
  ["Anna Nagar", "Chennai, Tamil Nadu", "600040"],
  ["Indiranagar", "Bengaluru, Karnataka", "560038"],
  ["Kothrud", "Pune, Maharashtra", "411038"],
  ["Madhapur", "Hyderabad, Telangana", "500081"],
];

export function makeSamplePerson(input: {
  applicationId: string;
  fullName: string;
  caseType: SampleCase;
}): SamplePerson {
  const r = seeded(`${input.applicationId}:${input.caseType}`);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const letter = () => pick(LETTERS.split(""));
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");
  const words = input.fullName.trim().split(/\s+/);
  const surname = words[words.length - 1] ?? "Kumar";
  const pan = `${letter()}${letter()}${letter()}P${(surname[0] ?? "K").toUpperCase()}${digits(4)}${letter()}`;
  const aadhaarRaw = `${2 + Math.floor(r() * 8)}${digits(11)}`;
  const [employer, employerCity, tanPrefix] = pick(EMPLOYERS);
  const [area, cityState, pin] = pick(PLACES);
  const fatherName = `${pick(FATHERS)} ${surname}`;
  const day = 1 + Math.floor(r() * 27);
  const month = 1 + Math.floor(r() * 12);
  const year = 1984 + Math.floor(r() * 12);
  const clean = input.caseType === "clean";
  const gross = clean ? 120000 : 52000;
  return {
    name: words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" "),
    fatherName,
    dob: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    pan,
    aadhaar: `${aadhaarRaw.slice(0, 4)} ${aadhaarRaw.slice(4, 8)} ${aadhaarRaw.slice(8)}`,
    address: `S/O: ${fatherName}, No. ${1 + Math.floor(r() * 90)}, ${2 + Math.floor(r() * 20)}th Cross, ${area}, ${cityState} - ${pin}`,
    employer,
    employerCity,
    tan: `${tanPrefix}${digits(5)}${letter()}`,
    grossMonthly: gross,
    netMonthly: clean ? 98500 : 44800,
    existingEmi: clean ? 6500 : 14000,
    caseType: input.caseType,
  };
}

// --- drawing helpers ---------------------------------------------------------

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const dmy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function watermark(doc: JsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.saveGraphicsState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(44);
  doc.setTextColor(180, 0, 0);
  doc.text("SPECIMEN - DEMO ONLY", w / 2, h * 0.72, { angle: 30, align: "center" });
  doc.restoreGraphicsState();
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "SPECIMEN - DEMO ONLY. Made-up document generated by the cercit demo. Not valid for any purpose.",
    w / 2,
    h - 8,
    { align: "center" },
  );
}

function heading(doc: JsPDF, text: string, y: number, size = 15) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.text(text, 15, y);
  doc.setFont("helvetica", "normal");
}

function lines(doc: JsPDF, rows: string[], x: number, y: number, size = 11, gap = 7) {
  doc.setFontSize(size);
  rows.forEach((t, i) => doc.text(t, x, y + i * gap));
  return y + rows.length * gap;
}

/** A ruled table: the readers find tables more reliably with lines. */
function table(
  doc: JsPDF,
  x: number,
  y: number,
  widths: number[],
  rows: string[][],
  rowH = 6.5,
  rightCols: number[] = [],
) {
  doc.setFontSize(8.5);
  rows.forEach((row, ri) => {
    let cx = x;
    if (ri === 0) doc.setFont("helvetica", "bold");
    row.forEach((cell, ci) => {
      const w = widths[ci]!;
      doc.rect(cx, y, w, rowH);
      const right = rightCols.includes(ci) && ri > 0;
      doc.text(
        cell,
        right ? cx + w - 1.5 : cx + 1.5,
        y + rowH - 2,
        right ? { align: "right" } : undefined,
      );
      cx += w;
    });
    if (ri === 0) doc.setFont("helvetica", "normal");
    y += rowH;
  });
  return y;
}

function toFile(doc: JsPDF, name: string): File {
  return new File([doc.output("blob")], name, { type: "application/pdf" });
}

// --- the documents -------------------------------------------------------------

function panCard(J: typeof JsPDF, p: SamplePerson) {
  const doc = new J({ unit: "mm", format: "a4" });
  doc.setDrawColor(40);
  doc.roundedRect(15, 15, 120, 75, 3, 3);
  heading(doc, "PERMANENT ACCOUNT NUMBER CARD", 22, 11);
  lines(
    doc,
    [
      `Name: ${p.name.toUpperCase()}`,
      `Father's Name: ${p.fatherName.toUpperCase()}`,
      `Date of Birth: ${p.dob}`,
      `PAN: ${p.pan}`,
    ],
    20,
    38,
    11,
    9,
  );
  watermark(doc);
  return toFile(doc, "sample-pan.pdf");
}

function aadhaar(J: typeof JsPDF, p: SamplePerson) {
  const doc = new J({ unit: "mm", format: "a4" });
  doc.roundedRect(15, 15, 120, 70, 3, 3);
  heading(doc, "AADHAAR (SPECIMEN)", 22, 11);
  lines(doc, [`Name: ${p.name.toUpperCase()}`, `DOB: ${p.dob}`], 20, 36, 11, 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(p.aadhaar, 40, 76);
  doc.setFont("helvetica", "normal");
  doc.roundedRect(15, 100, 120, 70, 3, 3);
  heading(doc, "Address", 112, 11);
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(p.address.toUpperCase(), 105), 20, 121);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(p.aadhaar, 40, 160);
  watermark(doc);
  return toFile(doc, "sample-aadhaar.pdf");
}

function salarySlip(J: typeof JsPDF, p: SamplePerson, monthStart: Date) {
  const doc = new J({ unit: "mm", format: "a4" });
  const g = p.grossMonthly;
  const basic = Math.round(g * 0.5);
  const hra = Math.round(g * 0.2);
  const special = g - basic - hra;
  const pf = Math.round(basic * 0.12);
  const pt = 200;
  const tds = g - p.netMonthly - pf - pt;
  heading(doc, p.employer, 22);
  lines(doc, [`${p.employerCity}`, "PAYSLIP"], 15, 30, 10, 6);
  const month = `${MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
  lines(
    doc,
    [
      `Employee Name: ${p.name.toUpperCase()}`,
      `Company Name: ${p.employer}`,
      `For the month: ${month}`,
      `PAN: ${p.pan}`,
      `Designation: Senior Associate`,
    ],
    15,
    50,
    11,
    8,
  );
  let y = table(
    doc,
    15,
    95,
    [90, 50],
    [
      ["Earnings", "Amount (Rs)"],
      ["Basic Salary", basic.toLocaleString("en-IN")],
      ["HRA", hra.toLocaleString("en-IN")],
      ["Special Allowance", special.toLocaleString("en-IN")],
      ["Gross Salary", g.toLocaleString("en-IN")],
    ],
    8,
    [1],
  );
  y = table(
    doc,
    15,
    y + 6,
    [90, 50],
    [
      ["Deductions", "Amount (Rs)"],
      ["Provident Fund", pf.toLocaleString("en-IN")],
      ["Professional Tax", pt.toLocaleString("en-IN")],
      ["Income Tax (TDS)", tds.toLocaleString("en-IN")],
    ],
    8,
    [1],
  );
  lines(doc, [`Net Salary: ${p.netMonthly.toLocaleString("en-IN")}`], 15, y + 12, 12);
  watermark(doc);
  return toFile(
    doc,
    `sample-salary-slip-${MONTHS[monthStart.getMonth()]!.slice(0, 3).toLowerCase()}-${monthStart.getFullYear()}.pdf`,
  );
}

function bankStatement(J: typeof JsPDF, p: SamplePerson, months: Date[]) {
  const doc = new J({ unit: "mm", format: "a4" });
  heading(doc, "SPECIMEN BANK - ACCOUNT STATEMENT", 20, 13);
  const first = months[0]!;
  const lastM = months[months.length - 1]!;
  const end = new Date(lastM.getFullYear(), lastM.getMonth() + 1, 0);
  lines(
    doc,
    [
      `Account Holder: ${p.name.toUpperCase()}`,
      `Account No: XXXXXXXX${p.pan.slice(5, 9)}`,
      `Statement Period: ${dmy(first)} to ${dmy(end)}`,
    ],
    15,
    29,
    10,
    6,
  );
  const short = p.employer.replace(/ Pvt Ltd$/, "").toUpperCase();
  let bal = p.caseType === "clean" ? 140000 : 18000;
  const rows: string[][] = [["Date", "Description", "Debit", "Credit", "Balance"]];
  const add = (d: Date, desc: string, debit: number, credit: number) => {
    bal += credit - debit;
    rows.push([
      dmy(d),
      desc,
      debit ? debit.toLocaleString("en-IN") : "",
      credit ? credit.toLocaleString("en-IN") : "",
      bal.toLocaleString("en-IN"),
    ]);
  };
  months.forEach((m, i) => {
    const at = (d: number) => new Date(m.getFullYear(), m.getMonth(), d);
    add(at(1), `NEFT CR SALARY ${short}`, 0, p.netMonthly);
    add(at(5), "NACH DR LOAN EMI HOMECREDIT", p.existingEmi, 0);
    if (p.caseType === "review" && i === 3) add(at(6), "ECS RETURN CHG INSUFFICIENT FUNDS", 590, 0);
    add(at(9), "UPI GROCERY MART", 3200, 0);
    add(at(15), "ATM CASH WDL", 5000, 0);
    add(at(24), "CREDIT CARD PAYMENT", p.caseType === "clean" ? 9000 : 6000, 0);
  });
  table(doc, 15, 50, [24, 84, 24, 24, 24], rows, 6.2, [2, 3, 4]);
  watermark(doc);
  return toFile(doc, "sample-bank-statement-6-months.pdf");
}

function form16(J: typeof JsPDF, p: SamplePerson, today: Date) {
  const doc = new J({ unit: "mm", format: "a4" });
  const fyStart = today.getMonth() >= 3 ? today.getFullYear() - 1 : today.getFullYear() - 2;
  const ay = `${fyStart + 1}-${String((fyStart + 2) % 100).padStart(2, "0")}`;
  const gross = p.grossMonthly * 12;
  const std = 75000;
  const viA = 150000;
  const total = gross - std - viA;
  const tds = Math.max(
    0,
    Math.round(
      (p.grossMonthly - p.netMonthly - Math.round(p.grossMonthly * 0.5 * 0.12) - 200) * 12,
    ),
  );
  heading(doc, "FORM NO. 16 - PART B (SPECIMEN)", 20, 13);
  lines(
    doc,
    [
      `Name of the Employee: ${p.name.toUpperCase()}`,
      `PAN of the Employee: ${p.pan}`,
      `Name and address of the Employer: ${p.employer}, ${p.employerCity}`,
      `TAN of the Deductor: ${p.tan}`,
      `Assessment Year: ${ay}`,
    ],
    15,
    32,
    10.5,
    8,
  );
  table(
    doc,
    15,
    80,
    [120, 50],
    [
      ["Particulars", "Amount (Rs)"],
      ["Gross Salary", gross.toLocaleString("en-IN")],
      ["Standard deduction", std.toLocaleString("en-IN")],
      ["Income under the head Salaries", (gross - std).toLocaleString("en-IN")],
      ["Deductions under Chapter VI-A", viA.toLocaleString("en-IN")],
      ["Total Income", total.toLocaleString("en-IN")],
      ["Tax deducted at source", tds.toLocaleString("en-IN")],
    ],
    8,
    [1],
  );
  watermark(doc);
  return toFile(doc, `sample-form16-part-b-ay-${ay}.pdf`);
}

function quotation(J: typeof JsPDF, p: SamplePerson, v: SampleVehicle | null, today: Date) {
  const doc = new J({ unit: "mm", format: "a4" });
  const ex = v?.ex_showroom && v.ex_showroom > 0 ? v.ex_showroom : 850000;
  const insurance = Math.round(ex * 0.04);
  const rto = Math.round(ex * 0.08);
  const onRoad = v?.on_road && v.on_road > ex ? v.on_road : ex + insurance + rto;
  const valid = new Date(today);
  valid.setDate(valid.getDate() + 30);
  heading(doc, `${v?.dealer_name || "Specimen Motors"} - PROFORMA QUOTATION`, 20, 13);
  lines(
    doc,
    [
      `Customer: ${p.name.toUpperCase()}`,
      `Vehicle: ${[v?.make, v?.model, v?.variant].filter(Boolean).join(" ") || "Specimen Hatchback VXi"}`,
      `Quote date: ${dmy(today)}`,
      `Valid until: ${dmy(valid)}`,
    ],
    15,
    32,
    11,
    8,
  );
  table(
    doc,
    15,
    72,
    [110, 50],
    [
      ["Item", "Amount (Rs)"],
      ["Ex-showroom price", ex.toLocaleString("en-IN")],
      ["Insurance (1 year)", insurance.toLocaleString("en-IN")],
      ["Registration and road tax", rto.toLocaleString("en-IN")],
      ["On-road price", Math.round(onRoad).toLocaleString("en-IN")],
    ],
    8,
    [1],
  );
  watermark(doc);
  return toFile(doc, "sample-vehicle-quotation.pdf");
}

/** The whole pack. jsPDF loads only when asked for. */
export async function makeSamplePack(
  person: SamplePerson,
  vehicle: SampleVehicle | null,
  today = new Date(),
): Promise<SamplePack> {
  const { jsPDF: J } = await import("jspdf");
  const monthsBack = (n: number) =>
    Array.from({ length: n }, (_, i) => new Date(today.getFullYear(), today.getMonth() - n + i, 1));
  return {
    PAN: [panCard(J, person)],
    AADHAAR: [aadhaar(J, person)],
    SALARY_SLIP: monthsBack(3).map((m) => salarySlip(J, person, m)),
    FORM16_B: [form16(J, person, today)],
    BANK_STMT: [bankStatement(J, person, monthsBack(6))],
    QUOTE: [quotation(J, person, vehicle, today)],
  };
}

export const SAMPLE_LABEL: Record<SampleCase, string> = {
  clean: "Clean case (comfortable salary)",
  review: "Case for review (tight salary, one bounced EMI)",
};
export { rs as sampleRupees };
