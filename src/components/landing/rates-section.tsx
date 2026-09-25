import { CheckCircle2, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RateGridData } from "@/lib/api";
import { fetchRateGrid } from "@/lib/engine";
import { inr } from "@/lib/format";
import { employerCategoryPricing, rateBands } from "@/lib/mock-data";

const FALLBACK: RateGridData = { bands: rateBands, categories: employerCategoryPricing };

const eligibility = [
  ["Employment", "Salaried, with a monthly salary credited to your bank account"],
  ["Age", "21 to 60 years"],
  ["CIBIL score", "650 or above. 750+ gets the best rate"],
  ["Repayment", "All EMIs, including this loan, within 50% of your take-home pay"],
  ["Loan amount", "Rs 1 lakh to Rs 50 lakh, new cars from authorised dealers"],
  ["Applicants", "Single applicant for now"],
] as const;

const documents = [
  "PAN card",
  "Aadhaar card",
  "Last 3 months' salary slips",
  "Last 6 months' bank statement (salary account)",
  "Form 16 for the last year",
  "Proforma invoice from the dealer",
] as const;

export function RatesSection() {
  const [grid, setGrid] = useState<RateGridData>(FALLBACK);

  useEffect(() => {
    let live = true;
    fetchRateGrid()
      .then((g) => {
        if (live && g.bands.length > 0) setGrid(g);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const bands = grid.bands.filter((b) => b.baseRate > 0);
  // The employer category also caps funding and tenure, so show what is actually reachable.
  const catMaxLtv = Math.max(...grid.categories.map((c) => c.maxLtvPct), 0) || Infinity;
  const catMaxTenure = Math.max(...grid.categories.map((c) => c.maxTenureMonths), 0) || Infinity;
  const fees = grid.categories.map((c) => c.processingFeeInr).filter((f) => f > 0);
  const feeRange =
    fees.length > 0
      ? Math.min(...fees) === Math.max(...fees)
        ? inr(Math.min(...fees))
        : `${inr(Math.min(...fees))} to ${inr(Math.max(...fees))}`
      : "Shown in your offer";

  const charges = [
    ["Processing fee", `${feeRange} + GST, depending on your employer category`],
    ["Prepayment and foreclosure", "Allowed after 6 EMIs. No charge on floating rate loans"],
    ["EMI bounce", "Rs 500 per bounced EMI"],
    ["Late payment", "2% a month on the overdue amount"],
    ["Stamp duty", "As per your state's rules"],
  ] as const;

  return (
    <section id="rates" className="mx-auto max-w-4xl px-4 py-20">
      <p className="section-eyebrow text-center">Rates and eligibility</p>
      <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Know the numbers before you apply
      </h2>

      <Tabs defaultValue="rates" className="mt-10">
        <TabsList className="mx-auto flex h-auto w-full max-w-md">
          <TabsTrigger value="rates" className="flex-1">
            Rates
          </TabsTrigger>
          <TabsTrigger value="eligibility" className="flex-1">
            Who can apply
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="panel mt-6 rounded-xl p-6">
          <div className="overflow-x-auto">
            <table className="rates-table">
              <thead>
                <tr>
                  <th scope="col">CIBIL score</th>
                  <th scope="col">Interest rate</th>
                  <th scope="col">Funding up to</th>
                  <th scope="col">Tenure up to</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.band}>
                    <td data-label="CIBIL score">{b.band}</td>
                    <td data-label="Interest rate" className="rate">
                      {b.baseRate.toFixed(2)}% p.a.
                    </td>
                    <td data-label="Funding up to">
                      {Math.min(b.maxLtvPct, catMaxLtv)}% of ex-showroom
                    </td>
                    <td data-label="Tenure up to">
                      {Math.min(b.maxTenureMonths, catMaxTenure)} months
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="charges-list">
            {charges.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">
            Demo rates and charges for illustration. A real lender gives you a Key Fact Statement
            with the exact all-in cost before you sign.
          </p>
        </TabsContent>

        <TabsContent value="eligibility" className="panel mt-6 rounded-xl p-6">
          <dl className="charges-list charges-list--standalone">
            {eligibility.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>

        <TabsContent value="documents" className="panel mt-6 rounded-xl p-6">
          <ul className="grid gap-3 sm:grid-cols-2">
            {documents.map((d) => (
              <li key={d} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {d}
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="size-3.5" aria-hidden="true" />
            Photos or PDFs from your phone are fine.
          </p>
        </TabsContent>
      </Tabs>
    </section>
  );
}
