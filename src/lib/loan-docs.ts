import type { Block, DocSpec } from "./doc-pdf";
import { inr } from "./format";
import type { AfterApproval, LoanOffer } from "./loan-api";

// The customer's loan documents, built from the database rows (sql/049) for
// the document maker (lib/doc-pdf.ts). One function per document; the same
// output serves the download button and the officer's copy.

const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => inr(n(v));
const money2 = (v: unknown) => inr(n(v), true);
const d = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function addressLines(a: AfterApproval): string[] {
  const c = a.customer;
  const ad = c.address;
  return [
    c.full_name,
    ...(ad
      ? [
          [ad.line1, ad.line2].filter(Boolean).join(", "),
          `${ad.city}${ad.state ? `, ${ad.state}` : ""} ${ad.pincode}`,
        ]
      : []),
  ];
}

function orgName(a: AfterApproval) {
  return a.org.legal_name || a.org.company_name || "cercit Vehicle Finance Ltd";
}

function vehicleName(a: AfterApproval) {
  const v = a.vehicle;
  return v
    ? [v.make, v.model, v.variant].filter(Boolean).join(" ")
    : (a.offer?.vehicle ?? "The vehicle");
}

/** Reducing-balance schedule, the same arithmetic as fn_staff_disburse. */
export function scheduleFor(o: LoanOffer, firstDue: string) {
  const r = n(o.rate_pct) / 1200;
  let bal = n(o.sanctioned_amount);
  const rows: {
    no: number;
    due: string;
    emi: number;
    principal: number;
    interest: number;
    balance: number;
  }[] = [];
  const start = new Date(`${firstDue}T00:00:00`);
  for (let i = 1; i <= o.tenure_months; i++) {
    const interest = Math.round(bal * r * 100) / 100;
    const principal = i === o.tenure_months ? bal : Math.round((n(o.emi) - interest) * 100) / 100;
    bal = Math.round((bal - principal) * 100) / 100;
    const due = new Date(start);
    due.setMonth(start.getMonth() + i - 1);
    rows.push({
      no: i,
      due: due.toISOString().slice(0, 10),
      emi: principal + interest,
      principal,
      interest,
      balance: bal,
    });
  }
  return rows;
}

function scheduleTable(
  rows: {
    no: number;
    due: string;
    emi: number;
    principal: number;
    interest: number;
    balance?: number;
  }[],
): Block {
  return {
    kind: "table",
    small: true,
    head: ["No.", "Due date", "Instalment", "Principal", "Interest", "Balance after"],
    widths: [0.6, 1.5, 1.3, 1.3, 1.2, 1.5],
    align: ["r", "l", "r", "r", "r", "r"],
    rows: rows.map((x) => [
      String(x.no),
      d(x.due),
      money2(x.emi),
      money2(x.principal),
      money2(x.interest),
      x.balance === undefined ? "" : money2(x.balance),
    ]),
  };
}

function withBalances(
  rows: { no: number; due: string; emi: number; principal: number; interest: number }[],
  amount: number,
) {
  let bal = amount;
  return rows.map((x) => {
    bal = Math.round((bal - n(x.principal)) * 100) / 100;
    return {
      ...x,
      emi: n(x.emi),
      principal: n(x.principal),
      interest: n(x.interest),
      balance: Math.max(0, bal),
    };
  });
}

function grievance(a: AfterApproval): Block {
  const o = a.org;
  return {
    kind: "note",
    title: "Complaints and grievances",
    text:
      `Write to ${o.support_email ?? "loans@cercit.in"} or call ${o.support_phone ?? ""}. If you are not satisfied within ` +
      `${(o as { grievance_reply_days?: number }).grievance_reply_days ?? 7} days, contact our Grievance Redressal Officer, ` +
      `${o.grievance_officer_name ?? ""}, ${o.grievance_officer_email ?? ""}, ${o.grievance_officer_phone ?? ""}. If the complaint is not resolved ` +
      `within 30 days, you may approach the RBI Ombudsman at https://cms.rbi.org.in.`,
  };
}

