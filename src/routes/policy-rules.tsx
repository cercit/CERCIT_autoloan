import { createFileRoute } from "@tanstack/react-router";
import { History, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activateDuePolicy,
  draftRuleChange,
  getMappedPolicyRules,
  removeRuleChange,
  type PolicyInForce,
  type RuleChange,
  type RuleRaw,
} from "@/lib/api";
import { approveChange, rejectChange, submitForApproval, withdrawChange } from "@/lib/policy-api";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useFeatureStatus } from "@/lib/feature-flags";
import { PolicyControl } from "@/components/policy/policy-control";
import type { PolicyRule } from "@/lib/mock-data";
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
  // Credit control replaces this screen with the full proposal workflow.
  const { enabled: creditControl, ready: switchKnown } = useFeatureStatus("credit_control");
  const [policyRules, setPolicyRules] = useState<Record<string, PolicyRule[]>>({});
  const [policyTabs, setPolicyTabs] = useState<string[]>([]);
  const [tab, setTab] = useState<string>("");
  const [inForce, setInForce] = useState<PolicyInForce | null>(null);
  const [raw, setRaw] = useState<Record<string, RuleRaw>>({});
  const [changes, setChanges] = useState<RuleChange[]>([]);
  const [canAuthor, setCanAuthor] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [modifying, setModifying] = useState<PolicyRule | null>(null);

  const load = (first = false) =>
    getMappedPolicyRules()
      .then((r) => {
        setPolicyRules(r.rules);
        setPolicyTabs(r.tabs);
        if (first) setTab(r.tabs[0] ?? "");
        setInForce(r.inForce);
        setRaw(r.raw);
        setChanges(r.changes);
        setCanAuthor(r.canAuthor);
        setCanApprove(r.canApprove);
        // an approver's visit also makes approved changes whose date has come live
        if (r.canApprove && r.changes.some((c) => c.status === "APPROVED" && c.effective_from && new Date(c.effective_from) <= new Date())) {
          void activateDuePolicy().then(() => load());
        }
      })
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoaded(true));

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const rules = policyRules[tab] ?? [];
  const pendingFor = (ruleId: string) => changes.filter((c) => c.rule_id === ruleId);
  const myDraft = changes.filter((c) => c.mine && c.status === "DRAFT");
  const waiting = changes.filter((c) => c.status === "PENDING_APPROVAL");
  const scheduled = changes.filter((c) => c.status === "APPROVED");
  const byVersion = (list: RuleChange[]) =>
    Object.values(
      list.reduce<Record<string, RuleChange[]>>((acc, c) => {
        (acc[c.version_id] ??= []).push(c);
        return acc;
      }, {}),
    );

  if (!switchKnown) {
    return (
      <AppShell title="Policy Rules" subtitle="Loading">
        <SectionCard>Loading the policy in force…</SectionCard>
      </AppShell>
    );
  }

  if (creditControl) {
    return (
      <AppShell title="Policy Rules" subtitle="The version in force, and changes waiting for approval">
        <PolicyControl />
      </AppShell>
    );
  }

  return (
    <AppShell title="Policy Rules" subtitle="Changes go through approval and apply to new applications from their start date">
      {loadError ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The credit rules could not be loaded: {loadError}
        </div>
      ) : loaded && policyTabs.length === 0 ? (
        <div className="mb-4 rounded-md border border-border p-3 text-sm text-muted-foreground">No credit rules are stored yet.</div>
      ) : null}

      {myDraft.length > 0 && (
        <DraftPanel changes={myDraft} raw={raw} busy={busy} run={run} />
      )}
      {byVersion(waiting).map((list) => (
        <WaitingPanel key={list[0]!.version_id} changes={list} raw={raw} canApprove={canApprove} busy={busy} run={run} />
      ))}
      {byVersion(scheduled).map((list) => (
        <div key={list[0]!.version_id} className="mb-4 rounded-md border border-info/40 bg-info/10 p-3 text-sm">
          Approved: {list.map((c) => describe(c, raw)).join("; ")}. Live from {when(list[0]!.effective_from)}.
        </div>
      ))}

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
                <th className="px-4 py-2 text-left font-medium">Limit</th>
                <th className="px-4 py-2 text-left font-medium">If it fails</th>
                <th className="px-4 py-2 text-left font-medium">Since</th>
                <th className="px-4 py-2 text-left font-medium">On</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => {
                const pend = pendingFor(rule.id);
                return (
                  <tr key={rule.id} className={cn("border-t border-border align-top", i % 2 === 1 && "bg-surface-subtle/60")}>
                    <td className="px-4 py-2.5 font-medium">
                      {rule.name}
                      {pend.map((c) => (
                        <span key={c.version_id} className="mt-0.5 block text-xs font-normal text-warning-foreground dark:text-warning">
                          {c.status === "DRAFT" ? "In your draft" : c.status === "PENDING_APPROVAL" ? "Waiting for approval" : `Approved, from ${when(c.effective_from)}`}:{" "}
                          {describe(c, raw)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{rule.parameter}</td>
                    <td className="px-4 py-2.5">{rule.operator}</td>
                    <td className="px-4 py-2.5 tabular">{rule.threshold}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={rule.action === "Approve" ? "success" : rule.action === "Maybe" ? "warning" : "destructive"}>
                        {rule.action === "Reject" ? "Decline" : rule.action === "Maybe" ? "Refer" : rule.action}
                      </Pill>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{rule.from}</td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={rule.active}
                        disabled={!canAuthor || busy !== null}
                        aria-label={`${rule.name} is ${rule.active ? "on" : "off"}${canAuthor ? "; switching drafts a change for approval" : ""}`}
                        onCheckedChange={(on) =>
                          void run(`sw-${rule.id}`, () => draftRuleChange(rule.id, { isActive: on }), `${on ? "Switching on" : "Switching off"} added to your draft`)
                        }
                      />
                      <span className="ml-2 text-xs text-muted-foreground">{rule.active ? "On" : "Off"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {canAuthor && (
                        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setModifying(rule)}>
                          Modify
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {!canAuthor && loaded && (
        <p className="mt-3 text-xs text-muted-foreground">Read only: changing a rule needs the policy author right.</p>
      )}

      {inForce && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
          <History className="mt-0.5 size-4 shrink-0" />
          <p>
            Policy version in force: {inForce.versionCode}
            {inForce.effectiveFrom ? `, since ${when(inForce.effectiveFrom)}` : ""}
            {inForce.approvedBy ? `, approved by ${inForce.approvedBy}` : ""}.
            {inForce.lastChange
              ? ` Last change: version ${inForce.lastChange.versionCode} became ${inForce.lastChange.toStatus.toLowerCase()} on ${when(inForce.lastChange.at)} by ${inForce.lastChange.by}.`
              : ""}
          </p>
        </div>
      )}

      {modifying && raw[modifying.id] && (
        <ModifyRule
          rule={modifying}
          raw={raw[modifying.id]!}
          onClose={() => setModifying(null)}
          onSave={(threshold, severity) =>
            run("modify", async () => {
              await draftRuleChange(modifying.id, { threshold, severity });
              setModifying(null);
            }, "Change added to your draft")
          }
        />
      )}
    </AppShell>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

function describe(c: RuleChange, raw: Record<string, RuleRaw>): string {
  const r = raw[c.rule_id];
  const name = r?.name ?? c.rule_id;
  const parts: string[] = [];
  if (c.is_active !== null) parts.push(c.is_active ? "switch on" : "switch off");
  if (c.threshold_value !== null) parts.push(`limit ${c.before.threshold_value} → ${c.threshold_value}`);
  if (c.severity_on_fail !== null) parts.push(`if it fails: ${c.severity_on_fail === "REJECT" ? "decline" : "refer"}`);
  return `${name}: ${parts.join(", ")}`;
}

type Run = (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>;

const unwrap = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
};

function DraftPanel({ changes, raw, busy, run }: { changes: RuleChange[]; raw: Record<string, RuleRaw>; busy: string | null; run: Run }) {
  const [title, setTitle] = useState("");
  const versionId = changes[0]!.version_id;
  return (
    <SectionCard title="Your draft" description={`Version ${changes[0]!.version_code}: not live until someone else approves it`} className="mb-4">
      <ul className="space-y-1 text-sm">
        {changes.map((c) => (
          <li key={c.rule_id} className="flex items-center justify-between gap-2">
            <span>{describe(c, raw)}</span>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run(`rm-${c.rule_id}`, () => removeRuleChange(c.rule_id), "Taken off the draft")}>
              Undo
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="draft-title">What the change is, in a line</Label>
          <Input id="draft-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Raise the minimum CIBIL score to 700" />
        </div>
        <Button
          disabled={busy !== null || title.trim().length < 5}
          onClick={() => void run("submit", () => unwrap(submitForApproval(versionId, title.trim())), "Sent for approval")}
        >
          {busy === "submit" && <Loader2 className="size-4 animate-spin" />} Send for approval
        </Button>
      </div>
    </SectionCard>
  );
}

function WaitingPanel({
  changes,
  raw,
  canApprove,
  busy,
  run,
}: {
  changes: RuleChange[];
  raw: Record<string, RuleRaw>;
  canApprove: boolean;
  busy: string | null;
  run: Run;
}) {
  const first = changes[0]!;
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [from, setFrom] = useState(tomorrow);
  const [note, setNote] = useState("");
  return (
    <SectionCard
      title="Waiting for approval"
      description={`Version ${first.version_code} by ${first.mine ? "you" : (first.author ?? "someone")}`}
      className="mb-4"
    >
      <ul className="space-y-1 text-sm">
        {changes.map((c) => (
          <li key={c.rule_id}>{describe(c, raw)}</li>
        ))}
      </ul>
      {first.mine ? (
        <Button className="mt-3" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("withdraw", () => unwrap(withdrawChange(first.version_id)), "Withdrawn")}>
          Withdraw
        </Button>
      ) : canApprove ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`from-${first.version_id}`}>Live from</Label>
            <Input id={`from-${first.version_id}`} type="date" min={tomorrow} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor={`note-${first.version_id}`}>Note (needed to reject)</Label>
            <Input id={`note-${first.version_id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            disabled={busy !== null}
            onClick={() =>
              void run("approve", async () => {
                await unwrap(approveChange(first.version_id, new Date(`${from}T00:00:00+05:30`).toISOString(), note || undefined));
                await activateDuePolicy();
              }, "Approved")
            }
          >
            Approve
          </Button>
          <Button variant="outline" disabled={busy !== null || note.trim().length < 5} onClick={() => void run("reject", () => unwrap(rejectChange(first.version_id, note)), "Rejected")}>
            Reject
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Waiting for someone with policy approval.</p>
      )}
    </SectionCard>
  );
}

function ModifyRule({
  rule,
  raw,
  onClose,
  onSave,
}: {
  rule: PolicyRule;
  raw: RuleRaw;
  onClose: () => void;
  onSave: (threshold: string, severity: "REJECT" | "MAYBE") => void;
}) {
  const [threshold, setThreshold] = useState(raw.threshold_value);
  const [severity, setSeverity] = useState<"REJECT" | "MAYBE">(raw.severity_on_fail === "MAYBE" ? "MAYBE" : "REJECT");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify: {rule.name}</DialogTitle>
          <DialogDescription>
            The change goes on your draft. It applies only after someone else approves it, from the date they choose.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="m-limit">
              Limit ({rule.operator}){raw.threshold_unit ? `, in ${raw.threshold_unit.toLowerCase()}` : ""}
            </Label>
            <Input id="m-limit" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>If the rule fails</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as "REJECT" | "MAYBE")}>
              <SelectTrigger aria-label="If the rule fails">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REJECT">Decline</SelectItem>
                <SelectItem value="MAYBE">Refer to a person</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!threshold.trim()} onClick={() => onSave(threshold.trim(), severity)}>
            Add to my draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
