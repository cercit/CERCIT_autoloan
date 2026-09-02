import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { Fragment, useState, useEffect } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDealersByOem } from "@/lib/api";
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
  const [dealersByOem, setDealersByOem] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDealersByOem().then((data) => {
      setDealersByOem(data || {});
      setLoading(false);
    });
  }, []);

  const oemNames = Object.keys(dealersByOem).sort();
  const q = query.trim().toLowerCase();
  const filteredOems = oemNames.filter((oem) =>
    !q ||
    oem.toLowerCase().includes(q) ||
    (dealersByOem[oem] ?? []).some((d: any) => d.dealer_name?.toLowerCase().includes(q))
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
            placeholder="Search OEM or dealer"
            className="pl-9"
          />
        </div>
        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground px-4 py-4">Loading employer and dealer data...</p>
          ) : (
            <>
              {filteredOems.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-4">No OEMs or dealers match those filters.</p>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-surface-subtle text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">OEM / Dealer</th>
                      <th className="px-4 py-2 text-left font-medium">Dealer Code</th>
                      <th className="px-4 py-2 text-left font-medium">City</th>
                      <th className="px-4 py-2 text-left font-medium">State</th>
                      <th className="px-4 py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOems.map((oem, i) => (
                      <Fragment key={oem}>
                        <tr className={cn("border-t border-border bg-surface-subtle/40", i % 2 === 1 && "bg-surface-subtle/60")}>
                          <td colSpan={5} className="px-4 py-2 text-sm font-semibold">
                            {oem} <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{dealersByOem[oem]?.length ?? 0}</span>
                          </td>
                        </tr>
                        {(dealersByOem[oem] ?? []).map((dealer: any, di: number) => (
                          <tr key={`${oem}-${dealer.dealer_name}-${di}`} className={cn("border-t border-border", (i + di) % 2 === 1 && "bg-surface-subtle/60")}>
                            <td className="px-4 py-2 pl-8 font-medium whitespace-nowrap">{dealer.dealer_name}</td>
                            <td className="px-4 py-2 text-muted-foreground">{dealer.dealer_code}</td>
                            <td className="px-4 py-2 text-muted-foreground">{dealer.city}</td>
                            <td className="px-4 py-2 text-muted-foreground">{dealer.state_code}</td>
                            <td className="px-4 py-2 text-right tabular">
                              <span className={dealer.is_active ? "text-success text-xs font-medium" : "text-muted-foreground text-xs"}>{dealer.is_active ? "Active" : "Inactive"}</span>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </AppShell>
  );
}