// SMA/NPA explained with the customer's own dates (RBI circular of 12 Nov 2021).
function smaExample(firstDue: string): string {
  const base = new Date(`${firstDue}T00:00:00`);
  const plus = (days: number) => {
    const x = new Date(base);
    x.setDate(x.getDate() + days);
    return d(x.toISOString().slice(0, 10));
  };
  return (
    `Example: if the instalment due on ${d(firstDue)} is not paid, the account is SMA-0 from ${plus(1)} (1 to 30 days overdue), ` +
    `SMA-1 from ${plus(31)} (31 to 60 days), SMA-2 from ${plus(61)} (61 to 90 days), and becomes a non-performing asset (NPA) on ${plus(91)}. ` +
    `The account returns to standard only when all overdue amounts, interest and charges are paid in full.`
  );
}

// ---------------------------------------------------------------------------
// Sanction letter
// ---------------------------------------------------------------------------

export function sanctionLetterSpec(a: AfterApproval): DocSpec {
  const o = a.offer!;
  const first = a.customer.full_name.split(" ")[0];
  return {
    title: "Sanction letter",
    ref: o.sanction_ref,
    date: new Date(o.issued_at),
    addressee: addressLines(a),
    subject: `Sanction of your car loan, application ${a.application.application_id}`,
    blocks: [
      { kind: "para", text: `Dear ${first},` },
      {
        kind: "para",
        text:
          `We are pleased to sanction your car loan on the terms below. The Key Facts Statement (KFS) sent with this letter sets out the full ` +
          `cost of the loan, including the Annual Percentage Rate, as required by the RBI (circular RBI/2024-25/18 of 15 April 2024). ` +
          `No charge that is not in the KFS will be collected from you.`,
      },
      { kind: "heading", text: "Loan terms" },
      {
        kind: "kv",
        rows: [
          ["Loan amount", money(o.sanctioned_amount)],
          ["Rate of interest", `${o.rate_pct}% a year, fixed, on reducing balance`],
          ["Annual Percentage Rate (APR)", `${o.apr_pct}% a year`],
          ["Tenure", `${o.tenure_months} months`],
          ["Monthly instalment (EMI)", money(o.emi)],
          [
            "EMI due date",
            `The ${o.emi_day}th of each month, starting the month after disbursement (at least 15 days after it)`,
          ],
          ["Repayment", "By e-NACH auto-debit from your bank account"],
        ],
      },
      { kind: "heading", text: "Vehicle and security" },
      {
        kind: "kv",
        rows: [
          ["Vehicle", vehicleName(a)],
          ["Dealer", o.dealer_name ?? a.vehicle?.dealer ?? "—"],
          ["On-road price", a.vehicle ? money(a.vehicle.on_road) : "—"],
          ["Security", `Hypothecation of the vehicle to ${orgName(a)}`],
        ],
      },
      { kind: "heading", text: "Charges and what reaches the dealer" },
      {
        kind: "kv",
        rows: [
          ["Processing fee", money(o.processing_fee)],
          ["Documentation charge", money(o.documentation_charge)],
          ["GST on fees (18%)", money2(o.gst_on_fees)],
          ["Stamp duty (estimated)", money(o.stamp_duty)],
          ["Total upfront charges", money2(o.total_upfront)],
          ["Paid to the dealer on disbursement", money2(o.net_disbursal)],
        ],
      },
      { kind: "heading", text: "Before we disburse" },
      {
        kind: "list",
        ordered: true,
        items: [
          "Accept this offer and the KFS, and sign the loan agreement online.",
          "Set up e-NACH auto-debit for the EMI from your bank account.",
          "Send the dealer's receipt for your down payment and the vehicle invoice showing the hypothecation to us.",
          `Send the comprehensive motor insurance policy with ${orgName(a)} as loss payee, for at least the first year.`,
          "No material change in your job, income or credit record before disbursement.",
        ],
      },
      { kind: "heading", text: "After disbursement" },
      {
        kind: "para",
        text:
          `Register the car with the hypothecation to us and send the RC within 30 days of registration. You may exit the loan within ` +
          `${o.cooling_off_days} days of disbursement (the cooling-off period) by repaying the principal and the proportionate APR, ` +
          `with no penalty.`,
      },
      {
        kind: "para",
        text: `This offer is open until ${d(o.valid_until)}. After that it lapses and a fresh offer is needed.`,
        bold: true,
      },
      grievance(a),
      {
        kind: "sign",
        parties: [
          {
            label: `For ${orgName(a)}`,
            name: o.officer ?? "Credit Officer",
            lines: ["Authorised signatory"],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Key Facts Statement (RBI format: Annex A parts 1 and 2, Annex B, Annex C)
// ---------------------------------------------------------------------------

export function kfsSpec(a: AfterApproval): DocSpec {
  const o = a.offer!;
  const rows = scheduleFor(o, o.indicative_first_emi);
  const accepted = o.status === "ACCEPTED" && o.accepted_at;
  return {
    title: "Key Facts Statement",
    ref: o.kfs_ref,
    date: new Date(o.issued_at),
    subject: `Car loan for ${a.customer.full_name}, application ${a.application.application_id}`,
    blocks: [
      {
        kind: "note",
        title: accepted ? `Accepted on ${when(o.accepted_at)}` : `Valid until ${d(o.valid_until)}`,
        text: accepted
          ? "You accepted this KFS online with the code we emailed you. Keep this copy with your loan papers."
          : "This statement is binding on us for the period above. Read it before you accept the loan. Charges not listed here cannot be collected.",
      },
      { kind: "heading", text: "Part 1. Interest rate, fees and charges" },
      {
        kind: "kv",
        rows: [
          [
            "1. Loan proposal number / type of loan",
            `${a.application.application_id} / New car loan (secured by hypothecation)`,
          ],
          ["2. Sanctioned loan amount", money(o.sanctioned_amount)],
          [
            "3. Disbursal schedule",
            "100% in one payment, to the dealer, after the conditions in the sanction letter are met",
          ],
          ["4. Loan term", `${o.tenure_months} months`],
          [
            "5. Instalments",
            `${o.tenure_months} equated monthly instalments of ${money(o.emi)}; first on or about ${d(o.indicative_first_emi)}`,
          ],
          ["6. Interest rate and type", `${o.rate_pct}% a year, fixed for the whole term`],
          ["7. Floating rate details", "Not applicable (fixed rate)"],
          [
            "8(A). Fees payable to us",
            `Processing fee ${money(o.processing_fee)}; documentation ${money(o.documentation_charge)}; GST ${money2(o.gst_on_fees)}. One-time, at disbursement.`,
          ],
          [
            "8(B). Collected for third parties",
            `Stamp duty ${money(o.stamp_duty)} (state government). Motor insurance is bought by you from the dealer or insurer; it is not financed.`,
          ],
          ["9. Annual Percentage Rate (APR)", `${o.apr_pct}% a year`],
          [
            "10(i). Penal charge for a missed EMI",
            `${money(o.penal_charge)} per missed instalment. Not compounded and not added to the interest.`,
          ],
          [
            "10(ii). Mandate (NACH) bounce",
            `${money(o.bounce_charge)} plus GST for each dishonoured debit`,
          ],
          [
            "10(iii). Foreclosure",
            `Allowed after ${o.foreclosure_lock_emis} EMIs; ${o.foreclosure_pct}% of the outstanding principal plus GST (fixed-rate loan)`,
          ],
          [
            "10(iv). Part-prepayment",
            `Allowed after ${o.foreclosure_lock_emis} EMIs, up to 25% of the outstanding a year without charge`,
          ],
          ["10(v). Duplicate NOC / statement", "Rs 500 each; the first NOC after closure is free"],
        ],
      },
      { kind: "heading", text: "Part 2. Other information" },
      {
        kind: "kv",
        rows: [
          [
            "1. Recovery agents",
            "Clause 12 of the loan agreement. Agents are named to you in advance, carry identity cards, and follow the RBI Fair Practices Code: no calls before 8 am or after 7 pm, no intimidation.",
          ],
          [
            "2. Grievance redressal",
            `${a.org.grievance_officer_name ?? ""}, ${a.org.grievance_officer_email ?? ""}, ${a.org.grievance_officer_phone ?? ""}. Reply within 7 days; if unresolved after 30 days, the RBI Ombudsman (cms.rbi.org.in).`,
          ],
          [
            "3. Transfer or securitisation",
            "The loan may be assigned or securitised. You will be told, and your terms do not change.",
          ],
          ["4. Co-lending", "Not applicable"],
          [
            "5. Cooling-off period",
            `${o.cooling_off_days} days from disbursement. Exit by repaying the principal and proportionate APR; no penalty.`,
          ],
          ["6. Lending service provider", "None. The loan is offered and serviced directly by us."],
        ],
      },
      { kind: "heading", text: "Annex B. How the APR is worked out" },
      {
        kind: "kv",
        rows: [
          ["Sanctioned amount (A)", money(o.sanctioned_amount)],
          ["Upfront charges (B)", money2(o.total_upfront)],
          ["Net amount disbursed (A - B)", money2(o.net_disbursal)],
          ["Number and amount of instalments", `${o.tenure_months} x ${money(o.emi)}`],
          ["Total interest", money2(o.total_interest)],
          ["Total amount you will pay (instalments + upfront charges)", money2(o.total_payable)],
          [
            "APR",
            `${o.apr_pct}% a year: the rate at which the ${o.tenure_months} instalments repay the net amount disbursed`,
          ],
        ],
      },
      { kind: "heading", text: "Annex C. Repayment schedule (indicative)" },
      {
        kind: "para",
        small: true,
        muted: true,
        text: "Dates assume disbursement in the coming days; the final schedule is sent with your welcome letter.",
      },
      scheduleTable(rows),
    ],
  };
}

// ---------------------------------------------------------------------------
// Loan agreement (built from the frozen snapshot, sql/049)
// ---------------------------------------------------------------------------

export function agreementSpec(
  snapshot: AfterApproval,
  meta: {
    ref: string;
    hash: string;
    template: string;
    signedAt?: string | null;
    signer?: string | null;
    codeAt?: string | null;
  },
): DocSpec {
  const a = snapshot;
  const o = a.offer!;
  const lender = orgName(a);
  const c = a.customer;
  const clause = (title: string, text: string): Block[] => [
    { kind: "heading", text: title },
    { kind: "para", text },
  ];
  return {
    title: "Loan agreement",
    ref: meta.ref,
    date: new Date(meta.signedAt ?? o.accepted_at ?? o.issued_at),
    subject: `Car loan of ${money(o.sanctioned_amount)}, application ${a.application.application_id}`,
    blocks: [
      {
        kind: "para",
        text:
          `This agreement is made between ${lender} (CIN ${a.org.cin ?? ""}, RBI Reg. No. ${a.org.rbi_registration_no ?? ""}), registered office ` +
          `${a.org.registered_address ?? ""} ("the Lender"), and ${c.full_name}${c.father_name ? `, child of ${c.father_name}` : ""}, ` +
          `PAN ${c.pan ?? ""}, residing at ${c.address ? `${c.address.line1}, ${c.address.city} ${c.address.pincode}` : "the address on record"} ("the Borrower").`,
      },
      ...clause(
        "1. The loan",
        `The Lender lends the Borrower ${money(o.sanctioned_amount)} to buy the vehicle in Schedule 2. The loan is paid in one amount to the dealer named there, after the conditions in the sanction letter ${o.sanction_ref} are met. The Key Facts Statement ${o.kfs_ref} accepted by the Borrower forms part of this agreement.`,
      ),
      ...clause(
        "2. Interest",
        `Interest is ${o.rate_pct}% a year, fixed, calculated monthly on the reducing balance. The Annual Percentage Rate, including all upfront charges, is ${o.apr_pct}% a year.`,
      ),
      ...clause(
        "3. Repayment",
        `The Borrower repays in ${o.tenure_months} equated monthly instalments of ${money(o.emi)}, due on the ${o.emi_day}th of each month from the month after disbursement (at least 15 days after it), by e-NACH auto-debit. The schedule is in the welcome letter and can be downloaded at any time.`,
      ),
      ...clause(
        "4. Fees and charges",
        `Only the charges listed in the Key Facts Statement are payable. Penal charges for a missed instalment are ${money(o.penal_charge)} each; they are not compounded and not added to the interest (RBI circular of 18 August 2023). A dishonoured mandate costs ${money(o.bounce_charge)} plus GST.`,
      ),
      ...clause(
        "5. Security",
        `The vehicle is hypothecated to the Lender as first and exclusive charge until the loan is fully repaid. The Borrower will register the vehicle with the hypothecation noted, send the registration certificate within 30 days of registration, and not sell, transfer, lease or pledge the vehicle without the Lender's written consent.`,
      ),
      ...clause(
        "6. Insurance",
        `The Borrower keeps the vehicle comprehensively insured for its full value throughout the loan, with the Lender as loss payee, and renews the policy before it lapses. Claim proceeds are applied first to the loan.`,
      ),
      ...clause(
        "7. Borrower's promises",
        `The Borrower confirms that the information and documents given are true, will tell the Lender within 15 days of any change of address, job or bank account, will use and maintain the vehicle lawfully, and will not use it for any unlawful purpose.`,
      ),
      ...clause(
        "8. Prepayment and foreclosure",
        `After ${o.foreclosure_lock_emis} instalments the Borrower may prepay part of the loan, or close it, on 7 days' notice. Foreclosure costs ${o.foreclosure_pct}% of the outstanding principal plus GST. Within ${o.cooling_off_days} days of disbursement the Borrower may exit by repaying the principal and the proportionate APR, with no penalty.`,
      ),
      ...clause(
        "9. Credit information and account status",
        `The Lender reports the loan to credit bureaus every month. ${smaExample(o.indicative_first_emi)}`,
      ),
      ...clause(
        "10. Events of default",
        `Each of these is an event of default: an instalment unpaid for 30 days after its due date; a material statement in the application found false; the vehicle sold, transferred, seized or destroyed without the loan being repaid; the insurance lapsing; the Borrower's insolvency.`,
      ),
      ...clause(
        "11. What the Lender may do on default",
        `After written notice and a reasonable time to pay, the Lender may recall the loan and enforce the hypothecation. Before repossession the Borrower gets at least 7 days' written notice; an inventory of the vehicle is made at repossession, and the Borrower may redeem it by paying the dues before it is sold. Any surplus from the sale is returned to the Borrower.`,
      ),
      ...clause(
        "12. Recovery",
        `Recovery follows the RBI Fair Practices Code. Agents are named to the Borrower in advance, carry identity cards, call only between 8 am and 7 pm, and never use intimidation or harassment. The Lender is responsible for its agents' conduct.`,
      ),
      ...clause(
        "13. Assignment",
        `The Lender may assign or securitise the loan under RBI rules after telling the Borrower; the Borrower's terms do not change. The Borrower may not assign the loan.`,
      ),
      ...clause(
        "14. Notices",
        `Notices go to the email and address on record. The Borrower may write to ${a.org.support_email ?? "the Lender"}.`,
      ),
      ...clause(
        "15. Complaints",
        `The Grievance Redressal Officer is ${a.org.grievance_officer_name ?? ""} (${a.org.grievance_officer_email ?? ""}). If a complaint is not resolved within 30 days the Borrower may approach the RBI Ombudsman.`,
      ),
      ...clause(
        "16. Law and courts",
        `This agreement is governed by Indian law. The courts at Chennai have jurisdiction, without limiting the Borrower's rights under consumer law.`,
      ),
      ...clause(
        "17. Electronic signature",
        `This agreement is signed electronically under the Information Technology Act, 2000. In this demo the Borrower signs by typing their full name and entering a one-time code sent to their email; a production service uses Aadhaar eSign through a licensed provider. The record kept with the signature includes the time of signing and a fingerprint (SHA-256) of this agreement's content.`,
      ),
      { kind: "heading", text: "Schedule 1. Loan details" },
      {
        kind: "kv",
        rows: [
          ["Application", a.application.application_id],
          ["Loan amount", money(o.sanctioned_amount)],
          ["Rate / APR", `${o.rate_pct}% fixed / ${o.apr_pct}%`],
          ["Tenure / EMI", `${o.tenure_months} months / ${money(o.emi)}`],
          ["Upfront charges", money2(o.total_upfront)],
          ["Amount paid to the dealer", money2(o.net_disbursal)],
        ],
      },
      { kind: "heading", text: "Schedule 2. The vehicle" },
      {
        kind: "kv",
        rows: [
          ["Vehicle", vehicleName(a)],
          [
            "Colour / fuel",
            [a.vehicle?.colour, a.vehicle?.fuel ? a.vehicle.fuel.charAt(0) + a.vehicle.fuel.slice(1).toLowerCase() : null].filter(Boolean).join(" / ") || "—",
          ],
          ["Dealer", o.dealer_name ?? a.vehicle?.dealer ?? "—"],
          ["On-road price", a.vehicle ? money(a.vehicle.on_road) : "—"],
        ],
      },
      { kind: "heading", text: "Signatures" },
      meta.signedAt
        ? {
            kind: "note",
            title: `Signed electronically by ${meta.signer} on ${when(meta.signedAt)}`,
            text: `Email code verified at ${when(meta.codeAt)}. Agreement fingerprint (SHA-256): ${meta.hash}. Template ${meta.template}. Demo signature, not Aadhaar eSign.`,
          }
        : {
            kind: "note",
            title: "Not signed yet",
            text: `Fingerprint of this version (SHA-256): ${meta.hash}. Template ${meta.template}.`,
          },
      {
        kind: "sign",
        parties: [
          {
            label: "The Borrower",
            name: c.full_name,
            lines: meta.signedAt ? [`Signed ${when(meta.signedAt)}`] : ["Signature pending"],
          },
          {
            label: `For ${lender}`,
            name: o.officer ?? "Authorised signatory",
            lines: ["Authorised signatory"],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// After disbursement
// ---------------------------------------------------------------------------

export function scheduleSpec(a: AfterApproval): DocSpec {
  const l = a.loan!;
  return {
    title: "Repayment schedule",
    ref: `${l.loan_account_no}/RS`,
    date: new Date(`${l.disbursed_on}T00:00:00`),
    subject: `Loan account ${l.loan_account_no}, ${a.customer.full_name}`,
    blocks: [
      {
        kind: "kv",
        rows: [
          ["Loan amount", money(l.disbursed_amount)],
          ["Rate", `${l.rate_pct}% a year, fixed, reducing balance`],
          ["EMI", `${money(l.emi)} on the ${l.installment_day}th of each month`],
          [
            "First / last EMI",
            `${d(l.first_emi_date)} / ${d(l.schedule[l.schedule.length - 1]?.due)}`,
          ],
        ],
      },
      scheduleTable(withBalances(l.schedule, n(l.disbursed_amount))),
    ],
  };
}

export function welcomeLetterSpec(a: AfterApproval): DocSpec {
  const l = a.loan!;
  const first = a.customer.full_name.split(" ")[0];
  return {
    title: "Welcome letter",
    ref: `${l.loan_account_no}/WL`,
    date: new Date(`${l.disbursed_on}T00:00:00`),
    addressee: addressLines(a),
    subject: `Your car loan account ${l.loan_account_no}`,
    blocks: [
      { kind: "para", text: `Dear ${first},` },
      {
        kind: "para",
        text: `Your car loan has been disbursed. Congratulations on your new ${vehicleName(a)}. Please keep this letter; it has the details you will need.`,
      },
      {
        kind: "kv",
        rows: [
          ["Loan account number", l.loan_account_no],
          ["Disbursed on", d(l.disbursed_on)],
          ["Loan amount", money(l.disbursed_amount)],
          ["EMI", money(l.emi)],
          ["First EMI", d(l.first_emi_date)],
          ["Number of EMIs", String(l.tenure_months)],
          [
            "Auto-debit",
            a.mandate
              ? `${a.mandate.bank_name}, account ${a.mandate.account}, UMRN ${a.mandate.umrn}`
              : "—",
          ],
        ],
      },
      { kind: "heading", text: "What to do now" },
      {
        kind: "list",
        items: [
          "Keep enough balance in your account a day before each EMI date. A bounced debit costs a charge and shows on your credit record.",
          "Register the car with the hypothecation to us and upload the RC within 30 days of registration, on the tracking page.",
          "Renew the car insurance every year with us as loss payee and upload the new policy.",
          "Tell us within 15 days if your address, job or bank account changes.",
        ],
      },
      { kind: "heading", text: "Your documents" },
      {
        kind: "para",
        text: "The sanction letter, Key Facts Statement, signed loan agreement, repayment schedule, e-NACH confirmation and disbursement advice are all on your tracking page to download at any time.",
      },
      grievance(a),
      {
        kind: "sign",
        parties: [
          {
            label: `For ${orgName(a)}`,
            name: "Customer Service",
            lines: [a.org.support_email ?? ""],
          },
        ],
      },
    ],
  };
}

export function disbursementAdviceSpec(a: AfterApproval): DocSpec {
  const l = a.loan!;
  const o = a.offer!;
  return {
    title: "Disbursement advice",
    ref: `${l.loan_account_no}/DA`,
    date: new Date(`${l.disbursed_on}T00:00:00`),
    addressee: addressLines(a),
    subject: `Payment of your car loan to ${l.paid_to}`,
    blocks: [
      { kind: "para", text: `We have paid your car loan to the dealer as below.` },
      {
        kind: "kv",
        rows: [
          ["Loan account", l.loan_account_no],
          ["Loan amount", money(l.disbursed_amount)],
          ["Less: upfront charges", money2(o.total_upfront)],
          ["Paid to", l.paid_to],
          ["Amount paid", money2(l.net_paid)],
          ["Date", d(l.disbursed_on)],
          [
            "Payment reference",
            `${l.payment_ref}${l.payment_ref.startsWith("SIM") ? " (simulated)" : ""}`,
          ],
        ],
      },
      {
        kind: "para",
        text: `Your cooling-off period runs for ${o.cooling_off_days} days from ${d(l.disbursed_on)}. If you want to exit the loan in that time, write to ${a.org.support_email ?? "us"}; you repay the principal and the proportionate APR, with no penalty.`,
      },
    ],
  };
}

export function mandateSpec(a: AfterApproval): DocSpec {
  const m = a.mandate!;
  return {
    title: "e-NACH mandate confirmation",
    ref: m.umrn,
    date: new Date(m.created_at),
    addressee: addressLines(a),
    subject: "Auto-debit set up for your car loan EMIs",
    blocks: [
      {
        kind: "kv",
        rows: [
          [
            "Mandate reference (UMRN)",
            `${m.umrn}${m.mode.includes("SIMULATED") ? " (simulated in this demo)" : ""}`,
          ],
          ["Account holder", m.holder_name],
          ["Bank / IFSC", `${m.bank_name} / ${m.ifsc}`],
          ["Account", `${m.account} (${m.account_type.toLowerCase()})`],
          ["Maximum per debit", money(m.max_amount)],
          ["Frequency", "Monthly, on the EMI date"],
          ["Valid", `${d(m.start_date)} to ${d(m.end_date)}`],
        ],
      },
      {
        kind: "para",
        text: "The mandate lets us debit the EMI and nothing else. The maximum amount only allows for a penal charge if an EMI is missed. You can ask us to cancel the mandate once the loan is closed.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The list the customer and the officer see
// ---------------------------------------------------------------------------

export interface LoanDoc {
  key: string;
  name: string;
  spec: () => DocSpec;
  file: string;
}

export function availableDocs(a: AfterApproval): LoanDoc[] {
  const app = a.application.application_id;
  const out: LoanDoc[] = [];
  if (a.offer) {
    out.push({
      key: "sanction",
      name: "Sanction letter",
      spec: () => sanctionLetterSpec(a),
      file: `sanction-letter_${app}.pdf`,
    });
    out.push({
      key: "kfs",
      name: "Key Facts Statement",
      spec: () => kfsSpec(a),
      file: `kfs_${app}.pdf`,
    });
  }
  if (a.agreement) {
    const g = a.agreement;
    out.push({
      key: "agreement",
      name: g.status === "SIGNED" ? "Loan agreement (signed)" : "Loan agreement (to sign)",
      spec: () =>
        agreementSpec(g.snapshot, {
          ref: g.agreement_ref,
          hash: g.content_hash,
          template: g.template_version,
          signedAt: g.signed_at,
          signer: g.signer_name,
          codeAt: g.code_verified_at,
        }),
      file: `loan-agreement_${app}.pdf`,
    });
  }
  if (a.mandate)
    out.push({
      key: "mandate",
      name: "e-NACH mandate confirmation",
      spec: () => mandateSpec(a),
      file: `enach-mandate_${app}.pdf`,
    });
  if (a.loan) {
    out.push({
      key: "disbursement",
      name: "Disbursement advice",
      spec: () => disbursementAdviceSpec(a),
      file: `disbursement-advice_${a.loan.loan_account_no}.pdf`,
    });
    out.push({
      key: "schedule",
      name: "Repayment schedule",
      spec: () => scheduleSpec(a),
      file: `repayment-schedule_${a.loan.loan_account_no}.pdf`,
    });
    out.push({
      key: "welcome",
      name: "Welcome letter",
      spec: () => welcomeLetterSpec(a),
      file: `welcome-letter_${a.loan.loan_account_no}.pdf`,
    });
  }
  return out;
}
