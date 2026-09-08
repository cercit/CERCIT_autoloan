import { inr, pct } from "./format";

export interface AgreementInput {
  applicantName: string;
  applicantAge: number;
  pan: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleSegment: string;
  exShowroom: number;
  onRoad: number;
  loanAmount: number;
  tenureMonths: number;
  ratePercent: number;
  emi: number;
  processingFeePercent?: number;
}

export interface AgreementClause {
  title: string;
  content: string;
}

export interface AgreementData {
  referenceNumber: string;
  generatedAt: string;
  clauses: AgreementClause[];
}

function generateReferenceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hex = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0").toUpperCase();
  return `AGR-${dateStr}-${hex}`;
}

export function generateAgreement(input: AgreementInput): AgreementData {
  const clauses: AgreementClause[] = [
    {
      title: "1. Loan Details",
      content: `Borrower: ${input.applicantName} (Age: ${input.applicantAge}, PAN: ${input.pan}). Lender grants a vehicle loan of ${inr(input.loanAmount)} for purchase of ${input.vehicleMake} ${input.vehicleModel} (${input.vehicleSegment}). Tenure: ${input.tenureMonths} months. Rate of interest: ${pct(input.ratePercent)} per annum (fixed). EMI: ${inr(input.emi)} payable on the 5th of each month via NACH.`,
    },
    {
      title: "2. Vehicle Details",
      content: `Vehicle: ${input.vehicleMake} ${input.vehicleModel}, Segment: ${input.vehicleSegment}. Ex-showroom price: ${inr(input.exShowroom)}. On-road price: ${inr(input.onRoad)}. Vehicle identification details to be registered with RTO and hypothecated in favor of the lender.`,
    },
    {
      title: "3. Disbursement",
      content: `Loan amount of ${inr(input.loanAmount)} will be disbursed directly to the authorized dealer upon verification of vehicle invoice, insurance cover note, and registration application. No cash component will be disbursed to borrower.`,
    },
    {
      title: "4. Repayment",
      content: `Equated Monthly Installment (EMI) of ${inr(input.emi)} is payable monthly, commencing one month from disbursement date. Payments are debited via NACH mandate registered on borrower's bank account. Late payment attracts penal interest.`,
    },
    {
      title: "5. Processing Fee",
      content: `Processing fee of ${(input.processingFeePercent ?? 1).toFixed(2)}% (${inr(Math.round(input.loanAmount * (input.processingFeePercent ?? 1) / 100))}) is deducted from the loan amount at disbursement.`,
    },
    {
      title: "6. Prepayment",
      content: `Prepayment of principal is permitted only after 6 monthly installments have been paid. A prepayment charge of 2% on the prepaid amount applies. Partial prepayment is allowed in multiples of EMI amount.`,
    },
    {
      title: "7. Default Penalties",
      content: `Default on EMI: 2% per month penal interest on overdue amount. Bounced NACH: charge of 18% of EMI amount plus bank bounce fee. Severe delay (>90 days) triggers recovery proceedings and CIBIL reporting.`,
    },
    {
      title: "8. Insurance",
      content: `Comprehensive motor insurance covering the full on-road value (${inr(input.onRoad)}) is mandatory for the loan tenure. Insurance must name the lender as the first loss payee. Borrower bears all renewal costs.`,
    },
    {
      title: "9. Hypothecation",
      content: `The vehicle and any accessories financed through this loan remain hypothecated to the lender until full repayment. Borrower shall not sell, transfer, or encumber the vehicle without written consent. The lender reserves right to repossess upon default.`,
    },
    {
      title: "10. Jurisdiction",
      content: `This agreement is governed by Indian law. Any disputes arising shall be subject to the jurisdiction of courts in the city of loan disbursement. Borrower confirms all information provided is accurate and consents to verification.`,
    },
  ];

  return { referenceNumber: generateReferenceNumber(), generatedAt: new Date().toISOString(), clauses };
}
