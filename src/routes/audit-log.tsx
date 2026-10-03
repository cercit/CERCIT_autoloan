import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuditLog, type AuditFilters, type AuditPage, type AuditRow } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — cercit" },
      {
        name: "description",
        content:
          "Searchable audit trail of every decision, override, policy change and login across the cercit credit platform.",
      },
      { property: "og:title", content: "Audit Log — cercit" },
      {
        property: "og:description",
        content: "Full audit trail of decisions, overrides, policy changes and sign-ins.",
      },
    ],
  }),
  component: AuditLogPage,
});

// What each logged activity means, in plain words (G6).
const ACTIVITY_TEXT: Record<string, string> = {
  APPLICATION_CREATED: "Started an application",
  APPLICATION_SUBMITTED: "Submitted an application",
  ASSESSMENT_STARTED: "Started the credit checks",
  APPLICATION_ASSESSED: "Finished the credit checks",
  DECISION_GENERATED: "Engine recommendation",
  ENGINE_DECISION: "Server engine decision",
  OFFICER_DECISION: "Recorded a decision",
  DECISION_OVERRIDE: "Overrode a decision",
  DOCUMENT_UPLOADED: "Uploaded a document",
  DETAILS_CONFIRMED: "Confirmed their details",
  AUTO_DOC_ACCEPTED: "Accepted a document automatically",
  AUTO_DOC_REQUESTED: "Sent a document back to the customer",
  AUTO_DOCS_VERIFIED: "All documents checked automatically",
  AUTO_RUN_CHECKS: "Ran the credit checks automatically",
  AUTO_CREDIT_CHECK_SKIPPED: "Skipped the automatic credit checks",
  AUTO_RULE_CHANGED: "Changed a document rule",
  OFFICER_ACCEPT_DOC: "Accepted a document",
  OFFICER_RUN_CHECKS: "Ran the credit checks",
  FACE_MATCH_CHECKED: "Checked the face match",
  EMPLOYER_VERIFIED: "Verified the employer",
  OFFER_ISSUED: "Issued a loan offer",
  OFFER_ACCEPTED: "Accepted the loan offer",
  KFS_ACCEPTED: "Accepted the key facts statement",
  AGREEMENT_SIGNED: "Signed the loan agreement",
  MANDATE_REGISTERED: "Registered the repayment mandate",
  LOAN_DISBURSED: "Disbursed the loan",
  PII_REVEAL: "Revealed PAN or mobile",
  LOGIN: "Signed in",
  LOGIN_FAILED: "Failed sign-in",
  ACCOUNT_LOCKED: "Account locked",
  ACCOUNT_UNLOCKED: "Account unlocked",
  USER_CREATED: "Added a staff login",
  USER_CHANGED: "Changed a staff login",
  USER_SUSPENDED: "Suspended a staff login",
  USER_REACTIVATED: "Reactivated a staff login",
  ROLE_CHANGE_PROPOSED: "Proposed a role change",
  ROLE_CHANGE_APPROVED: "Approved a role change",
  ROLE_CHANGE_REJECTED: "Rejected a role change",
  ROLE_CHANGE_WITHDRAWN: "Withdrew a role change",
  ORG_SETTINGS_CHANGED: "Changed organisation settings",
  OFFICER_NOTE: "Added a note",
  POLICY_STATUS: "Credit policy version changed",
  SWITCH_CHANGED: "Turned a module switch on or off",
  CASE_STAGE: "Case moved to a new stage",
  ROLES_RETIRED: "Retired old roles",
  EMPLOYER_ADDED: "Added an employer",
  EMPLOYER_CHANGED: "Changed an employer",
  EMPLOYER_CHECKED: "Ran an employer's checks",
  EMPLOYER_CATEGORY_REQUESTED: "Asked for an employer category change",
  EMPLOYER_CATEGORY_APPROVED: "Approved an employer category change",
  EMPLOYER_CATEGORY_REJECTED: "Rejected an employer category change",
  EMPLOYER_CATEGORY_WITHDRAWN: "Withdrew an employer category change",
  RATE_GRID_PRODUCT_ADDED: "Added a pricing product",
  RATE_GRID_DRAFTED: "Started a rate grid draft",
  RATE_GRID_SUBMITTED: "Sent a rate grid for approval",
  RATE_GRID_WITHDRAWN: "Withdrew a rate grid",
  RATE_GRID_DISCARDED: "Discarded a rate grid draft",
  RATE_GRID_APPROVED: "Approved a rate grid",
  RATE_GRID_REJECTED: "Rejected a rate grid",
  RATE_GRID_LIVE: "A rate grid went live",
  PRACTICE_RESET: "Practice cases reset",
  SIMULATION_DAY: "Daily simulation ran",
  SETTINGS_DEFAULTS_SAVED: "Saved settings defaults",
  SETTINGS_RESET: "Reset settings to defaults",
};

