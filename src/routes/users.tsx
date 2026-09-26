import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, UserPlus } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  listRoleOptions,
  listStaff,
  listStates,
  saveUser,
  sendSignInEmail,
  setUserActive,
  unlockUser,
  type RoleOption,
  type StaffList,
  type StaffUser,
  type StateOption,
} from "@/lib/users-api";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users & Delegation — cercit" },
      {
        name: "description",
        content:
          "Manage credit officers, managers and administrators with their approval limits and branch assignments in cercit.",
      },
      { property: "og:title", content: "Users & Delegation — cercit" },
      {
        property: "og:description",
        content: "Credit team roles, approval limits and branch assignments.",
      },
    ],
  }),
  component: Users,
});

const ALL_STATES = "__all__";

function isLocked(u: StaffUser) {
  return !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
}

function StatusPill({ u }: { u: StaffUser }) {
  if (!u.isActive) return <Pill tone="destructive">Suspended</Pill>;
  if (isLocked(u)) return <Pill tone="warning">Locked</Pill>;
  if (!u.hasLogin) return <Pill tone="info">Not signed in yet</Pill>;
  return <Pill tone="success">Active</Pill>;
}

function Users() {
  const [list, setList] = useState<StaffList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [editing, setEditing] = useState<StaffUser | "new" | null>(null);
  const [statusChange, setStatusChange] = useState<StaffUser | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listStaff());
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Role and state lists are needed only by people who can change accounts.
  useEffect(() => {
    if (!list?.canManage) return;
    void Promise.all([listRoleOptions(), listStates()])
      .then(([r, s]) => {
        setRoles(r);
        setStates(s);
      })
      .catch((e: Error) => toast.error(e.message));
  }, [list?.canManage]);

  const counts = useMemo(() => {
    const u = list?.users ?? [];
    return {
      active: u.filter((x) => x.isActive).length,
      suspended: u.filter((x) => !x.isActive).length,
      locked: u.filter((x) => x.isActive && isLocked(x)).length,
    };
  }, [list]);

  async function run(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell
      title="Users"
      subtitle="Staff accounts, roles and delegated approval limits"
      actions={
        list?.canManage ? (
          <Button onClick={() => setEditing("new")}>
            <UserPlus className="size-4" /> Add user
          </Button>
        ) : undefined
      }
    >
      {list?.sample && (
        <p className="mb-4 rounded-md border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
          Sample staff list. Sign in as an admin to add, change or suspend real accounts.
        </p>
      )}
      {list && !list.sample && !list.canManage && (
        <p className="mb-4 rounded-md border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
          You can see staff accounts. Only an admin can change them.
        </p>
      )}

      <SectionCard
        className="overflow-hidden"
        {...(list
          ? { description: `${counts.active} active · ${counts.suspended} suspended${counts.locked ? ` · ${counts.locked} locked` : ""}` }
          : {})}
      >
        {loadError ? (
          <div className="px-4 py-8 text-center text-sm text-destructive">{loadError}</div>
        ) : !list ? (
          <div className="px-4 py-8 text-center text-muted-foreground">Loading users...</div>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface-subtle text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Branch</th>
                  <th className="px-4 py-2 text-right font-medium">Sanction limit</th>
                  <th className="px-4 py-2 text-right font-medium">Cases / day</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  {list.canManage && <th className="w-12 px-4 py-2" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {list.users.map((u, i) => (
                  <tr key={u.id} className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60", !u.isActive && "text-muted-foreground")}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">
                        {u.fullName}
                        {u.isMe && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.roleName}
                      {u.roleIsLegacy && <span className="ml-1 text-xs text-muted-foreground">(old role)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.stateName ?? "All branches"}</td>
                    <td className="px-4 py-2.5 text-right tabular">{u.maxSanctionAmount == null ? "—" : inr(u.maxSanctionAmount)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{u.dailyCaseLimit ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill u={u} />
                    </td>
                    {list.canManage && (
                      <td className="px-4 py-2.5 text-right">
                        {!u.isMe && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${u.fullName}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(u)}>Edit</DropdownMenuItem>
                              {u.isActive && (
                                <DropdownMenuItem
                                  onSelect={() => void run(() => sendSignInEmail(u.email), `Sign-in email sent to ${u.email}`)}
                                >
                                  Send sign-in email
                                </DropdownMenuItem>
                              )}
                              {isLocked(u) && (
                                <DropdownMenuItem onSelect={() => void run(() => unlockUser(u.id), `${u.fullName} unlocked`)}>
                                  Unlock
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className={u.isActive ? "text-destructive focus:text-destructive" : ""}
                                onSelect={() => setStatusChange(u)}
                              >
                                {u.isActive ? "Suspend" : "Reactivate"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          roles={roles}
          states={states}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            toast.success(msg);
            await load();
          }}
        />
      )}

      {statusChange && (
        <StatusDialog
          user={statusChange}
          onClose={() => setStatusChange(null)}
          onDone={async (msg) => {
            setStatusChange(null);
            toast.success(msg);
            await load();
          }}
        />
      )}
    </AppShell>
  );
}

function UserDialog({
  user,
  roles,
  states,
  onClose,
  onSaved,
}: {
  user: StaffUser | null;
  roles: RoleOption[];
  states: StateOption[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  // Old roles in capitals from the first seed (e.g. ADMIN) carry no rights and
  // cannot be saved again, so the form starts with no role and asks for one.
  const keepsOldRole = !!user?.roleIsLegacy;
  const deadRole = !!user && !keepsOldRole && roles.length > 0 && !roles.some((r) => r.code === user.role);
  const [role, setRole] = useState(deadRole ? "" : (user?.role ?? "credit_officer"));
  const [stateCode, setStateCode] = useState(user?.stateCode ?? ALL_STATES);
  const [limit, setLimit] = useState(user?.maxSanctionAmount?.toString() ?? "");
  const [daily, setDaily] = useState(user?.dailyCaseLimit?.toString() ?? "");
  const [invite, setInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An older role stays selectable for the person who already has it.
  const roleChoices = useMemo(() => {
    if (user && keepsOldRole && !roles.some((r) => r.code === user.role)) {
      return [...roles, { code: user.role, name: `${user.roleName} (old role)`, description: "", decides: false }];
    }
    return roles;
  }, [roles, user]);
  const chosen = roleChoices.find((r) => r.code === role);
  const decides = chosen?.decides ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!role) {
      setError("Choose a role.");
      return;
    }
    setSaving(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      await saveUser({
        id: user?.id ?? null,
        email: cleanEmail,
        fullName: fullName.trim(),
        role,
        stateCode: stateCode === ALL_STATES ? null : stateCode,
        maxSanctionAmount: decides && limit.trim() ? Number(limit.replace(/[^0-9]/g, "")) : null,
        dailyCaseLimit: daily.trim() ? Number(daily) : null,
      });
      let note = user ? `${fullName.trim()} updated` : `${fullName.trim()} added`;
      if (!user && invite) {
        try {
          await sendSignInEmail(cleanEmail);
          note += `; sign-in email sent to ${cleanEmail}`;
        } catch (err) {
          note += `. The sign-in email could not be sent (${(err as Error).message}); use "Send sign-in email" later`;
        }
      }
      await onSaved(note);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{user ? `Edit ${user.fullName}` : "Add user"}</DialogTitle>
            <DialogDescription>
              {user
                ? "Changes apply at once and are recorded in the audit trail."
                : "The person gets a sign-in email. Until they use it, they show as “Not signed in yet”."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="u-email">Work email</Label>
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!user?.hasLogin}
              />
              {user?.hasLogin && (
                <p className="text-xs text-muted-foreground">
                  This person has signed in, so their email is fixed. To move them to a new address, suspend and add them again.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="u-role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleChoices.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-state">Branch (state)</Label>
              <Select value={stateCode} onValueChange={setStateCode}>
                <SelectTrigger id="u-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATES}>All branches</SelectItem>
                  {states.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deadRole && !role && (
              <p className="-mt-2 text-xs text-warning-foreground dark:text-warning sm:col-span-2">
                Their old role ({user?.role}) gives no rights. Choose a current role to save, or close this and suspend them instead.
              </p>
            )}
            {chosen?.description && <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">{chosen.description}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="u-limit">Sanction limit (₹)</Label>
              <Input
                id="u-limit"
                inputMode="numeric"
                value={decides ? limit : ""}
                onChange={(e) => setLimit(e.target.value)}
                disabled={!decides}
                placeholder={decides ? "e.g. 2500000" : "Does not decide cases"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-daily">Cases per day</Label>
              <Input
                id="u-daily"
                type="number"
                min={1}
                max={200}
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                placeholder="No limit"
              />
            </div>
            {!user && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="size-4" />
                Email them a sign-in code now
              </label>
            )}
          </div>

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : user ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  user,
  onClose,
  onDone,
}: {
  user: StaffUser;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const suspending = user.isActive;
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await setUserActive(user.id, !suspending, reason);
      await onDone(`${user.fullName} ${suspending ? "suspended" : "reactivated"}`);
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
            <DialogTitle>
              {suspending ? "Suspend" : "Reactivate"} {user.fullName}?
            </DialogTitle>
            <DialogDescription>
              {suspending
                ? "They can still sign in, but will see nothing and can do nothing until reactivated."
                : "They get back the rights of their role straight away."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="s-reason">Reason (kept in the audit trail)</Label>
            <Textarea id="s-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} rows={3} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={suspending ? "destructive" : "default"} disabled={saving}>
              {saving ? "Saving..." : suspending ? "Suspend" : "Reactivate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
