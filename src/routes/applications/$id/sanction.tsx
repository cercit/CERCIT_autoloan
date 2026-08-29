import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, Send, SquarePen } from "lucide-react";

import { AppShell, LabelValue, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { emiFor, inr } from "@/lib/format";
import { applications, getApplication } from "@/lib/mock-data";

export const Route = createFileRoute("/applications/$id/sanction")({
  head: ({ params }) => ({
    meta: [
      { title: `Sanction Letter ${params.id} — cercit` },
      {
        name: "description",
        content:
          "Preview, edit, download and send the formal car loan sanction letter with approved terms and vehicle details.",
      },
      { property: "og:title", content: `Sanction Letter ${params.id} — cercit` },
      {
        property: "og:description",
        content: "Formal sanction letter preview with approved terms and delivery options.",
      },
    ],
  }),
  component: SanctionLetter,
});

function SanctionLetter() {
  const { id } = Route.useParams();
  const app = getApplication(id) ?? applications[0];
  const emi = emiFor(app.loanAmount, app.rate, app.tenure);

  return (
    <AppShell
      title="Sanction Letter Preview"
      subtitle={`${app.id} · ${app.name}`}
      actions={
        <Button variant="outline" asChild>
          <Link to="/applications/$id" params={{ id: app.id }}>
            <ArrowLeft className="size-4" /> Back to application
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="panel p-6 text-sm leading-relaxed sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
                c
              </span>
              <div>
                <p className="text-base font-semibold">cercit Vehicle Finance Ltd</p>
                <p className="text-xs text-muted-foreground">
                  4th Floor, Sterling Towers, Anna Salai, Chennai 600002
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Date: 29 Aug 2026</p>
          </header>

          <div className="mt-6 space-y-1">
            <p className="font-medium">To,</p>
            <p>{app.name}</p>
            <p className="text-muted-foreground">
              {app.address}, {app.city}, {app.state}
            </p>
          </div>

          <p className="mt-6 font-semibold">
            Subject: Sanction of Car Loan — Application {app.id}
          </p>

          <p className="mt-4">Dear {app.name.split(" ")[0]},</p>
          <p className="mt-2">
            We are pleased to inform you that your car loan application has been approved with the
            following terms:
          </p>

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["Loan amount", inr(app.loanAmount)],
                  ["Interest rate", `${app.rate}% p.a. (reducing balance)`],
                  ["Tenure", `${app.tenure} months`],
                  ["Equated monthly instalment", inr(emi)],
                  ["Processing fee", inr(5000)],
                  ["Disbursement mode", "Direct transfer to dealer account"],
                  ["Vehicle", app.vehicle],
                  ["Dealer", app.dealer],
                ].map(([label, value], i) => (
                  <tr key={label} className={i % 2 === 1 ? "bg-surface-subtle" : undefined}>
                    <td className="w-1/2 px-4 py-2 text-muted-foreground">{label}</td>
                    <td className="px-4 py-2 font-medium">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5">
            <p className="font-medium">Conditions</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Comprehensive insurance with cercit Vehicle Finance Ltd as hypothecatee.</li>
              <li>Registration certificate to be endorsed with hypothecation within 30 days.</li>
              <li>NACH mandate to be registered on the salary account before disbursement.</li>
            </ul>
          </div>

          <p className="mt-5">
            This sanction is valid for 30 days from the date of this letter. Terms and conditions
            apply as per the loan agreement.
          </p>

          <div className="mt-10">
            <p className="font-medium">For cercit Vehicle Finance Ltd</p>
            <p className="mt-8 border-t border-border pt-2 text-xs text-muted-foreground">
              Authorised Signatory
            </p>
          </div>
        </article>

        <div className="space-y-4">
          <SectionCard title="Actions">
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <SquarePen className="size-4" /> Edit terms
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Download className="size-4" /> Download PDF
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => window.print()}
              >
                <Printer className="size-4" /> Print
              </Button>
              <Button className="w-full justify-start">
                <Send className="size-4" /> Send to customer
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Sanction summary">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <LabelValue label="Application" value={app.id} />
              <LabelValue label="Applicant" value={app.name} />
              <LabelValue label="Loan amount" value={inr(app.loanAmount)} />
              <LabelValue label="EMI" value={inr(emi)} />
              <LabelValue label="Valid till" value="28 Sep 2026" />
              <LabelValue label="Sanctioned by" value={app.assignedTo} />
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
