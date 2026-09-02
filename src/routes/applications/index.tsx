import { Link, createFileRoute } from "@tanstack/react-router";
import { Filter, Plus, Search, ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { getApplications } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { Application } from "@/lib/mock-data";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  component: Applications,
});

const statuses = [
  "All statuses",
  "New",
  "Documents Uploaded",
  "Under Review",
  "Referred",
  "Sanctioned",
  "Rejected",
];

function Applications() {
  const [allApps, setAllApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sortKey, setSortKey] = useState<"name" | "cibil" | "loanAmount" | "status" | "submitted" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    getApplications()
      .then(setAllApps)
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(
    () =>
      allApps.filter((app) => {
        const matchesStatus = status === "All statuses" || app.status === status;
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          app.name.toLowerCase().includes(q) ||
          app.id.toLowerCase().includes(q) ||
          app.pan.toLowerCase().includes(q) ||
          app.employer.toLowerCase().includes(q);
        return matchesStatus && matchesQuery;
      }),
    [allApps, query, status],
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "cibil") cmp = a.cibil - b.cibil;
      else if (sortKey === "loanAmount") cmp = a.loanAmount - b.loanAmount;
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "submitted") cmp = a.submitted.localeCompare(b.submitted);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <AppShell
      title="Applications"
      subtitle={loading ? "Loading..." : `${sortedRows.length} of ${allApps.length} applications`}
      actions={
        <Button asChild>
          <Link to="/applications/new">
            <Plus className="size-4" /> New application
          </Link>
        </Button>
      }
    >
      <SectionCard className="overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, PAN, application ID or employer"
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
                    <Link
                      to="/applications/$id"
                      params={{ id: app.id }}
                      className="font-medium whitespace-nowrap text-primary hover:underline"
                    >
                      {app.id}
                    </Link>
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
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={app.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/applications/$id" params={{ id: app.id }}>
                        View
                      </Link>
                    </Button>
                  </td>
                </tr>
                ))
              )}
              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No applications match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
