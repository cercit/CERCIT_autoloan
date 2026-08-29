import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { employers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "Employer Master — cercit" },
      {
        name: "description",
        content:
          "Employer master list with A/B/C risk categories, sector and approval history used in cercit credit decisions.",
      },
      { property: "og:title", content: "Employer Master — cercit" },
      {
        property: "og:description",
        content: "Employer risk categories and approval history for credit decisioning.",
      },
    ],
  }),
  component: Employers,
});

function Employers() {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      employers.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  return (
    <AppShell
      title="Employer Master"
      subtitle="Risk categorisation drives rate, LTV and tenure eligibility"
      actions={
        <Button>
          <Plus className="size-4" /> Add employer
        </Button>
      }
    >
      <SectionCard className="overflow-hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employers"
            className="pl-9"
          />
        </div>
        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Employer</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Sector</th>
                <th className="px-4 py-2 text-left font-medium">Constitution</th>
                <th className="px-4 py-2 text-left font-medium">Headcount</th>
                <th className="px-4 py-2 text-right font-medium">Approved loans</th>
                <th className="px-4 py-2 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr
                  key={e.name}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  <td className="px-4 py-2.5">
                    <CategoryBadge category={e.category} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.sector}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.listed}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.employees}</td>
                  <td className="px-4 py-2.5 text-right tabular">{e.approved}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
