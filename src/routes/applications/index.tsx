import { Link, createFileRoute } from "@tanstack/react-router";
import { Filter, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

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
import { applications } from "@/lib/mock-data";
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");

  const rows = useMemo(
    () =>
      applications.filter((app) => {
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
    [query, status],
  );

  return (
    <AppShell
      title="Applications"
      subtitle={`${rows.length} of ${applications.length} applications`}
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
                <th className="px-4 py-2 text-left font-medium">Application</th>
                <th className="px-4 py-2 text-left font-medium">Applicant</th>
                <th className="px-4 py-2 text-left font-medium">Employer</th>
                <th className="px-4 py-2 text-right font-medium">Loan</th>
                <th className="px-4 py-2 text-right font-medium">CIBIL</th>
                <th className="px-4 py-2 text-right font-medium">FOIR</th>
                <th className="px-4 py-2 text-left font-medium">Recommendation</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((app, i) => (
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
              ))}
              {rows.length === 0 && (
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
