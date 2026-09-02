import { SectionCard, LabelValue } from "@/components/app-shell";
import { inr, cibilTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BureauReport as BureauReportType } from "@/lib/mock-data";

export function BureauReport({ data }: { data: BureauReportType }) {
  return (
    <div className="space-y-4">
      {/* Score */}
      <SectionCard title="CIBIL Score">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="sm:w-48">
            <p
              className={cn(
                "text-5xl font-semibold tabular",
                cibilTone(data.score) === "success" && "text-success",
                cibilTone(data.score) === "warning" && "text-warning",
                cibilTone(data.score) === "destructive" && "text-destructive",
              )}
            >
              {data.score}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gradient-to-r from-destructive via-warning to-success">
              <div
                className="h-full w-0.5 bg-foreground"
                style={{ marginLeft: `${((data.score - 300) / 600) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">300 — 900</p>
          </div>
        </div>
      </SectionCard>

      {/* Account Summary */}
      <SectionCard title="Account Summary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LabelValue label="Active Accounts" value={String(data.activeAccounts)} />
          <LabelValue label="Closed Accounts" value={String(data.closedAccounts)} />
          <LabelValue label="Total Exposure" value={inr(data.totalExposure)} />
          <LabelValue label="Overdue Accounts" value={String(data.overdueAccounts)} />
          <LabelValue label="Oldest Account" value={data.oldestAccountAge} />
          <LabelValue label="Writeoffs" value={data.writeoffs ? "Yes" : "No"} />
          <LabelValue label="Settlements" value={data.settlements ? "Yes" : "No"} />
          <LabelValue label="Suits Filed" value={data.suitsFiled ? "Yes" : "No"} />
        </div>
      </SectionCard>

      {/* DPD History */}
      <SectionCard title="DPD History" description="Last 12 months">
        <div className="space-y-1.5">
          {data.dpdHistory.map((row) => (
            <div key={row.account} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-xs">{row.account}</span>
              <div className="flex flex-1 gap-1">
                {row.months.map((m, i) => (
                  <span
                    key={i}
                    title={`M-${12 - i}: ${m}`}
                    className={cn(
                      "h-4 flex-1 rounded-sm",
                      m === "0" ? "bg-success/40" : "bg-warning",
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Enquiry Summary */}
      <SectionCard title="Enquiry Summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <LabelValue label="Last 3 months" value={String(data.enquiries.last3Months)} />
          <LabelValue label="Last 6 months" value={String(data.enquiries.last6Months)} />
          <LabelValue label="Last 12 months" value={String(data.enquiries.last12Months)} />
        </div>
      </SectionCard>
    </div>
  );
}
