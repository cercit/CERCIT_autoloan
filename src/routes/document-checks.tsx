import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getAutoRules,
  setAutoRule,
  type AutoRuleChange,
  type AutoRules,
  type AutoSettings,
  type RuleCheck,
  type RuleDocument,
} from "@/lib/staff-customer-api";

export const Route = createFileRoute("/document-checks")({
  head: () => ({
    meta: [
      { title: "Document checks — cercit" },
      {
        name: "description",
        content:
          "Which checks run on customer documents, and when a document is accepted without a person.",
      },
    ],
  }),
  component: DocumentChecksPage,
});

const SWITCHES: [keyof AutoSettings, string, string][] = [
  [
    "enabled",
    "Check documents automatically",
    "Every document a customer sends is checked against their details.",
  ],
  [
    "auto_accept",
    "Accept documents that pass",
    "A document that passes every check that blocks is accepted without a person.",
  ],
  [
    "auto_verify",
    "Move the case on by itself",
    "When every needed document is accepted, the case goes to the credit check.",
  ],
  [
    "auto_credit_checks",
    "Run the credit checks by itself",
    "Bureau, bank and income checks and the engine's recommendation, straight after.",
  ],
];

function DocumentChecksPage() {
  const [rules, setRules] = useState<AutoRules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAutoRules()
      .then(setRules)
      .catch((e: Error) => setError(e.message));
  }, []);

  const change = useCallback(async (c: AutoRuleChange) => {
    setSaving(true);
    try {
      setRules(await setAutoRule(c));
      toast.success("Saved. Applies to the next check that runs.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, []);

  const s = rules?.settings;
  const locked = !rules?.can_edit || saving;

  return (
    <AppShell
      title="Document checks"
      subtitle="What is checked on customer documents, and when a document is accepted without a person. A person still approves every loan."
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !rules || !s ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          {!rules.can_edit && (
            <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
              You can read these rules. Staff who can change credit rules can edit them.
            </p>
          )}
          <SectionCard title="Automation">
            <div className="grid gap-4 sm:grid-cols-2">
              {SWITCHES.map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div>
                    <Label htmlFor={`s-${key}`}>{label}</Label>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch
                    id={`s-${key}`}
                    checked={Boolean(s[key])}
                    disabled={locked || (key !== "enabled" && !s.enabled)}
                    onCheckedChange={(v) => void change({ settings: { [key]: v } })}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="s-wait">Wait for the document reader (minutes)</Label>
                <Input
                  id="s-wait"
                  type="number"
                  min={1}
                  max={1440}
                  className="w-28"
                  defaultValue={s.reader_wait_minutes}
                  disabled={locked}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v && v !== s.reader_wait_minutes)
                      void change({ settings: { reader_wait_minutes: v } });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  After this, a document never read goes to a person.
                </p>
              </div>
            </div>
          </SectionCard>

          {rules.documents.map((d) => (
            <DocumentRules key={d.doc_type} d={d} locked={locked} change={change} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function DocumentRules({
  d,
  locked,
  change,
}: {
  d: RuleDocument;
  locked: boolean;
  change: (c: AutoRuleChange) => Promise<void>;
}) {
  return (
    <SectionCard
      title={d.name}
      {...(d.note ? { description: d.note } : {})}
      action={
        <div className="flex items-center gap-2">
          <Label htmlFor={`auto-${d.doc_type}`} className="text-sm font-normal">
            Accept automatically
          </Label>
          <Switch
            id={`auto-${d.doc_type}`}
            checked={d.auto_accept}
            disabled={locked}
            onCheckedChange={(v) => void change({ doc_type: d.doc_type, auto_accept: v })}
          />
        </div>
      }
    >
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-[34%] px-4 py-2 font-medium">Check</th>
              <th className="w-[9%] px-4 py-2 font-medium">On</th>
              <th className="w-[11%] px-4 py-2 font-medium">Must pass</th>
              <th className="w-[18%] px-4 py-2 font-medium">Limit</th>
              <th className="w-[28%] px-4 py-2 font-medium">If it fails</th>
            </tr>
          </thead>
          <tbody>
            {d.checks.map((k) => (
              <CheckRow key={k.check} doc={d.doc_type} k={k} locked={locked} change={change} />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function CheckRow({
  doc,
  k,
  locked,
  change,
}: {
  doc: string;
  k: RuleCheck;
  locked: boolean;
  change: (c: AutoRuleChange) => Promise<void>;
}) {
  const [message, setMessage] = useState(k.customer_message ?? "");
  const id = `${doc}-${k.check}`;
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-2.5">
        <p className={k.enabled ? "" : "text-muted-foreground line-through"}>{k.label}</p>
        {!k.blocking && k.enabled && <Pill tone="muted">for information</Pill>}
      </td>
      <td className="px-4 py-2.5">
        <Switch
          id={`${id}-on`}
          aria-label={`${k.label}: on`}
          checked={k.enabled}
          disabled={locked}
          onCheckedChange={(v) => void change({ doc_type: doc, check: k.check, enabled: v })}
        />
      </td>
      <td className="px-4 py-2.5">
        <Switch
          id={`${id}-block`}
          aria-label={`${k.label}: must pass`}
          checked={k.blocking}
          disabled={locked || !k.enabled}
          onCheckedChange={(v) => void change({ doc_type: doc, check: k.check, blocking: v })}
        />
      </td>
      <td className="px-4 py-2.5">
        {k.threshold_hint ? (
          <div className="space-y-0.5">
            <Input
              id={`${id}-limit`}
              type="number"
              step="any"
              className="h-8 w-24"
              defaultValue={k.threshold ?? ""}
              disabled={locked || !k.enabled}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== k.threshold) void change({ doc_type: doc, check: k.check, threshold: v });
              }}
            />
            <p className="text-xs text-muted-foreground">{k.threshold_hint}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <Select
          value={k.on_fail}
          disabled={locked || !k.enabled || !k.blocking}
          onValueChange={(v) =>
            void change({
              doc_type: doc,
              check: k.check,
              on_fail: v as RuleCheck["on_fail"],
              ...(message ? { customer_message: message } : {}),
            })
          }
        >
          <SelectTrigger id={`${id}-fail`} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="REVIEW">A person looks</SelectItem>
            <SelectItem value="ASK_CUSTOMER">Ask the customer again</SelectItem>
          </SelectContent>
        </Select>
        {k.on_fail === "ASK_CUSTOMER" && (
          <Textarea
            id={`${id}-msg`}
            className="mt-1.5 text-xs"
            rows={2}
            value={message}
            disabled={locked}
            placeholder="What the customer is told"
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => {
              if (message.trim() && message !== k.customer_message)
                void change({ doc_type: doc, check: k.check, customer_message: message.trim() });
            }}
          />
        )}
      </td>
    </tr>
  );
}
