import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer } from "lucide-react";
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

export const Route = createFileRoute("/applications/$id/approval")({
  head: ({ params }) => ({
    meta: [
      { title: `In-Principle Approval ${params.id} — cercit` },
      {
        name: "description",
        content:
          "Conditional loan approval letter — subject to verification, revocable until sanction.",
      },
    ],
  }),
  component: ApprovalLetter,
});

function ApprovalLetter() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<Application | null>(null);

  useEffect(() => {
    getApplication(id).then((result) => setApp(result ?? null));
  }, [id]);

  if (!app) {
    return (
      <AppShell title="In-Principle Approval" subtitle="Loading...">
        <div className="py-20 text-center text-muted-foreground">Loading application...</div>
      </AppShell>
    );
  }

  const today = new Date();
  const expiryDate = new Date(today);
  expiryDate.setDate(expiryDate.getDate() + 30);
  const emi = emiFor(app.loanAmount, app.rate, app.tenure);
  const refNo = `CVF/IPA/${today.getFullYear()}/${app.id.replace("APP-", "")}`;

  return (
    <AppShell
      title="In-Principle Approval"
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
          <Button variant="outline" onClick={() => downloadLetterPdf("approval-letter", `approval_${app.id}_${new Date().toISOString().split("T")[0]}.pdf`)}>
            <Download className="size-4" /> PDF
          </Button>
        </div>
      }
    >
      <LetterLayout id="approval-letter">
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
        <div className="mt-4 text-[11px]">
          <p className="font-semibold">To,</p>
          <p>{app.name}</p>
          <p className="text-slate-600">
            {app.address}
            <br />
            {app.city}, {app.state}
          </p>
        </div>

        {/* Subject */}
        <p className="mt-4 text-[11px] font-bold">
          Subject: In-Principle Approval for New Vehicle Loan — {app.id}
        </p>

        {/* Body */}
        <div className="mt-3 space-y-2.5 text-[10.5px]">
          <p>Dear {app.name.split(" ")[0]},</p>

          <p>
            With reference to your vehicle loan application dated {app.submitted}, we are
            pleased to convey that your application has received{" "}
            <span className="font-semibold">in-principle approval</span> on the indicative
            terms set out below.
          </p>

          {/* Indicative terms table */}
          <LetterTable
            rows={[
              ["Loan amount (indicative)", inr(app.loanAmount)],
              ["Rate of interest (indicative)", `${app.rate}% p.a. (reducing balance)`],
              ["Tenure", `${app.tenure} months`],
              ["Estimated EMI", inr(emi)],
              ["Vehicle", app.vehicle],
              ["Dealer", app.dealer],
              ["Ex-showroom price", inr(app.exShowroom)],
            ]}
          />

          <p className="font-semibold">Nature of this communication</p>
          <p>
            This letter is an in-principle indication of our willingness to extend credit
            and <span className="font-semibold">does not constitute</span> a sanction letter,
            a loan agreement, a commitment to disburse funds, or an authorisation to the
            dealer to deliver the vehicle. No rights, entitlements, or claims arise from
            this communication under the Indian Contract Act, 1872, or otherwise.
          </p>

          <p className="font-semibold">Conditions precedent</p>
          <p>Final sanction is subject to satisfactory completion of the following:</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-[10px] text-slate-700">
            <li>Verification of identity, address, and income documents in original</li>
            <li>Satisfactory credit bureau report at the time of sanction</li>
            <li>Vehicle invoice and insurance documentation from the authorised dealer</li>
            <li>Compliance with all applicable policy norms prevailing at the date of sanction</li>
            <li>Execution of the loan agreement, NACH mandate, and hypothecation undertaking</li>
            <li>
              Any other condition that {COMPANY.name} may stipulate prior to sanction
            </li>
          </ol>

          <p className="font-semibold">Validity and revocation</p>
          <p>
            This in-principle approval is valid for{" "}
            <span className="font-semibold">
              30 (thirty) calendar days from the date of this letter, or until a formal
              sanction letter is issued, whichever is earlier.
            </span>{" "}
            If the sanction letter is not issued within this period, the approval lapses
            automatically and a fresh application may be required.
          </p>
          <p>
            {COMPANY.name} reserves the right to revoke, modify, or withdraw this
            in-principle approval at any time, at its sole discretion, without assigning
            any reason and without any liability, in accordance with its internal credit
            policy and applicable RBI guidelines on Fair Practices Code (Master Direction
            DoR.FIN.REC.37/03.10.038/2024-25).
          </p>

          <p className="font-semibold">Disclaimer</p>
          <p>
            The terms stated above are indicative and may change upon final assessment.
            The actual loan amount, rate of interest, tenure, and other terms shall be
            as specified in the sanction letter and the Key Fact Statement (KFS) issued
            at the time of sanction, in compliance with the RBI circular on KFS dated
            15 April 2024 (RBI/2024-25/18). Please do not make any financial
            commitments or payments to the dealer on the basis of this letter alone.
          </p>
        </div>

        {/* Signature block */}
        <div className="mt-8 text-[10.5px]">
          <p className="font-semibold">For {COMPANY.name}</p>
          <div className="mt-10 w-48 border-t border-slate-400 pt-1">
            <p className="font-medium">{app.assignedTo}</p>
            <p className="text-[9px] text-slate-500">Credit Officer</p>
            <p className="text-[9px] text-slate-500">Branch: Chennai, Anna Nagar</p>
          </div>
        </div>

        {/* Acknowledgment strip */}
        <div className="mt-6 border border-dashed border-slate-400 bg-slate-50 px-3 py-2 text-[9px] text-slate-600">
          <p className="font-semibold text-slate-700">Borrower acknowledgment</p>
          <p>
            I have read and understood that this is an in-principle approval only, not a
            sanction or commitment to disburse. I understand that the final terms will be
            communicated in the sanction letter and KFS.
          </p>
          <div className="mt-3 flex gap-12">
            <div>
              <p className="text-slate-400">Signature: ____________________</p>
            </div>
            <div>
              <p className="text-slate-400">Date: ____________________</p>
            </div>
          </div>
        </div>
      </LetterLayout>
    </AppShell>
  );
}
