/**
 * Credit control view of the Policy Rules screen (backlog CC2.1).
 *
 * The settings in force are read-only here. A change starts as a draft, gets a
 * reason, and goes to someone else for approval; the database refuses anything
 * this screen does not offer, so the screen and the rules cannot drift apart.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/app-shell";
import { PolicyHistory } from "@/components/policy/change-details";
import { PendingChangeCard, when } from "@/components/policy/pending-change";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth";
import {
  NUMERIC_VALUE_TYPES,
  createPolicyDraft,
  discardDraft,
  formatSettingValue,
  getPendingChanges,
  getPolicySettings,
  getPolicyVersions,
  setDraftSetting,
  submitForApproval,
  type PendingChange,
  type PolicySetting,
  type PolicyVersion,
} from "@/lib/policy-api";

const sectionLabel: Record<string, string> = {
  pricing: "Pricing",
  credit: "Credit limits",
  documents: "Documents",
  process: "Process",
};

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "PENDING_APPROVAL") return "warning" as const;
  if (status === "REJECTED" || status === "CANCELLED") return "destructive" as const;
  return "muted" as const;
}

export function PolicyControl() {
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [settings, setSettings] = useState<PolicySetting[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [draft, setDraft] = useState<PolicyVersion | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const live = versions.find((v) => v.status === "ACTIVE") ?? null;

  async function refresh() {
    const [vs, ps, me] = await Promise.all([getPolicyVersions(), getPendingChanges(), getCurrentUser()]);
    setVersions(vs);
    setPending(ps);
    setMeId(me?.id ?? null);
    // Only your own draft. Somebody else's is theirs to finish, and the database
    // refuses your edits to it anyway.
    const mine = vs.find((v) => v.status === "DRAFT" && (me?.id ? v.authoredBy === me.id : false));
    setDraft(mine ?? null);
    const show = mine ?? vs.find((v) => v.status === "ACTIVE");
    setSettings(show ? await getPolicySettings(show.id) : []);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function startDraft() {
    const versionCode = window.prompt("Name for this version, e.g. 2026.10");
    if (!versionCode) return;
    const rationale = window.prompt("Why is this change needed?");
    if (!rationale) return;
    setBusy(true);
    const result = await createPolicyDraft({ versionCode, rationale });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Draft ${versionCode} started from the version in force`);
    await refresh();
  }

  async function saveSetting(s: PolicySetting) {
    if (!draft) return;
    const raw = edits[s.key];
    if (raw === undefined || raw === "") return;
    const numeric = NUMERIC_VALUE_TYPES.includes(s.valueType);
    const value = numeric ? Number(raw) : raw;
    if (numeric && Number.isNaN(value)) {
      toast.error("That is not a number");
      return;
    }
    setBusy(true);
    const result = await setDraftSetting(draft.id, s.key, value);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEdits((prev) => ({ ...prev, [s.key]: "" }));
    setSettings(await getPolicySettings(draft.id));
    toast.success(`${s.label} set to ${value}${s.unit === "%" ? "%" : ""} on the draft`);
  }

  async function send() {
    if (!draft) return;
    const title = window.prompt("One line describing the change", draft.rationale.slice(0, 80));
    if (!title) return;
    setBusy(true);
    const result = await submitForApproval(draft.id, title);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Sent for approval. Someone else has to approve it.");
    await refresh();
  }

  async function discard() {
    if (!draft || !window.confirm(`Discard draft ${draft.versionCode}?`)) return;
    setBusy(true);
    const result = await discardDraft(draft.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Draft discarded");
    await refresh();
  }

  const grouped = settings.reduce<Record<string, PolicySetting[]>>((acc, s) => {
    (acc[s.section] ??= []).push(s);
    return acc;
  }, {});

  if (!loaded) return <SectionCard>Loading the policy in force…</SectionCard>;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={live ? `Version ${live.versionCode} is in force` : "No version in force"}
        description={
          live
            ? `Live since ${when(live.effectiveFrom)}. These values decide every new application. Changing one needs a second person's approval.`
            : "Run the policy migrations to load a version."
        }
        action={
          draft ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={discard}>Discard draft</Button>
              <Button size="sm" disabled={busy} onClick={send}>Send for approval</Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy || !live} onClick={startDraft}>Propose a change</Button>
          )
        }
      >
        {!draft && versions.some((v) => v.status === "DRAFT" && v.authoredBy !== meId) && (
          <p className="mb-3 rounded-lg border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
            Someone else has a draft open. Proposing a change starts your own, separate from theirs.
          </p>
        )}

        {draft && (
          <p className="mb-3 rounded-lg border border-border bg-surface-subtle p-3 text-sm">
            <strong>Draft {draft.versionCode}</strong> — {draft.rationale}. Nothing here affects
            applications until it is approved and its start date arrives.
          </p>
        )}

        {Object.entries(grouped).map(([section, rows]) => (
          <div key={section} className="mb-4">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {sectionLabel[section] ?? section}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Setting</th>
                    <th className="px-3 py-2 text-left font-medium">In force</th>
                    {draft && <th className="px-3 py-2 text-left font-medium">On this draft</th>}
                    <th className="px-3 py-2 text-left font-medium">Allowed</th>
                    {draft && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const changed = draft && JSON.stringify(s.value) !== JSON.stringify(s.liveValue);
                    return (
                      <tr key={s.key} className="border-t border-border">
                        <td className="px-3 py-2">
                          <div className="font-medium">{s.label}</div>
                          <div className="font-mono text-xs text-muted-foreground">{s.key}</div>
                        </td>
                        <td className="px-3 py-2 tabular">
                          {formatSettingValue({ value: s.liveValue, unit: s.unit })}
                        </td>
                        {draft && (
                          <td className="px-3 py-2 tabular">
                            {formatSettingValue(s)}
                            {changed ? <Pill tone="warning" className="ml-2">changed</Pill> : null}
                          </td>
                        )}
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {s.min !== null || s.max !== null ? `${s.min ?? "—"} to ${s.max ?? "—"}` : s.valueType}
                        </td>
                        {draft && (
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Label className="sr-only" htmlFor={`set-${s.key}`}>New value for {s.label}</Label>
                              <Input
                                id={`set-${s.key}`}
                                className="h-8 w-28"
                                inputMode={NUMERIC_VALUE_TYPES.includes(s.valueType) ? "decimal" : "text"}
                                placeholder="New value"
                                value={edits[s.key] ?? ""}
                                onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                              />
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => saveSetting(s)}>
                                Set
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Waiting for approval"
        description="A change can only be approved by someone other than the person who wrote it. Check what it would do to recent applications first."
      >
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((c) => (
              <PendingChangeCard key={c.versionId} change={c} liveVersionCode={live?.versionCode ?? null} onDone={refresh} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Version history" description="Versions are never deleted, so any past decision can be read against the rules that produced it.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Version</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">In force from</th>
                <th className="px-3 py-2 text-left font-medium">Until</th>
                <th className="px-3 py-2 text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{v.versionCode}</td>
                  <td className="px-3 py-2"><Pill tone={statusTone(v.status)}>{v.status.replace("_", " ").toLowerCase()}</Pill></td>
                  <td className="px-3 py-2 text-muted-foreground">{when(v.effectiveFrom)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{when(v.effectiveTo)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{v.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Change history" description="Every step each version has been through, and who took it. Newest first.">
        <PolicyHistory limit={30} />
      </SectionCard>
    </div>
  );
}
