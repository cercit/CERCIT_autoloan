import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Plus, Search, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, LabelValue, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECK_LABEL,
  EMPLOYER_TYPES,
  decideCategory,
  getEmployer,
  listEmployers,
  requestCategory,
  runEmployerChecks,
  saveEmployer,
  typeLabel,
  type EmployerDetail,
  type EmployerInput,
  type EmployerList,
  type EmployerType,
} from "@/lib/employer-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "Employer Master — cercit" },
      { name: "description", content: "Employers, their A/B/C category and the checks behind each field, used in cercit credit decisions." },
    ],
  }),
  component: Employers,
});

const ALL = "__all";
const catTone = (c: string) => (c === "A" ? "success" : c === "B" ? "warning" : "destructive") as "success" | "warning" | "destructive";
const resultTone = (r: string) =>
  (r === "PASS" ? "success" : r === "FAIL" ? "destructive" : r === "REVIEW" ? "warning" : "muted") as
    | "success"
    | "destructive"
    | "warning"
    | "muted";
const resultText: Record<string, string> = { PASS: "Pass", FAIL: "Fail", REVIEW: "To check", NOT_APPLICABLE: "Not needed", INFO: "Info" };
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Employers() {
  const [list, setList] = useState<EmployerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmployerDetail["employer"] | "new" | null>(null);

  const refresh = useCallback(() => {
    listEmployers(query, category === ALL ? undefined : category)
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [query, category]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);

  const rows = list?.rows ?? [];

  return (
    <AppShell
      title="Employer Master"
      subtitle="The employer's category sets the rate loading, LTV and tenure caps and the processing fee"
      actions={
        list?.can_manage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add employer
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          The employers could not be loaded: {error}
        </div>
      )}
      {list && (
        <p className="mb-3 text-xs text-muted-foreground">
          {list.sample
            ? "Sample employers (sample mode)."
            : `Company checks: ${list.provider === "SIMULATED" ? "simulated (from the CIN itself; a live MCA lookup comes later)" : list.provider}. `}
          {list.pending > 0 && `${list.pending} category change${list.pending === 1 ? "" : "s"} waiting for a second person.`}
        </p>
      )}
      <SectionCard className="overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, other names, CIN or GSTIN" className="pl-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              <SelectItem value="A">Category A</SelectItem>
              <SelectItem value="B">Category B</SelectItem>
              <SelectItem value="C">Category C</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Employer</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Verified</th>
                <th className="px-4 py-2 text-left font-medium">Last checked</th>
                <th className="px-4 py-2 text-right font-medium">Cases</th>
                <th className="px-4 py-2 text-right font-medium">Late loans</th>
              </tr>
            </thead>
            <tbody>
              {!list && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Loading employers…
                  </td>
                </tr>
              )}
              {rows.map((e, i) => (
                <tr
                  key={e.id}
                  className={cn("cursor-pointer border-t border-border hover:bg-surface-subtle", i % 2 === 1 && "bg-surface-subtle/60")}
                  onClick={() => !list?.sample && setOpenId(e.id)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{e.name}</span>
                    {e.caution && (
                      <Pill tone="destructive" className="ml-2">
                        Caution
                      </Pill>
                    )}
                    {e.aliases.length > 0 && <span className="block text-xs text-muted-foreground">also {e.aliases.join(", ")}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{typeLabel(e.employer_type)}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={catTone(e.category)}>{e.category}</Pill>
                    {!e.verified && <span className="ml-2 text-xs text-muted-foreground">provisional</span>}
                    {e.pending_change && <span className="ml-2 text-xs text-warning-foreground dark:text-warning">change waiting</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.verified ? <Check className="size-4 text-success" /> : <X className="size-4 text-muted-foreground" />}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {day(e.last_verified_at)}
                    {e.last_verified_by && <span className="block text-xs">{e.last_verified_by}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{e.cases}</td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {e.loans > 0 ? `${e.late_loans} of ${e.loans} (${((e.late_loans / e.loans) * 100).toFixed(1)}%)` : "—"}
                  </td>
                </tr>
              ))}
              {list && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No employers match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <EmployerSheet
        id={openId}
        canManage={Boolean(list?.can_manage)}
        onClose={() => setOpenId(null)}
        onEdit={(e) => setEditing(e)}
        onChanged={refresh}
      />
      {editing && (
        <EmployerForm
          employer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            refresh();
            setOpenId(id);
          }}
        />
      )}
    </AppShell>
  );
}

function EmployerSheet({
  id,
  canManage,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (e: EmployerDetail["employer"]) => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<EmployerDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [askCat, setAskCat] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setD(null);
    if (id) getEmployer(id).then(setD).catch((e: Error) => toast.error(e.message));
  }, [id]);

  const act = async (key: string, fn: () => Promise<EmployerDetail | void>) => {
    setBusy(key);
    try {
      const next = await fn();
      if (next) setD(next);
      else if (id) setD(await getEmployer(id));
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const e = d?.employer;
  const pending = d?.changes.find((c) => c.status === "PENDING");

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{e?.name ?? "Employer"}</SheetTitle>
          <SheetDescription>
            {e ? `${typeLabel(e.employer_type)} · Category ${e.category}${e.verified ? " · verified" : " · provisional, not verified"}` : "Loading…"}
          </SheetDescription>
        </SheetHeader>
        {e && d && (
          <div className="mt-4 space-y-5 px-4 pb-6 text-sm">
            {e.caution && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> On the caution list: {e.caution_reason}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <LabelValue label="CIN" value={e.cin ?? "—"} />
              <LabelValue label="GSTIN" value={e.gstin ?? "—"} />
              <LabelValue label="Listed" value={e.listed ? `Yes${e.listed_symbol ? ` (${e.listed_symbol})` : ""}` : e.listed === false ? "No" : "Not known"} />
              <LabelValue label="Company status" value={e.company_status.replace("_", " ").toLowerCase()} />
              <LabelValue label="Incorporated" value={e.incorporated_on ? day(e.incorporated_on) : e.incorporation_year ? String(e.incorporation_year) : "—"} />
              <LabelValue label="Years of filings" value={e.years_of_filings ?? "—"} />
              <LabelValue label="Email domains" value={e.email_domains.join(", ") || "—"} />
              <LabelValue label="Industry" value={e.industry ?? "—"} />
              <LabelValue label="Head office" value={[e.hq_city, e.hq_state].filter(Boolean).join(", ") || "—"} />
              <LabelValue label="Other names" value={e.aliases.join(", ") || "—"} />
              <LabelValue label="Cases / late loans" value={`${e.cases ?? 0} / ${e.late_loans ?? 0} of ${e.loans ?? 0}`} />
              <LabelValue label="Last checked" value={`${day(e.last_verified_at)}${e.last_verified_by_name ? ` by ${e.last_verified_by_name}` : ""}`} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checks</h3>
                {canManage && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("checks", () => runEmployerChecks(e.id))}>
                    {busy === "checks" && <Loader2 className="size-4 animate-spin" />} Run the checks
                  </Button>
                )}
              </div>
              {d.checks.length === 0 ? (
                <p className="text-muted-foreground">Not checked yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {d.checks.map((c) => (
                    <li key={c.check} className="flex items-start justify-between gap-3 p-2">
                      <span>
                        <span className="font-medium">{CHECK_LABEL[c.check] ?? c.check}</span>
                        <span className="block text-xs text-muted-foreground">
                          {String(c.detail.note ?? "")} · source: {c.source.toLowerCase().replace("_", " ")} · {day(c.at)}
                        </span>
                      </span>
                      <Pill tone={resultTone(c.result)}>{resultText[c.result] ?? c.result}</Pill>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                The rule gives category {d.rule_category}: government, PSU, listed or MNC is A; a limited company or LLP with 3+ years of
                filings is B; anything else is C.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</h3>
              {pending ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                  <p>
                    Change {pending.from} → {pending.to} asked by {pending.requested_by ?? "someone"} on {day(pending.requested_at)}: {pending.reason}
                  </p>
                  {canManage && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pending.requested_by_me ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("w", () => decideCategory(pending.id, "WITHDRAW"))}>
                          Withdraw
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" disabled={busy !== null} onClick={() => void act("a", () => decideCategory(pending.id, "APPROVE"))}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("r", () => decideCategory(pending.id, "REJECT"))}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {pending.requested_by_me && <p className="mt-1 text-xs text-muted-foreground">A second person must approve it.</p>}
                </div>
              ) : canManage ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={askCat} onValueChange={setAskCat}>
                    <SelectTrigger className="w-32" aria-label="New category">
                      <SelectValue placeholder="New category" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A", "B", "C"].filter((c) => c !== e.category).map((c) => (
                        <SelectItem key={c} value={c}>
                          Category {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="min-w-48 flex-1" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!askCat || reason.trim().length < 5 || busy !== null}
                    onClick={() =>
                      void act("ask", async () => {
                        await requestCategory(e.id, askCat, reason);
                        setAskCat("");
                        setReason("");
                      })
                    }
                  >
                    Ask for the change
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Category {e.category}.</p>
              )}
              {d.changes.filter((c) => c.status !== "PENDING").length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {d.changes
                    .filter((c) => c.status !== "PENDING")
                    .map((c) => (
                      <li key={c.id}>
                        {day(c.requested_at)}: {c.from} → {c.to} {c.status.toLowerCase()}
                        {c.decided_by ? ` by ${c.decided_by}` : ""} (asked by {c.requested_by ?? "—"}: {c.reason})
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {canManage && (
              <Button variant="outline" onClick={() => onEdit(e)}>
                Edit details
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmployerForm({
  employer,
  onClose,
  onSaved,
}: {
  employer: EmployerDetail["employer"] | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState<EmployerInput>({
    name: employer?.name ?? "",
    employer_type: employer?.employer_type ?? "PRIVATE_LTD",
    aliases: employer?.aliases ?? [],
    cin: employer?.cin ?? "",
    gstin: employer?.gstin ?? "",
    email_domains: employer?.email_domains ?? [],
    industry: employer?.industry ?? "",
    hq_city: employer?.hq_city ?? "",
    hq_state: employer?.hq_state ?? "",
    incorporated_on: employer?.incorporated_on ?? "",
    caution: employer?.caution ?? false,
    caution_reason: employer?.caution_reason ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof EmployerInput>(k: K, v: EmployerInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await saveEmployer(employer?.id ?? null, f));
      toast.success("Employer saved. Run the checks to verify it.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employer ? "Edit employer" : "Add employer"}</DialogTitle>
          <DialogDescription>
            The category isn't set here: the checks work it out, and a change needs a second person to approve it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="e-aliases">Other names on payslips (comma separated)</Label>
            <Input id="e-aliases" value={f.aliases.join(", ")} onChange={(e) => set("aliases", list(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={f.employer_type} onValueChange={(v) => set("employer_type", v as EmployerType)}>
              <SelectTrigger aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-industry">Industry</Label>
            <Input id="e-industry" value={f.industry} onChange={(e) => set("industry", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-cin">CIN</Label>
            <Input id="e-cin" value={f.cin} onChange={(e) => set("cin", e.target.value.toUpperCase())} placeholder="21 characters" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-gstin">GSTIN</Label>
            <Input id="e-gstin" value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="15 characters" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-inc">Date of incorporation</Label>
            <Input id="e-inc" type="date" value={f.incorporated_on} onChange={(e) => set("incorporated_on", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-domains">Official email domains</Label>
            <Input id="e-domains" value={f.email_domains.join(", ")} onChange={(e) => set("email_domains", list(e.target.value))} placeholder="infosys.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-city">Head-office city</Label>
            <Input id="e-city" value={f.hq_city} onChange={(e) => set("hq_city", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-state">State code</Label>
            <Input id="e-state" value={f.hq_state} maxLength={2} onChange={(e) => set("hq_state", e.target.value.toUpperCase())} placeholder="KA" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="e-caution" checked={f.caution} onCheckedChange={(v) => set("caution", v)} />
            <Label htmlFor="e-caution">On the caution list (cases go to a person)</Label>
          </div>
          {f.caution && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-reason">Reason</Label>
              <Textarea id="e-reason" rows={2} value={f.caution_reason} onChange={(e) => set("caution_reason", e.target.value)} />
            </div>
          )}
        </div>
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !f.name.trim()} onClick={() => void save()}>
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