const activityText = (code: string): string =>
  ACTIVITY_TEXT[code] ?? code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const activityTone = (code: string): "primary" | "success" | "warning" | "destructive" | "muted" => {
  if (/DECISION|DISBURSED|APPROVED|ACCEPT/.test(code)) return "success";
  if (/OVERRIDE|REQUESTED|FAILED|LOCKED|SUSPENDED|REJECTED/.test(code)) return "warning";
  if (/POLICY|SWITCH|RULE|ROLE|SETTINGS|PII/.test(code)) return "destructive";
  if (/LOGIN/.test(code)) return "muted";
  return "primary";
};

const IST = "Asia/Kolkata";
const dateIst = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });
const timeIst = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit" });

function detailText(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

type Range = "today" | "7d" | "month" | "custom" | "all";

// Midnight IST of a yyyy-mm-dd date, as an instant.
const istMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`).toISOString();
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: IST });

function rangeBounds(r: Range, from: string, to: string): { from: string | null; to: string | null } {
  const today = todayIst();
  if (r === "today") return { from: istMidnight(today), to: null };
  if (r === "7d") return { from: new Date(Date.now() - 7 * 86400000).toISOString(), to: null };
  if (r === "month") return { from: istMidnight(`${today.slice(0, 7)}-01`), to: null };
  if (r === "custom") {
    const next = to ? new Date(new Date(istMidnight(to)).getTime() + 86400000).toISOString() : null;
    return { from: from ? istMidnight(from) : null, to: next };
  }
  return { from: null, to: null };
}

const ALL = "__all";

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function AuditLogPage() {
  const [range, setRange] = useState<Range>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState(ALL);
  const [activity, setActivity] = useState(ALL);
  const [caseId, setCaseId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const filters = (): AuditFilters => {
    const b = rangeBounds(range, from, to);
    return {
      from: b.from,
      to: b.to,
      actor: actor === ALL ? null : actor,
      activity: activity === ALL ? null : activity,
      caseId: caseId.trim() || null,
      search: query.trim() || null,
    };
  };

  // Typing waits a moment before asking the database again.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      getAuditLog({ ...filters(), page })
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to, actor, activity, caseId, query, page]);

  // A new filter starts again from the first page.
  useEffect(() => setPage(1), [range, from, to, actor, activity, caseId, query]);

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await getAuditLog({ ...filters(), page: 1, pageSize: 5000 });
      const lines = [
        ["Date", "Time (IST)", "User", "Role", "Activity", "Case", "Details"].join(","),
        ...all.rows.map((r: AuditRow) =>
          [dateIst(r.at), timeIst(r.at), r.actorName, r.actorRole ?? "", activityText(r.activity), r.caseId ?? "", detailText(r.details)]
            .map(csvCell)
            .join(","),
        ),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${todayIst()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.rows ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell
      title="Audit Log"
      subtitle={data ? `${data.total.toLocaleString()} entries · read only` : "Read only"}
      actions={
        <Button variant="outline" onClick={exportCsv} disabled={exporting || !data || data.total === 0}>
          <Download className="size-4" /> {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      }
    >
      <SectionCard className="overflow-hidden">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="custom">From – to</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger aria-label="User">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All users</SelectItem>
              {(data?.users ?? []).map((u) => (
                <SelectItem key={u.key} value={u.key}>
                  {u.name}
                  {u.role ? ` (${u.role.replace(/_/g, " ")})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activity} onValueChange={setActivity}>
            <SelectTrigger aria-label="Activity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All activities</SelectItem>
              {(data?.activities ?? []).slice().sort((a, b) => activityText(a).localeCompare(activityText(b))).map((a) => (
                <SelectItem key={a} value={a}>
                  {activityText(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="Case number" aria-label="Case number" />
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search details, user or case" className="pl-9" />
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            The audit log could not be loaded: {error}
          </div>
        )}

        <div className="mt-4 -mx-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Time (IST)</th>
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Activity</th>
                <th className="px-4 py-2 text-left font-medium">Case</th>
                <th className="px-4 py-2 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className={cn(loading && "opacity-60")}>
              {rows.map((row, i) => (
                <tr key={row.id} className={cn("border-t border-border align-top", i % 2 === 1 && "bg-surface-subtle/60")}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{dateIst(row.at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular">{timeIst(row.at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.actorName}
                    {row.actorRole && <span className="block text-xs text-muted-foreground">{row.actorRole.replace(/_/g, " ")}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Pill tone={activityTone(row.activity)}>{activityText(row.activity)}</Pill>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.caseId ? (
                      <Link to="/applications/$id" params={{ id: row.caseId }} className="text-primary hover:underline">
                        {row.caseId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-[420px] px-4 py-2.5 text-xs break-words text-muted-foreground">{detailText(row.details) || "—"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No entries match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > data.pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
