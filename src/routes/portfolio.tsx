import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { getLoanPortfolio, type LoanPortfolio } from "@/lib/staff-customer-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Loan portfolio — cercit" },
      {
        name: "description",
        content: "How the disbursed car loan book is paying: days overdue, bounces, vintages and late rates by bureau score.",
      },
    ],
  }),
  component: PortfolioPage,
});

const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number | null | undefined) => (n == null ? "–" : `${Number(n).toFixed(1)}%`);
const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

// Severity of each overdue bucket, worst last
const BUCKET_TONE: Record<string, string> = {
  Current: "bg-success",
  "1-30": "bg-warning",
  "31-60": "bg-orange-500",
  "61-90": "bg-destructive/70",
  "90+": "bg-destructive",
};

function PortfolioPage() {
  const [data, setData] = useState<LoanPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getLoanPortfolio()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <AppShell
      title="Loan portfolio"
      subtitle="How the disbursed book is paying today. Late means the same here as in the credit rules: an instalment still unpaid past its due date."
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.totals.loans === 0 ? (
        <SectionCard title="No loans yet">
          <p className="text-sm text-muted-foreground">Nothing has been disbursed that you can see.</p>
        </SectionCard>
      ) : (
        <Portfolio data={data} />
      )}
    </AppShell>
  );
}

export function Portfolio({ data }: { data: LoanPortfolio }) {
  const t = data.totals;
  const maxBucket = Math.max(...data.buckets.map((b) => b.loans), 1);
  const months = data.bounces_by_month.map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div className="space-y-4">
      {data.stale_loans ? (
        <p className="text-xs text-muted-foreground">
          {data.stale_loans} loan{data.stale_loans === 1 ? " has" : "s have"} new payments not counted yet; they are added on the next visit or the daily run.
        </p>
      ) : null}
      {t.synthetic === t.loans && (
        <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          Every loan here is synthetic test data{data.includes_real ? "" : " (your login sees synthetic loans only)"}. Repayments follow a
          simulated pattern, so the figures show how the page works, not how real borrowers behave.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Loans on book" value={t.loans.toLocaleString("en-IN")} note={`${inr(t.disbursed)} paid out`} />
        <Stat label="Principal still owed" value={inr(t.principal_left)} note={`as of ${new Date(data.as_of).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`} />
        <Stat
          label="Overdue today"
          value={`${t.loans_overdue} loans`}
          note={`${inr(t.overdue_amount)} unpaid`}
          tone={t.loans_overdue > 0 ? "warning" : "success"}
        />
        <Stat
          label="PAR 30"
          value={pct(t.par_30_pct)}
          note="share of principal owed by loans more than 30 days overdue"
          tone={(t.par_30_pct ?? 0) > 3 ? "destructive" : (t.par_30_pct ?? 0) > 1 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Days overdue today" description="Each loan counted once, by its oldest unpaid instalment">
          <ul className="space-y-2.5">
            {data.buckets.map((b) => (
              <li key={b.bucket} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: "5.5rem 1fr 7.5rem" }}>
                <span className="font-medium">{b.bucket === "Current" ? "Current" : `${b.bucket} days`}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full", BUCKET_TONE[b.bucket])}
                    style={{ width: `${(b.loans / maxBucket) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{b.loans}</span> · {inr(b.principal_left)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Bounced instalments by month" description="Share of instalments due that month with at least one failed debit">
          {months.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instalments fell due in the last 12 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={months} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip
                  formatter={(v: number, _n, p) => [`${v}% (${p.payload.bounced} of ${p.payload.due})`, "Bounced"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="bounce_pct" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Late rate by bureau score at approval" description="Loans ever more than 30 days late">
          <Table
            head={["Score band", "Loans", "Ever 30+ late", "Rate"]}
            rows={data.by_score_band.map((b) => [b.band, b.loans, b.ever_30_plus, pct(b.ever_30_plus_pct)])}
          />
        </SectionCard>
        <SectionCard title="Late rate by the engine's recommendation" description="Approve went through on its own; Maybe was approved after review">
          <Table
            head={["Recommendation", "Loans", "Ever 30+ late", "Rate"]}
            rows={data.by_recommendation.map((r) => [
              r.recommendation === "APPROVE" ? "Approve" : r.recommendation === "MAYBE" ? "Maybe" : r.recommendation,
              r.loans,
              r.ever_30_plus,
              pct(r.ever_30_plus_pct),
            ])}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Vintages"
        description="Loans grouped by the quarter they were paid out. Older quarters have had longer to go wrong, so compare rates at similar months on book."
      >
        <Table
          head={["Paid out", "Loans", "Amount", "Months on book", "Ever 30+ late", "Rate"]}
          rows={data.vintages.map((v) => [
            v.quarter.replace("-", " "),
            v.loans,
            inr(v.disbursed),
            v.avg_months_on_book,
            v.ever_30_plus,
            pct(v.ever_30_plus_pct),
          ])}
        />
      </SectionCard>

      <SectionCard title="Needs attention" description="The most overdue loans right now, up to 15">
        {data.attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">No loan is overdue.</p>
        ) : (
          <Table
            head={["Loan", "Application", "Days overdue", "Unpaid", "Principal owed", "EMI", "Score"]}
            rows={data.attention.map((a) => [
              <span key="l" className="font-mono text-xs">{a.loan_account_no}</span>,
              <span key="a" className="flex items-center gap-1.5">
                <span className="font-mono text-xs">{a.application_id ?? "–"}</span>
                {a.synthetic && <Pill tone="muted">synthetic</Pill>}
              </span>,
              <Pill key="d" tone={a.dpd_now > 60 ? "destructive" : a.dpd_now > 30 ? "warning" : "info"}>
                {a.dpd_now} days
              </Pill>,
              inr(a.overdue_amount),
              inr(a.principal_left),
              inr(a.emi),
              a.bureau_score ?? "–",
            ])}
          />
        )}
      </SectionCard>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "success" | "warning" | "destructive";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tone && (
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive",
            )}
          />
        )}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn("px-2 py-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-2 tabular-nums", j > 0 && "text-right")}>
                  {j > 0 && typeof c !== "object" ? c : <span className={cn(j > 0 && "inline-flex justify-end")}>{c}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
