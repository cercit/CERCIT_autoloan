import { createFileRoute } from "@tanstack/react-router";
import { History, Plus } from "lucide-react";
import { useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { policyRules, policyTabs } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/policy-rules")({
  head: () => ({
    meta: [
      { title: "Policy Rules — cercit" },
      {
        name: "description",
        content:
          "Configure CIBIL, FOIR, LTV, tenure, age, employment and documentation rules that drive automated car loan decisions.",
      },
      { property: "og:title", content: "Policy Rules — cercit" },
      {
        property: "og:description",
        content: "Configure the credit policy rules behind automated loan decisions.",
      },
    ],
  }),
  component: PolicyRulesPage,
});

function PolicyRulesPage() {
  const [tab, setTab] = useState<string>(policyTabs[0]!);
  const rules = policyRules[tab] ?? [];

  return (
    <AppShell
      title="Policy Rules"
      subtitle="Rule changes are versioned and applied to new applications only"
      actions={
        <Button>
          <Plus className="size-4" /> Add new rule
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {policyTabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t} Rules
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SectionCard className="mt-4 overflow-hidden">
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Rule name</th>
                <th className="px-4 py-2 text-left font-medium">Parameter</th>
                <th className="px-4 py-2 text-left font-medium">Operator</th>
                <th className="px-4 py-2 text-left font-medium">Threshold</th>
                <th className="px-4 py-2 text-left font-medium">Action</th>
                <th className="px-4 py-2 text-left font-medium">Effective from</th>
                <th className="px-4 py-2 text-left font-medium">Effective to</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr
                  key={rule.name}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5 font-medium">{rule.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {rule.parameter}
                  </td>
                  <td className="px-4 py-2.5">{rule.operator}</td>
                  <td className="px-4 py-2.5 tabular">{rule.threshold}</td>
                  <td className="px-4 py-2.5">
                    <Pill
                      tone={
                        rule.action === "Approve"
                          ? "success"
                          : rule.action === "Maybe"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {rule.action}
                    </Pill>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rule.from}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{rule.to}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={rule.active ? "success" : "muted"}>
                      {rule.active ? "Active" : "Inactive"}
                    </Pill>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive">
                      {rule.active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
        <History className="mt-0.5 size-4 shrink-0" />
        <p>
          Last updated: 28 Aug 2026 by Anand Gopal — FOIR limit changed from 55% to 50%. Previous
          version retained as inactive for audit.
        </p>
      </div>
    </AppShell>
  );
}
