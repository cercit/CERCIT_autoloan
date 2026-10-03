import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Filter, Plus, Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge, Pill, ScoreText, StatusPill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApplicationsPage } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { Application } from "@/lib/mock-data";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/applications/")({
  head: () => ({
    meta: [
      { title: "Applications — cercit" },
      {
        name: "description",
        content:
          "Browse, filter and open every car loan application in the cercit underwriting pipeline with CIBIL, FOIR and status at a glance.",
      },
      { property: "og:title", content: "Applications — cercit" },
      {
        property: "og:description",
        content: "Every car loan application in the underwriting pipeline, filterable by status.",
      },
    ],
  }),
  // ?q= comes from the search box in the top bar (fix A5)
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" && search["q"].trim() ? { q: search["q"].trim() } : {},
  component: Applications,
});

const statuses = [
  "All statuses",
  "New",
  "Documents Uploaded",
  "Under Review",
  "Referred",
  "Sanctioned",
  "Disbursed",
  "Rejected",
];

type SortKey = "name" | "cibil" | "loanAmount" | "status" | "submitted";
const SORT_PARAM: Record<SortKey, "name" | "cibil" | "loan" | "status" | "submitted"> = {
  name: "name",
  cibil: "cibil",
  loanAmount: "loan",
  status: "status",
  submitted: "submitted",
};
const PAGE_SIZE = 50;

function Applications() {
  const [allApps, setAllApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const { q: searched } = Route.useSearch();
  const [query, setQuery] = useState(searched ?? "");
  // a new search from the top bar while this page is already open
  useEffect(() => {
    if (searched !== undefined) setQuery(searched);
  }, [searched]);
  const [status, setStatus] = useState("All statuses");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // C4: the database searches, sorts and pages (fn_list_applications_page); the page
  // asks for 50 cases at a time instead of all ~2,000.
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      getApplicationsPage({
        search: query,
        status,
        sort: sortKey ? SORT_PARAM[sortKey] : "submitted",
        desc: sortKey ? sortDir === "desc" : true,
        page,
        pageSize: PAGE_SIZE,
      })
        .then((r) => {
          setAllApps(r.rows);
          setTotal(r.total);
          setLoadError(null);
        })
        .catch((e: Error) => setLoadError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, status, sortKey, sortDir, page]);

  // a new search, filter or sort starts from the first page
  useEffect(() => setPage(1), [query, status, sortKey, sortDir]);

  const sortedRows = allApps;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <AppShell
      title="Applications"
      subtitle={loading ? "Loading..." : `${total.toLocaleString()} application${total === 1 ? "" : "s"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
      actions={
        <Button asChild>
          <Link to="/applications/new">
            <Plus className="size-4" /> New application
          </Link>
        </Button>
      }
    >
      {loadError && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The applications could not be loaded: {loadError}
        </div>
      )}
      <SectionCard className="overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, application ID, employer, last 4 of PAN or full PAN"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-56">
              <Filter className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium" onClick={() => toggleSort("name")}>Application <ArrowUpDown className={cn("size-3 text-muted-foreground", sortKey === "name" ? "rotate-180" : "")} /></button>
                </th>
                <th className="px-4 py-2 text-left font-medium">Applicant</th>
                <th className="px-4 py-2 text-left font-medium">Employer</th>
                <th className="px-4 py-2 text-right font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium justify-end w-full" onClick={() => toggleSort("loanAmount")}>Loan <ArrowUpDown className={cn("size-3 text-muted-foreground", sortKey === "loanAmount" ? "rotate-180" : "")} /></button>
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium justify-end w-full" onClick={() => toggleSort("cibil")}>CIBIL <ArrowUpDown className={cn("size-3 text-muted-foreground", sortKey === "cibil" ? "rotate-180" : "")} /></button>
                </th>
                <th className="px-4 py-2 text-right font-medium">FOIR</th>
                <th className="px-4 py-2 text-left font-medium">Recommendation</th>
                <th className="px-4 py-2 text-left font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium" onClick={() => toggleSort("status")}>Status <ArrowUpDown className={cn("size-3 text-muted-foreground", sortKey === "status" ? "rotate-180" : "")} /></button>
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  <button type="button" className="flex items-center gap-1 font-medium justify-end w-full" onClick={() => toggleSort("submitted")}>Submitted <ArrowUpDown className={cn("size-3 text-muted-foreground", sortKey === "submitted" ? "rotate-180" : "")} /></button>
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="border-t border-border">
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-14" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-2.5"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-2.5 text-right" />
                    </tr>
                ))
              ) : (
                sortedRows.map((app, i) => (
                <tr
                  key={app.id}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5">
                    {app.origin === "CUSTOMER" ? (
                      <Link
                        to="/customer-applications/$id"
                        params={{ id: app.id }}
                        className="font-medium whitespace-nowrap text-primary hover:underline"
                      >
                        {app.id}
                      </Link>
                    ) : (
                      <Link
                        to="/applications/$id"
                        params={{ id: app.id }}
                        className="font-medium whitespace-nowrap text-primary hover:underline"
                      >
                        {app.id}
                      </Link>
                    )}
                    {app.origin === "CUSTOMER" && (
                      <Pill tone="info" className="ml-1.5 align-middle">Customer</Pill>
                    )}
                    <p className="text-[11px] text-muted-foreground">{app.submitted}</p>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{app.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <CategoryBadge category={app.category} />
                      {app.employer}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {inr(app.loanAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ScoreText score={app.cibil} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{app.foir.toFixed(1)}%</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Pill
                        tone={
                          app.recommendation === "Approve"
                            ? "success"
                            : app.recommendation === "Maybe"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {app.recommendation}
                      </Pill>
                      {app.engineOutcome && (
                        <Pill
                          tone={
                            app.engineOutcome === "APPROVE"
                              ? "success"
                              : app.engineOutcome === "MAYBE"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          Engine: {app.engineOutcome === "APPROVE" ? "Approve" : app.engineOutcome === "MAYBE" ? "Maybe" : "Reject"}
                        </Pill>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={app.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" asChild>
                      {app.origin === "CUSTOMER" ? (
                        <Link to="/customer-applications/$id" params={{ id: app.id }}>
                          View
                        </Link>
                      ) : (
                        <Link to="/applications/$id" params={{ id: app.id }}>
                          View
                        </Link>
                      )}
                    </Button>
                  </td>
                </tr>
                ))
              )}
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={ClipboardList}
                      title="No applications found"
                      description="No applications match those filters. Try adjusting the search or status filter."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
