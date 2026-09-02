import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  COMPANY,
  LetterLayout,
  LetterTable,
  formatLetterDate,
} from "@/components/letter-layout";
import { Button } from "@/components/ui/button";
import { emiFor, inr } from "@/lib/format";
import { downloadLetterPdf } from "@/lib/pdf";
import { getApplication } from "@/lib/api";
import type { Application } from "@/lib/mock-data";

export const Route = createFileRoute("/applications/$id/sanction")({
  head: ({ params }) => ({
    meta: [
      { title: `Sanction Letter ${params.id} — cercit` },
      {
        name: "description",
        content:
          "Formal vehicle loan sanction letter with approved terms, KFS reference, and RBI-mandated disclosures.",
      },
    ],
  }),
  component: SanctionLetter,
});

function computeApr(
  principal: number,
  annualRate: number,
  months: number,
  processingFee: number,
): string {
  const netDisbursed = principal - processingFee;
  const monthlyRate = annualRate / 12 / 100;
  const emi =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);

  let lo = annualRate / 100;
  let hi = (annualRate + 10) / 100;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const r = mid / 12;
    const pv =
      r === 0
        ? emi * months
        : (emi * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
    if (pv > netDisbursed) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2 * 100).toFixed(2);
}

function SanctionLetter() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<Application | null>(null);

  useEffect(() => {
    getApplication(id).then((result) => setApp(result ?? null));
  }, [id]);

  if (!app) {
    return (
      <AppShell title="Sanction Letter" subtitle="Loading...">
        <div className="py-20 text-center text-muted-foreground">Loading application...</div>
      </AppShell>
    );
  }

  const today = new Date();
  const validTill = new Date(today);
  validTill.setDate(validTill.getDate() + 30);
  const emi = emiFor(app.loanAmount, app.rate, app.tenure);
  const processingFee = Math.round(app.loanAmount * 0.01);
  const documentationFee = 500;
  const stampDuty = Math.round(app.loanAmount * 0.001);
  const apr = computeApr(app.loanAmount, app.rate, app.tenure, processingFee);
  const refNo = `CVF/SL/${today.getFullYear()}/${app.id.replace("APP-", "")}`;
  const totalCharges = processingFee + documentationFee + stampDuty;
  const netDisbursement = app.loanAmount - totalCharges;

  return (
    <AppShell
      title="Sanction Letter"
      subtitle={`${app.id} · ${app.name}`}
      actions={
        <div className="no-print flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/applications/$id" params={{ id: app.id }}>
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button variant="outline" onClick={() => downloadLetterPdf("sanction-letter", `sanction_${app.id}_${new Date().toISOString().split("T")[0]}.pdf`)}>
            <Download className="size-4" /> PDF
          </Button>
          <Button>
            <Send className="size-4" /> Send to customer
          </Button>
        </div>
      }
    >
      <LetterLayout id="sanction-letter" showGrievance>
        {/* Reference and date */}
        <div className="flex justify-between text-[10.5px]">
          <div>
            <p>
              <span className="text-slate-500">Ref:</span>{" "}
              <span className="font-medium">{refNo}</span>
            </p>
            <p>
              <span className="text-slate-500">Application No.:</span>{" "}
              <span className="font-medium">{app.id}</span>
            </p>
          </div>
          <p>
            <span className="text-slate-500">Date:</span>{" "}
            <span className="font-medium">{formatLetterDate(today)}</span>
          </p>
        </div>

        {/* Addressee */}
        <div className="mt-3 text-[11px]">
          <p className="font-semibold">To,</p>
          <p>{app.name}</p>
          <p className="text-slate-600">
            {app.address}
            <br />
            {app.city}, {app.state}
          </p>
          {app.pan && (
            <p className="text-[10px] text-slate-500">
              PAN: {app.pan.substring(0, 3)}XXXXX{app.pan.substring(8)}
            </p>
          )}
        </div>

        {/* Subject */}
        <p className="mt-3 text-[11px] font-bold">
          Subject: Sanction of New Vehicle Loan — {app.id}
        </p>

        {/* Body */}
        <div className="mt-2.5 space-y-2 text-[10.5px]">
          <p>Dear {app.name.split(" ")[0]},</p>

          <p>
            Further to your vehicle loan application and upon satisfactory completion
            of all verifications, we are pleased to sanction a vehicle loan on the
            terms and conditions set out below. A Key Fact Statement (KFS) as required
            under RBI Circular RBI/2024-25/18 dated 15 April 2024 is enclosed
            separately.
          </p>

          {/* Section A: Loan terms */}
          <p className="font-bold text-slate-900">A. Sanctioned loan terms</p>
          <LetterTable
            rows={[
              ["Sanctioned loan amount", inr(app.loanAmount)],
              [
                "Rate of interest",
                `${app.rate}% p.a. fixed (reducing balance method)`,
              ],
              ["Annual Percentage Rate (APR)", `${apr}% p.a.`],
              ["Loan tenure", `${app.tenure} months`],
              ["Equated Monthly Instalment (EMI)", inr(emi)],
              ["EMI commencement", "30 days from disbursement"],
              ["Repayment mode", "NACH / ECS auto-debit from salary account"],
            ]}
          />

          {/* Section B: Vehicle details */}
          <p className="font-bold text-slate-900">B. Vehicle and collateral</p>
          <LetterTable
            rows={[
              ["Vehicle", app.vehicle],
              ["Authorised dealer", app.dealer],
              ["Ex-showroom price", inr(app.exShowroom)],
              ["On-road price", inr(app.onRoad)],
              ["LTV (ex-showroom)", `${app.ltvExShowroom}%`],
              ["Security", "Hypothecation of the vehicle in favour of " + COMPANY.name],
            ]}
          />

          {/* Section C: Fees and charges */}
          <p className="font-bold text-slate-900">C. Fees, charges, and disbursement</p>
          <LetterTable
            rows={[
              ["Processing fee (1% of loan amount)", inr(processingFee)],
              ["Documentation charges", inr(documentationFee)],
              ["Stamp duty (estimated)", inr(stampDuty)],
              ["Total upfront charges", inr(totalCharges)],
              ["Net disbursement to dealer", inr(netDisbursement)],
              ["Disbursement mode", "Direct credit to dealer's designated account"],
            ]}
          />

          {/* Section D: Conditions */}
          <p className="font-bold text-slate-900">D. Conditions for disbursement</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-[10px] text-slate-700">
            <li>
              Execution of the loan agreement and all ancillary documents.
            </li>
            <li>
              Registration of NACH / ECS mandate on the borrower's salary account
              ({app.salaryBank}).
            </li>
            <li>
              Comprehensive motor insurance policy for the full loan tenure with{" "}
              {COMPANY.name} noted as loss payee and hypothecatee.
            </li>
            <li>
              Vehicle Registration Certificate (RC) to be endorsed with hypothecation
              in favour of {COMPANY.name} within 30 days of registration.
            </li>
            <li>
              Delivery of original vehicle invoice and insurance certificate by the
              dealer.
            </li>
            <li>
              No material adverse change in the borrower's employment, income, or
              credit profile between the date of this letter and the date of
              disbursement.
            </li>
          </ol>

          {/* Section E: Prepayment and foreclosure */}
          <p className="font-bold text-slate-900">E. Prepayment and foreclosure</p>
          <p className="text-[10px]">
            Part-prepayment or full foreclosure is permitted after a lock-in period
            of 6 EMIs. No foreclosure charge shall apply to individual borrowers
            availing floating-rate loans, as per RBI guidelines. For fixed-rate loans,
            a foreclosure charge of 4% of the outstanding principal shall apply, plus
            applicable GST. Partial prepayments shall reduce the outstanding principal;
            the EMI amount or tenure will be revised accordingly.
          </p>

          {/* Section F: Penal charges */}
          <p className="font-bold text-slate-900">F. Penal charges</p>
          <p className="text-[10px]">
            In the event of default in repayment, a penal charge of Rs 500 per
            instance of EMI bounce shall be levied, in accordance with RBI circular
            DoR.MCS.REC.28/01.01.001/2023-24 dated 18 August 2023. These charges
            are not compounded and shall not be debited to the loan account. Penal
            charges are levied for non-compliance with material terms; no additional
            penal interest is charged over and above the contracted rate.
          </p>

          {/* Section G: Cooling-off period */}
          <p className="font-bold text-slate-900">G. Cooling-off / look-up period</p>
          <p className="text-[10px]">
            You have the right to exit this loan within 3 calendar days of
            disbursement ("cooling-off period") by repaying the principal disbursed
            along with proportionate APR charges for the period the funds were
            utilised. No prepayment penalty or additional charges will apply during
            this period, in compliance with the RBI Digital Lending Directions, 2025.
          </p>

          {/* Section H: General terms */}
          <p className="font-bold text-slate-900">H. General</p>
          <ul className="ml-4 list-disc space-y-0.5 text-[10px] text-slate-700">
            <li>
              This sanction is valid until{" "}
              <span className="font-semibold">{formatLetterDate(validTill)}</span>.
              If the loan is not disbursed within this period, the sanction shall
              lapse and a fresh assessment may be required.
            </li>
            <li>
              The loan shall be governed by the detailed terms and conditions in
              the loan agreement executed between the parties.
            </li>
            <li>
              Any dispute arising shall be subject to the exclusive jurisdiction of
              the courts at Chennai, Tamil Nadu.
            </li>
            <li>
              {COMPANY.name} may assign, transfer, or securitise the loan in
              accordance with applicable RBI regulations, with prior intimation to the
              borrower.
            </li>
          </ul>

          {/* Validity */}
          <p className="mt-1 text-[10px] font-semibold">
            Please confirm acceptance by signing and returning a copy of this letter
            within the validity period. Disbursement shall follow upon receipt of your
            acceptance and fulfilment of all conditions stated above.
          </p>
        </div>

        {/* Signature block */}
        <div className="mt-6 text-[10.5px]">
          <p className="font-semibold">For {COMPANY.name}</p>
          <div className="mt-10 w-48 border-t border-slate-400 pt-1">
            <p className="font-medium">{app.assignedTo}</p>
            <p className="text-[9px] text-slate-500">Credit Officer</p>
            <p className="text-[9px] text-slate-500">Branch: Chennai, Anna Nagar</p>
          </div>
        </div>

        {/* Borrower acceptance */}
        <div className="mt-4 border border-dashed border-slate-400 bg-slate-50 px-3 py-2 text-[9px] text-slate-600">
          <p className="font-semibold text-slate-700">Borrower acceptance</p>
          <p>
            I, {app.name}, have read and understood the terms of this sanction letter.
            I have received the Key Fact Statement (KFS) and acknowledge its contents,
            including the Annual Percentage Rate of {apr}% p.a. I accept the loan on
            the terms stated herein and undertake to comply with all conditions for
            disbursement and repayment.
          </p>
          <div className="mt-3 flex gap-8">
            <div>
              <p className="text-slate-400">Signature: ________________________</p>
            </div>
            <div>
              <p className="text-slate-400">Date: ________________________</p>
            </div>
            <div>
              <p className="text-slate-400">Place: ________________________</p>
            </div>
          </div>
        </div>
      </LetterLayout>
    </AppShell>
  );
}
