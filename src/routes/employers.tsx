import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Check, X } from "lucide-react";
import { Fragment, useState, useEffect } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { CategoryBadge, Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEmployers, verifyEmployer } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "Employer Master — cercit" },
      { description: "Employer master list with A/B/C/D risk categories used in cercit credit decisions." },
    ],
  }),
  component: Employers,
});

function Employers() {
  const [employers, setEmployers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const refresh = () => {
    setLoading(true);
    getEmployers().then((data) => {
      setEmployers(data || []);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const q = query.trim().toLowerCase();
  const filtered = employers.filter((e: any) =>
    !q || e.name?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)
  );

  const handleVerify = async (name: string) => {
    const res = await verifyEmployer(name);
    if (res.found) {
      toast.success("Employer verified: " + res.category);
      refresh();
    } else {
      toast.error("Employer not found");
    }
  };

  return (
    <AppShell
      title="Employer Master"
      subtitle="Risk categorisation drives rate, LTV and tenure eligibility"
      actions={<Button><Plus className="size-4" /> Add employer</Button>}
    >
      <SectionCard className="overflow-hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employer" className="pl-9" />
        </div>
        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground px-4 py-4">Loading employers...</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-subtle text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Category</th>
                  <th className="px-4 py-2 text-left font-medium">Verified</th>
                  <th className="px-4 py-2 text-left font-medium">Verification Date</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any, i: number) => (
                  <tr key={e.id || i} className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}>
                    <td className="px-4 py-2.5 font-medium">{e.name}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={e.category === "A" ? "success" : e.category === "B" ? "warning" : e.category === "C" ? "destructive" : "muted"}>
                        {e.category}
                      </Pill>
                    </td>
                    <td className="px-4 py-2.5">
                      {e.isVerified ? <Check className="size-4 text-success" /> : <X className="size-4 text-muted-foreground" />}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.verificationDate || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!e.isVerified && (
                        <Button size="sm" variant="outline" onClick={() => handleVerify(e.name)}>Verify</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>
    </AppShell>
  );
}
