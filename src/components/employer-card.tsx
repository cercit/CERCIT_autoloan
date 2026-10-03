import { useEffect, useState } from "react";

import { LabelValue, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { CHECK_LABEL, getCaseEmployer, typeLabel, type CaseEmployer } from "@/lib/employer-api";
import { inr } from "@/lib/format";

const BASIS: Record<string, string> = {
  MASTER_VERIFIED: "from the Employer Master, verified",
  MASTER_PROVISIONAL: "from the Employer Master, not verified yet",
  DECLARED_TYPE: "provisional, from the kind of company the customer gave (employer not in the master)",
};

const tone = (r: string) => (r === "PASS" ? "success" : r === "FAIL" ? "destructive" : r === "REVIEW" ? "warning" : "muted") as
  | "success"
  | "destructive"
  | "warning"
  | "muted";

/** The case's employer, its category and the pricing it brought (fix list C8). */
export function EmployerCard({ applicationId }: { applicationId: string }) {
  const [d, setD] = useState<CaseEmployer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCaseEmployer(applicationId)
      .then(setD)
      .catch((e: Error) => setError(e.message));
  }, [applicationId]);

  if (error) {
    return (
      <SectionCard title="Employer">
        <p className="text-sm text-destructive">The employer could not be loaded: {error}</p>
      </SectionCard>
    );
  }
  if (!d) return null;
  const e = d.employer;
  const p = d.pricing;

  return (
    <SectionCard title="Employer" description={d.basis ? `Category ${d.category}: ${BASIS[d.basis] ?? d.basis}` : "Not assessed yet"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LabelValue label="Employer" value={e.found ? e.name : (d.declared_name ?? "—")} />
        <LabelValue label="Type" value={e.found && e.employer_type ? typeLabel(e.employer_type) : d.declared_type ? `${typeLabel(d.declared_type)} (as given)` : "—"} />
        <LabelValue
          label="Category"
          value={d.category ? <Pill tone={d.category === "A" ? "success" : d.category === "B" ? "warning" : "destructive"}>{d.category}</Pill> : "—"}
        />
        {p && (
          <>
            <LabelValue label="Rate" value={`${p.base_rate_pct}% + ${p.rate_loading_pct}% = ${p.rate_pct}%`} />
            <LabelValue label="Caps" value={`LTV ${p.ltv_cap_pct ?? "—"}% · tenure ${p.tenure_cap ?? "—"} months`} />
            <LabelValue label="Processing fee" value={p.processing_fee_inr != null ? inr(p.processing_fee_inr) : "—"} />
          </>
        )}
      </div>
      {e.found && e.caution && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">On the caution list: {e.caution_reason}</p>
      )}
      {e.found && e.checks && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border text-sm">
          {Object.entries(e.checks).map(([k, c]) => (
            <li key={k} className="flex items-start justify-between gap-3 p-2">
              <span>
                {CHECK_LABEL[k] ?? k}
                <span className="block text-xs text-muted-foreground">{c.note}</span>
              </span>
              <Pill tone={tone(c.result)}>{c.result === "NOT_APPLICABLE" ? "Not needed" : c.result === "REVIEW" ? "To check" : c.result.toLowerCase()}</Pill>
            </li>
          ))}
        </ul>
      )}
      {!e.found && (
        <p className="mt-3 text-xs text-muted-foreground">
          This employer isn't in the Employer Master yet. Add it there and run its checks to set a verified category.
        </p>
      )}
    </SectionCard>
  );
}
