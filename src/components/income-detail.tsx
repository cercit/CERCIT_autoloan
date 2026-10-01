import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { inr } from "@/lib/format";
import type { IncomeDetail, IncomeFlag } from "@/lib/staff-customer-api";
import { cn } from "@/lib/utils";

// The officer's view of income and bank detail (sql/054): the last three
// salary slips, Form 16 Part B and six months of the salary account, with
// plain-word flags. Cases without this detail render nothing.

const monthName = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : inr(n));

const SOURCE: Record<string, string> = {
  READER: "Read from the document",
  SIMULATED: "Simulated (demo)",
  STAFF: "Entered by staff",
};

const FLAG_TONE: Record<IncomeFlag["severity"], "destructive" | "warning" | "info"> = {
  danger: "destructive",
  warning: "warning",
  info: "info",
};

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn("px-3 py-1.5 text-right text-xs font-medium text-muted-foreground", className)}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-1.5 text-right tabular-nums", className)}>{children}</td>;
}

export function IncomeDetailCard({ data }: { data: IncomeDetail }) {
  const slips = [...(data.slips ?? [])].reverse(); // oldest first, like a statement
  const months = [...(data.bank_months ?? [])].reverse();
  const f = data.form16 ?? null;
  const s = data.summary ?? {};
  const flags = data.flags ?? [];
  const source = data.slips?.[0]?.source ?? data.bank_months?.[0]?.source ?? f?.source;
  const deductions = (x: (typeof slips)[number]) =>
    x.pf + x.professional_tax + x.tds + x.esi + x.other_deductions;

  return (
    <SectionCard
      title="Income and bank"
      description="The last three salary slips, Form 16 Part B and six months of the salary account. The credit check uses the middle slip value, the bank's average salary credit and the Form 16 total."
      action={
        source ? (
          <Pill tone={source === "SIMULATED" ? "warning" : "muted"}>
            {SOURCE[source] ?? source}
          </Pill>
        ) : null
      }
    >
      <div className="space-y-5">
        {flags.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {flags.map((fl) => (
              <li key={fl.code} className="flex items-start gap-2">
                {fl.severity === "info" ? (
                  <Info
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <TriangleAlert
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      fl.severity === "danger"
                        ? "text-destructive"
                        : "text-warning-foreground dark:text-warning",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span>
                  <Pill tone={FLAG_TONE[fl.severity]} className="mr-1.5">
                    {fl.severity === "danger"
                      ? "Check"
                      : fl.severity === "warning"
                        ? "Look"
                        : "Note"}
                  </Pill>
                  {fl.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {slips.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Salary slips
            </h3>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th className="text-left">Month</Th>
                    {slips.map((x) => (
                      <Th key={x.pay_month}>{monthName(x.pay_month)}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-3 py-1.5 text-muted-foreground">Gross pay</td>
                    {slips.map((x) => (
                      <Td key={x.pay_month}>{money(x.gross)}</Td>
                    ))}
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-1.5 text-muted-foreground">
                      PF, tax and other deductions
                    </td>
                    {slips.map((x) => (
                      <Td key={x.pay_month}>{money(deductions(x))}</Td>
                    ))}
                  </tr>
                  {slips.some((x) => x.employer_loan_recovery > 0) && (
                    <tr className="border-b border-border">
                      <td className="px-3 py-1.5 text-muted-foreground">Employer loan recovered</td>
                      {slips.map((x) => (
                        <Td key={x.pay_month}>{money(x.employer_loan_recovery)}</Td>
                      ))}
                    </tr>
                  )}
                  <tr className="border-b border-border font-medium">
                    <td className="px-3 py-1.5">Take-home</td>
                    {slips.map((x) => (
                      <Td key={x.pay_month}>
                        {money(x.net)}
                        {x.lop_days > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {x.lop_days} day{x.lop_days === 1 ? "" : "s"} loss of pay
                          </span>
                        )}
                        {x.arrears > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            includes {inr(x.arrears)} arrears
                          </span>
                        )}
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {s.slip_net_salary !== undefined && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Middle value used: {inr(s.slip_net_salary)}
                {s.slip_net_spread_pct !== undefined && ` · spread ${s.slip_net_spread_pct}%`}
                {s.slips_consecutive === false && " · not three months in a row"}
              </p>
            )}
          </div>
        )}

        {f && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Form 16 Part B
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Assessment year</dt>
                <dd className="tabular-nums">{f.assessment_year}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total income</dt>
                <dd className="tabular-nums">
                  {money(f.gross_total_income)}
                  <span className="block text-xs text-muted-foreground">
                    {money(Math.round(f.gross_total_income / 12))} a month
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">House property</dt>
                <dd className={cn("tabular-nums", f.house_property_income < 0 && "font-medium")}>
                  {f.house_property_income < 0
                    ? `Loss ${inr(-f.house_property_income)}`
                    : f.house_property_income > 0
                      ? money(f.house_property_income)
                      : "None"}
                  {f.house_property_income < 0 && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      usually home-loan interest
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Employer</dt>
                <dd className="truncate" title={f.employer_name ?? undefined}>
                  {f.employer_name ?? "—"}
                  {f.signature_valid === false && (
                    <span className="block text-xs text-destructive">signature not valid</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {months.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Salary account, month by month
            </h3>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th className="text-left">Month</Th>
                    <Th>Salary in</Th>
                    <Th>Day</Th>
                    <Th>EMIs out</Th>
                    <Th>Bounces</Th>
                    <Th>Average balance</Th>
                    <Th>Below Rs 5,000</Th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5">{monthName(m.month)}</td>
                      <Td className={cn(m.salary_credit === 0 && "text-destructive")}>
                        {m.salary_credit === 0 ? "None" : money(m.salary_credit)}
                      </Td>
                      <Td>{m.salary_day ?? "—"}</Td>
                      <Td>{m.emi_debits > 0 ? money(m.emi_debits) : "—"}</Td>
                      <Td className={cn(m.bounces > 0 && "font-medium text-destructive")}>
                        {m.bounces || "—"}
                      </Td>
                      <Td>{money(m.avg_balance)}</Td>
                      <Td
                        className={cn(
                          m.min_balance_breaches > 0 && "text-warning-foreground dark:text-warning",
                        )}
                      >
                        {m.min_balance_breaches > 0 ? `${m.min_balance_breaches} of 5 dates` : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.bank && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Average salary credit {money(s.bank.avg_salary)} · average balance{" "}
                {money(s.bank.avg_monthly_balance)} · balances checked on the 5th, 10th, 15th, 20th
                and 25th.
              </p>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
