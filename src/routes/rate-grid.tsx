import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { rateBands, employerCategoryPricing } from "@/lib/mock-data";
import { getRateGrid, effectiveRate, type RateGridData } from "@/lib/api";
import { inr } from "@/lib/format";
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

function exportCsv({ bands, categories }: RateGridData) {
  const header = ["CIBIL Band", "Decision", ...categories.map((c) => `${c.label} (%)`), "Max FOIR (%)"];
  const rows = bands.map((band) => [
    band.band,
    band.label,
    ...categories.map((c) => {
      const rate = effectiveRate(band, c);
      return rate === null ? "Not offered" : rate.toFixed(2);
    }),
    band.maxFoirPct > 0 ? band.maxFoirPct.toFixed(2) : "—",
  ]);

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cercit-rate-grid.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function RateGridPage() {
  const [data, setData] = useState<RateGridData>({
    bands: rateBands,
    categories: employerCategoryPricing,
  });

  useEffect(() => {
    let cancelled = false;
    getRateGrid()
      .then((next) => {
        if (!cancelled && next.bands.length > 0) setData(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const { bands, categories } = data;

  return (
    <AppShell
      title="Rate Grid"
      subtitle="Effective 01 Aug 2026 — new car loans, salaried segment"
      actions={
        <Button variant="outline" onClick={() => exportCsv(data)}>
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <SectionCard title="Base interest rate (% p.a.)" className="overflow-hidden">
        <div className="-mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">CIBIL band</th>
                {categories.map((c) => (
                  <th key={c.code} className="px-4 py-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Max FOIR</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band, i) => (
                <tr
                  key={band.band}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium tabular">{band.band}</span>
                    {band.label && (
                      <span className="ml-2 text-xs text-muted-foreground">{band.label}</span>
                    )}
                  </td>
                  {categories.map((c) => {
                    const rate = effectiveRate(band, c);
                    return (
                      <td
                        key={c.code}
                        className={cn(
                          "px-4 py-2.5 text-right tabular",
                          rate === null && "text-muted-foreground",
                        )}
                      >
                        {rate === null ? "Not offered" : `${rate.toFixed(2)}%`}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular",
                      band.maxFoirPct <= 0 && "text-muted-foreground",
                    )}
                  >
                    {band.maxFoirPct > 0 ? `${band.maxFoirPct.toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="mt-3 text-xs text-muted-foreground">
        Category rate = band base rate + employer category loading. Effective LTV and tenure are the
        tighter of the band cap and the category cap.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {categories.map((cat) => (
          <SectionCard key={cat.code}>
            <div className="flex items-center gap-2">
              <CategoryBadge category={cat.code} />
              <h3 className="text-sm font-semibold">{cat.label}</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{cat.description}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>Max LTV: {cat.maxLtvPct.toFixed(0)}%</li>
              <li>Max tenure: {cat.maxTenureMonths} months</li>
              <li>Processing fee: {inr(cat.processingFeeInr)}</li>
              <li>
                Risk loading: {cat.loadingPct > 0 ? `+${cat.loadingPct.toFixed(2)}%` : "None"}
              </li>
            </ul>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
