import { Link, createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/format";
import { FACE_TEXT, STATUS_TEXT, getCustomerQueue, type QueueRow } from "@/lib/staff-customer-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customer-applications/")({
  head: () => ({ meta: [{ title: "Customer applications — cercit" }] }),
  component: CustomerQueue,
});

type Scope = "OPEN" | "DONE" | "ALL";
const SCOPES: [Scope, string][] = [
  ["OPEN", "Open"],
  ["DONE", "Decided"],
  ["ALL", "All"],
];

function waited(hours: number) {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

function CustomerQueue() {
  const [scope, setScope] = useState<Scope>("OPEN");
  const [data, setData] = useState<{
    drafts: number;
    rows: QueueRow[];
    restricted?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    void getCustomerQueue(scope)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [scope]);

  return (
    <AppShell
      title="Customer applications"
      subtitle="Applications customers submitted themselves on the website, oldest first."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-md border border-border p-0.5 text-sm"
          role="tablist"
          aria-label="Which applications"
        >
          {SCOPES.map(([s, label]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded px-3 py-1",
                scope === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Link to="/document-checks" className="text-sm text-primary hover:underline">
          Automatic document check rules
        </Link>
        {data && data.drafts > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.drafts} more {data.drafts === 1 ? "customer is" : "customers are"} still filling
            in an application.
          </p>
        )}
      </div>

      <SectionCard>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={
              data.restricted
                ? "Real customers are hidden from this login"
                : scope === "OPEN"
                  ? "Nothing waiting"
                  : "No applications here yet"
            }
            description={
              data.restricted
                ? "This login can see sample cases only. Officers, managers, compliance and admins see real applications."
                : scope === "OPEN"
                  ? "Submitted customer applications appear here for the documents check and the credit decision."
                  : "Decided customer applications appear here."
            }
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Application</th>
                  <th className="px-4 py-2 font-medium">Car and loan</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Needs attention</th>
                  <th className="px-4 py-2 font-medium">Waiting</th>
                  <th className="px-4 py-2 font-medium">Officer</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const [stage, tone] = STATUS_TEXT[r.status] ?? [r.status, "muted" as const];
                  return (
                    <tr
                      key={r.application_id}
                      className="border-b border-border last:border-0 hover:bg-surface-subtle"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/customer-applications/$id"
                          params={{ id: r.application_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.full_name}
                        </Link>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {r.application_id}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{r.vehicle ?? "—"}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {r.loan_amount ? inr(r.loan_amount) : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={tone}>{stage}</Pill>
                        {r.approval_stage === "IN_PRINCIPLE" && (
                          <p className="mt-1 text-xs text-muted-foreground">In-principle</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {r.fast_lane && <Pill tone="success">Fast lane</Pill>}
                          {!r.fast_lane && r.auto_verified && (
                            <Pill tone="primary">Documents auto-checked</Pill>
                          )}
                          {!r.auto_verified && r.docs_auto_accepted > 0 && (
                            <Pill tone="muted">{r.docs_auto_accepted} accepted automatically</Pill>
                          )}
                          {r.docs_to_check > 0 && (
                            <Pill tone="info">{r.docs_to_check} to check</Pill>
                          )}
                          {r.docs_with_customer > 0 && (
                            <Pill tone="muted">{r.docs_with_customer} with customer</Pill>
                          )}
                          {r.fields_edited > 0 && (
                            <Pill tone="warning">{r.fields_edited} edited</Pill>
                          )}
                          {r.face && r.face !== "MATCH" && (
                            <Pill tone={FACE_TEXT[r.face][1]}>{FACE_TEXT[r.face][0]}</Pill>
                          )}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 tabular-nums",
                          r.hours_waiting >= 24 &&
                            r.status === "SUBMITTED" &&
                            "font-medium text-warning-foreground dark:text-warning",
                        )}
                      >
                        {waited(r.hours_waiting)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.officer ?? "Not taken"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
