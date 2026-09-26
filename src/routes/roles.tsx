import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isDemoMode } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  conflictsIn,
  decideRoleChange,
  getRolesOverview,
  proposeRoleChange,
  withdrawRoleChange,
  type RoleRequest,
  type RoleRow,
  type RolesOverview,
} from "@/lib/roles-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Roles & permissions — cercit" },
      { name: "description", content: "What each staff role may do, with changes approved by a second person." },
    ],
  }),
  component: Roles,
});

const MODULE_LABELS: Record<string, string> = {
  cases: "Cases",
  policy: "Credit policy",
  pricing: "Pricing",
  model: "Risk model",
  compliance: "Compliance",
  admin: "Staff and roles",
  audit: "Audit",
  reports: "Reports",
};

function when(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
}

function Roles() {
  const [data, setData] = useState<RolesOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const [rejecting, setRejecting] = useState<RoleRequest | null>(null);
  const sample = !isSupabaseConfigured || isDemoMode();

  const load = useCallback(async () => {
    if (sample) return;
    try {
      setData(await getRolesOverview());
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [sample]);

  useEffect(() => {
    void load();
  }, [load]);

  const describe = useMemo(() => new Map((data?.permissions ?? []).map((p) => [p.code, p.description])), [data]);
  const pendingFor = useMemo(
    () => new Set((data?.requests ?? []).filter((r) => r.status === "PENDING").map((r) => r.role_code)),
    [data],
  );
  const pending = (data?.requests ?? []).filter((r) => r.status === "PENDING");
  const decided = (data?.requests ?? []).filter((r) => r.status !== "PENDING").slice(0, 8);

  async function act(fn: () => Promise<void>, done: string) {
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell
      title="Roles"
      subtitle="What each role may do. Every change needs a second person's approval."
      actions={
        data?.can_manage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New role
          </Button>
        ) : undefined
      }
    >
      {sample ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">
            Roles are managed on the live database. Sign in as an admin to propose changes, or as Compliance to approve them.
          </p>
        </SectionCard>
      ) : loadError ? (
        <SectionCard>
          <p className="text-sm text-destructive">{loadError}</p>
        </SectionCard>
      ) : !data ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">Loading roles...</p>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <SectionCard title={`Waiting for approval (${pending.length})`}>
              <div className="space-y-4">
                {pending.map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    describe={describe}
                    canApprove={data.can_approve && !r.requested_by_me}
                    onApprove={() => void act(() => decideRoleChange(r.id, true, ""), `${r.name}: change approved and applied`)}
                    onReject={() => setRejecting(r)}
                    onWithdraw={() => void act(() => withdrawRoleChange(r.id), `${r.name}: proposal withdrawn`)}
                  />
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard className="overflow-hidden">
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Role</th>
                    <th className="px-4 py-2 text-right font-medium">Rights</th>
                    <th className="px-4 py-2 text-right font-medium">People</th>
                    <th className="px-4 py-2 text-left font-medium">Sign-in</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    {data.can_manage && <th className="px-4 py-2" aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {data.roles.map((role, i) => (
                    <tr key={role.code} className={cn("border-t border-border align-top", i % 2 === 1 && "bg-surface-subtle/60")}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{role.name}</div>
                        <div className="max-w-md text-xs text-muted-foreground">{role.description}</div>
                        {role.waivers.map((w) => (
                          <div key={w.a + w.b} className="mt-1 text-xs text-warning-foreground dark:text-warning">
                            Exception: holds {w.a} and {w.b} until {w.review_by}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{role.permissions.length}</td>
                      <td className="px-4 py-2.5 text-right tabular">{role.active_users}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {role.mfa_required ? "Second step" : "Password"} · idle {role.idle_timeout_minutes} min
                      </td>
                      <td className="px-4 py-2.5">
                        {!role.is_active ? (
                          <Pill tone="muted">Off</Pill>
                        ) : role.is_legacy ? (
                          <Pill tone="muted">Old role</Pill>
                        ) : pendingFor.has(role.code) ? (
                          <Pill tone="warning">Change waiting</Pill>
                        ) : (
                          <Pill tone="success">In use</Pill>
                        )}
                      </td>
                      {data.can_manage && (
                        <td className="px-4 py-2.5 text-right">
                          {role.code !== "admin" && !pendingFor.has(role.code) && (
                            <Button variant="outline" size="sm" onClick={() => setEditing(role)}>
                              Propose change
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {decided.length > 0 && (
            <SectionCard title="Recent decisions">
              <ul className="divide-y divide-border text-sm">
                {decided.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span>
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {r.kind === "CREATE" ? "new role" : "change"} by {r.requested_by ?? "system"}
                        {r.decided_by ? `, ${r.status.toLowerCase()} by ${r.decided_by}` : `, ${r.status.toLowerCase()}`}
                        {r.decision_note ? ` — “${r.decision_note}”` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{when(r.decided_at)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {editing && data && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          data={data}
          onClose={() => setEditing(null)}
          onSent={async (name) => {
            setEditing(null);
            toast.success(`${name}: sent for approval. Nothing changes until Compliance approves.`);
            await load();
          }}
        />
      )}

      {rejecting && (
        <RejectDialog
          r={rejecting}
          onClose={() => setRejecting(null)}
          onDone={async () => {
            setRejecting(null);
            toast.success(`${rejecting.name}: change rejected`);
            await load();
          }}
        />
      )}
    </AppShell>
  );
}

function RequestCard({
  r,
  describe,
  canApprove,
  onApprove,
  onReject,
  onWithdraw,
}: {
  r: RoleRequest;
  describe: Map<string, string>;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => void;
}) {
  const before = new Set(r.before?.permissions ?? []);
  const after = new Set(r.permissions);
  const added = r.permissions.filter((p) => !before.has(p));
  const removed = [...before].filter((p) => !after.has(p));
  const settings: string[] = [];
  if (r.before) {
    if (r.before.name !== r.name) settings.push(`Name: ${r.before.name} → ${r.name}`);
    if (r.before.mfa_required !== r.mfa_required) settings.push(`Second sign-in step: ${r.mfa_required ? "required" : "not required"}`);
    if (r.before.idle_timeout_minutes !== r.idle_timeout_minutes)
      settings.push(`Idle timeout: ${r.before.idle_timeout_minutes} → ${r.idle_timeout_minutes} min`);
    if (r.before.is_active !== r.is_active) settings.push(r.is_active ? "Switch role on" : "Switch role off");
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {r.kind === "CREATE" ? "New role: " : "Change to "}
          {r.name}
        </p>
        <p className="text-xs text-muted-foreground">
          Proposed by {r.requested_by_me ? "you" : (r.requested_by ?? "system")}, {when(r.requested_at)}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">“{r.reason}”</p>
      <ul className="mt-3 space-y-1 text-sm">
        {added.map((p) => (
          <li key={p} className="text-success">
            + {describe.get(p) ?? p} <span className="text-xs text-muted-foreground">({p})</span>
          </li>
        ))}
        {removed.map((p) => (
          <li key={p} className="text-destructive">
            − {describe.get(p) ?? p} <span className="text-xs text-muted-foreground">({p})</span>
          </li>
        ))}
        {settings.map((s) => (
          <li key={s} className="text-muted-foreground">
            · {s}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove && (
          <>
            <Button size="sm" onClick={onApprove}>
              Approve and apply
            </Button>
            <Button size="sm" variant="outline" onClick={onReject}>
              Reject
            </Button>
          </>
        )}
        {r.requested_by_me && (
          <Button size="sm" variant="outline" onClick={onWithdraw}>
            Withdraw
          </Button>
        )}
        {!canApprove && !r.requested_by_me && (
          <p className="text-xs text-muted-foreground">Waiting for Compliance to approve.</p>
        )}
        {r.requested_by_me && (
          <p className="self-center text-xs text-muted-foreground">Someone in Compliance must approve this.</p>
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  data,
  onClose,
  onSent,
}: {
  role: RoleRow | null;
  data: RolesOverview;
  onClose: () => void;
  onSent: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState(role?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [mfa, setMfa] = useState(role?.mfa_required ?? false);
  const [idle, setIdle] = useState(String(role?.idle_timeout_minutes ?? 15));
  const [active, setActive] = useState(role?.is_active ?? true);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new role's code follows its name until someone types one.
  useEffect(() => {
    if (!role && !codeTouched) {
      setCode(name.toLowerCase().trim().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30));
    }
  }, [name, role, codeTouched]);

  const modules = useMemo(() => {
    const m = new Map<string, typeof data.permissions>();
    for (const p of data.permissions) m.set(p.module, [...(m.get(p.module) ?? []), p]);
    return [...m.entries()];
  }, [data.permissions]);

  const clashes = conflictsIn([...perms], data.conflicts, role?.waivers ?? []);

  function toggle(p: string, on: boolean) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (clashes.length) {
      setError("Remove one right from each conflicting pair first.");
      return;
    }
    setSaving(true);
    try {
      await proposeRoleChange({
        code,
        name: name.trim(),
        description: description.trim(),
        permissions: [...perms].sort(),
        mfaRequired: mfa,
        idleTimeoutMinutes: Number(idle),
        isActive: active,
        reason: reason.trim(),
      });
      await onSent(name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{role ? `Propose a change to ${role.name}` : "Propose a new role"}</DialogTitle>
            <DialogDescription>
              Nothing changes until someone in Compliance approves it. You cannot approve your own proposal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Name</Label>
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-code">Code</Label>
              <Input
                id="r-code"
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toLowerCase());
                }}
                disabled={!!role}
                required
                pattern="[a-z][a-z_]{1,29}"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-desc">What this role is for</Label>
              <Input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="r-mfa" className="font-normal">
                Second sign-in step
              </Label>
              <Switch id="r-mfa" checked={mfa} onCheckedChange={setMfa} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="r-idle" className="font-normal">
                Sign out after idle (min)
              </Label>
              <Input
                id="r-idle"
                type="number"
                min={5}
                max={60}
                value={idle}
                onChange={(e) => setIdle(e.target.value)}
                className="h-8 w-20"
              />
            </div>
            {role && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 sm:col-span-2">
                <Label htmlFor="r-active" className="font-normal">
                  Role switched on {role.active_users > 0 && <span className="text-muted-foreground">({role.active_users} people hold it)</span>}
                </Label>
                <Switch id="r-active" checked={active} onCheckedChange={setActive} />
              </div>
            )}
          </div>

          <fieldset className="space-y-4">
            <legend className="text-sm font-medium">Rights ({perms.size})</legend>
            {modules.map(([module, list]) => (
              <div key={module}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {MODULE_LABELS[module] ?? module}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((p) => (
                    <label key={p.code} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0"
                        checked={perms.has(p.code)}
                        onChange={(e) => toggle(p.code, e.target.checked)}
                      />
                      <span>
                        {p.description}
                        <span className="block text-xs text-muted-foreground">{p.code}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          {clashes.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {clashes.map((c) => (
                <p key={c.a + c.b}>
                  {c.a} and {c.b} cannot sit on one role: {c.reason}.
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="r-reason">Why (the approver reads this)</Label>
            <Textarea id="r-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} />
          </div>

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || clashes.length > 0}>
              {saving ? "Sending..." : "Send for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ r, onClose, onDone }: { r: RoleRequest; onClose: () => void; onDone: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await decideRoleChange(r.id, false, note);
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reject the change to {r.name}?</DialogTitle>
            <DialogDescription>The proposer sees your reason. Nothing about the role changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rj-note">Reason</Label>
            <Textarea id="rj-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} required minLength={5} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Saving..." : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
