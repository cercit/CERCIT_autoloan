import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { rateGrid } from "@/lib/mock-data";
import { getRateGrid } from "@/lib/api";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rate-grid")({
  head: () => ({
    meta: [
      { title: "Rate Grid — cercit" },
      {
        name: "description",
        content:
          "Interest rate grid by CIBIL band and employer category used to price new car loan sanctions in cercit.",
      },
      { property: "og:title", content: "Rate Grid — cercit" },
      {
        property: "og:description",
        content: "Interest rate pricing by CIBIL band and employer category.",
      },
    ],
  }),
  component: RateGridPage,
});

function RateGridPage() {
  const [gridData, setGridData] = useState(rateGrid);
  useEffect(() => {
    getRateGrid().then((rows) => {
      if (rows && rows.length > 0) {
        setGridData(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows.map((r: any) => {
            const base = Number(r.rate_pct ?? 0);
            return {
              band: r.band_label ?? `${r.score_band_min}-${r.score_band_max}`,
              catA: base,
              catB: +(base + 0.4).toFixed(2),
              catC: +(base + 1.25).toFixed(2),
            };
          })
        );
      }
    }).catch(() => {});
  }, []);

  return (
    <AppShell
      title="Rate Grid"
      subtitle="Effective 01 Aug 2026 — new car loans, salaried segment"
      actions={
        <Button variant="outline">
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <SectionCard title="Base interest rate (% p.a.)" className="overflow-hidden">
        <div className="-mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">CIBIL band</th>
                <th className="px-4 py-2 text-right font-medium">Category A</th>
                <th className="px-4 py-2 text-right font-medium">Category B</th>
                <th className="px-4 py-2 text-right font-medium">Category C</th>
              </tr>
            </thead>
            <tbody>
              {gridData.map((row, i) => (
                <tr
                  key={row.band}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5 font-medium">{row.band}</td>
                  <td className="px-4 py-2.5 text-right tabular">{row.catA.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right tabular">{row.catB.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right tabular">{row.catC.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(["A", "B", "C"] as const).map((cat) => (
          <SectionCard key={cat}>
            <div className="flex items-center gap-2">
              <CategoryBadge category={cat} />
              <h3 className="text-sm font-semibold">Category {cat}</h3>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>Max LTV: {cat === "A" ? "120%" : cat === "B" ? "110%" : "90%"}</li>
              <li>Max tenure: {cat === "C" ? "60 months" : "84 months"}</li>
              <li>
                Processing fee: {cat === "A" ? "Rs 5,000" : cat === "B" ? "Rs 6,500" : "Rs 8,000"}
              </li>
              <li>
                Risk loading: {cat === "A" ? "None" : cat === "B" ? "+0.40%" : "+1.25%"}
              </li>
            </ul>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
