import type { DocSpec } from "./doc-pdf";
import { emiFor, inr } from "./format";
import type { AfterApproval, LoanOffer } from "./loan-api";
import { sanctionLetterSpec } from "./loan-docs";
import type { Application } from "./mock-data";

// PDFs for the staff letter pages that work from the older Application shape
// (applications/$id/approval and sanction). They use the same document maker
// and the same wording as the customer-journey documents.

function monthlyIrrApr(net: number, emi: number, months: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const pv = (emi * (1 - Math.pow(1 + mid, -months))) / mid;
    if (pv > net) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 10000) / 100;
}

function asAfterApproval(app: Application, offer: LoanOffer | null): AfterApproval {
  return {
    application: {
      application_id: app.id,
      status: "APPROVED",
      approval_stage: "FINAL",
      decided_at: null,
    },
    customer: {
      full_name: app.name,
      email: "",
      pan: app.pan ? `${app.pan.slice(0, 3)}XXXXX${app.pan.slice(8)}` : null,
      mobile: "",
      dob: null,
      father_name: null,
      address: { line1: app.address, line2: null, city: app.city, state: app.state, pincode: "" },
    },
    vehicle: {
      make: app.vehicle,
      model: "",
      variant: null,
      colour: null,
      fuel: null,
      dealer: app.dealer,
      ex_showroom: app.exShowroom,
      on_road: app.onRoad,
    },
    offer,
    agreement: null,
    mandate: null,
    loan: null,
    documents: [],
    org: {},
  };
}

/** Sanction letter from the staff page's application, charges as the page shows them. */
export function legacySanctionSpec(app: Application): DocSpec {
  const now = new Date();
  const emi = Math.round(emiFor(app.loanAmount, app.rate, app.tenure) * 100) / 100;
  const fee = Math.round(app.loanAmount * 0.01);
  const doc = 500;
  const gst = Math.round((fee + doc) * 0.18 * 100) / 100;
  const stamp = Math.round(app.loanAmount * 0.001);
  const upfront = fee + doc + gst + stamp;
  const valid = new Date(now);
  valid.setDate(valid.getDate() + 30);
  const first = new Date(now.getFullYear(), now.getMonth() + 2, 5);
  const offer: LoanOffer = {
    id: "legacy",
    version: 1,
    status: "ISSUED",
    expired: false,
    sanction_ref: `CVF/SL/${now.getFullYear()}/${app.id.replace("APP-", "")}`,
    kfs_ref: `CVF/KFS/${now.getFullYear()}/${app.id.replace("APP-", "")}`,
    sanctioned_amount: app.loanAmount,
    rate_pct: app.rate,
    rate_type: "FIXED",
    tenure_months: app.tenure,
    emi,
    processing_fee: fee,
    documentation_charge: doc,
    gst_on_fees: gst,
    stamp_duty: stamp,
    total_upfront: upfront,
    net_disbursal: app.loanAmount - upfront,
    apr_pct: monthlyIrrApr(app.loanAmount - upfront, emi, app.tenure),
    total_interest: Math.round((emi * app.tenure - app.loanAmount) * 100) / 100,
    total_payable: Math.round((emi * app.tenure + upfront) * 100) / 100,
    emi_day: 5,
    indicative_first_emi: first.toISOString().slice(0, 10),
    penal_charge: 500,
    bounce_charge: 500,
    foreclosure_pct: 4,
    foreclosure_lock_emis: 6,
    cooling_off_days: 3,
    dealer_name: app.dealer,
    vehicle: app.vehicle,
    valid_until: valid.toISOString().slice(0, 10),
    kfs_hash: "",
    issued_at: now.toISOString(),
    accepted_at: null,
    officer: app.assignedTo,
  };
  return sanctionLetterSpec(asAfterApproval(app, offer));
}

/** In-principle approval: indicative terms, not a sanction. */
export function legacyApprovalSpec(app: Application): DocSpec {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + 30);
  const first = app.name.split(" ")[0];
  return {
    title: "In-principle approval",
    ref: `CVF/IPA/${now.getFullYear()}/${app.id.replace("APP-", "")}`,
    date: now,
    addressee: [app.name, app.address, `${app.city}, ${app.state}`],
    subject: `In-principle approval for your car loan, application ${app.id}`,
    blocks: [
      { kind: "para", text: `Dear ${first},` },
      {
        kind: "para",
        text: `Your car loan application dated ${app.submitted} has been approved in principle on the indicative terms below.`,
      },
      {
        kind: "kv",
        rows: [
          ["Loan amount (indicative)", inr(app.loanAmount)],
          ["Rate of interest (indicative)", `${app.rate}% a year, reducing balance`],
          ["Tenure", `${app.tenure} months`],
          ["Estimated EMI", inr(emiFor(app.loanAmount, app.rate, app.tenure))],
          ["Vehicle", app.vehicle],
          ["Dealer", app.dealer],
          ["Ex-showroom price", inr(app.exShowroom)],
        ],
      },
      { kind: "heading", text: "What this letter is, and is not" },
      {
        kind: "para",
        text:
          "This is an in-principle indication that we are willing to lend. It is not a sanction letter, a loan agreement, a commitment to disburse, " +
          "or an instruction to the dealer to deliver the car. Please do not pay the dealer on the strength of this letter alone.",
      },
      { kind: "heading", text: "Before we can sanction the loan" },
      {
        kind: "list",
        ordered: true,
        items: [
          "Verification of your identity, address and income documents",
          "A satisfactory credit bureau report at the time of sanction",
          "The dealer's quotation or invoice for the car",
          "Our credit policy as it stands on the date of sanction",
        ],
      },
      { kind: "heading", text: "Validity" },
      {
        kind: "para",
        text:
          `This approval is valid until ${expiry.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}, or until a sanction ` +
          `letter is issued, whichever is earlier. The final amount, rate and charges will be in the sanction letter and the Key Facts Statement ` +
          `(RBI circular RBI/2024-25/18 of 15 April 2024).`,
      },
      {
        kind: "sign",
        parties: [
          {
            label: "For cercit Vehicle Finance Ltd",
            name: app.assignedTo,
            lines: ["Credit Officer"],
          },
        ],
      },
    ],
  };
}
