import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addProduct,
  decideGrid,
  getGridOverview,
  saveDraft,
  startDraft,
  submitDraft,
  withdrawDraft,
  type GridBand,
  type GridCategory,
  type GridOverview,
  type GridVersion,
} from "@/lib/pricing-api";
import { cn } from "@/lib/utils";

const STATUS: Record<GridVersion["status"], { text: string; tone: "success" | "warning" | "muted" | "destructive" | "info" }> = {
  DRAFT: { text: "Draft", tone: "muted" },
  PENDING_APPROVAL: { text: "Waiting for approval", tone: "warning" },
  APPROVED: { text: "Approved, starts on its date", tone: "info" },
  ACTIVE: { text: "In force", tone: "success" },
  SUPERSEDED: { text: "Replaced", tone: "muted" },
  REJECTED: { text: "Rejected", tone: "destructive" },
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Grid versions (fix list G3): edit the rate grid or add one for another
 * product, through a draft that a second person approves, live from a date.
 */
export function RateGridVersions({ onLive }: { onLive: () => void }) {
  const [product, setProduct] = useState("CAR_NEW_SALARIED");
  const [o, setO] = useState<GridOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    getGridOverview(product)
      .then((x) => {
        setO(x);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [product]);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      load();
      onLive();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <SectionCard title="Grid versions" className="mt-4">
        <p className="text-sm text-destructive">The grid versions could not be loaded: {error}</p>
      </SectionCard>
    );
  }
  if (!o) return null;
  const current = o.products.find((p) => p.code === product);

  return (
    <SectionCard
      title="Grid versions"
      description="Changes go through a draft that someone else approves, and start on a date. Every grid stays on record, so each decision shows the grid it was priced on."
      className="mt-4"
      action={
        o.can_author ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add a product
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2">
        {o.products.map((p) => (
          <Button key={p.code} size="sm" variant={p.code === product ? "default" : "outline"} onClick={() => setProduct(p.code)}>
            {p.name}
          </Button>
        ))}
      </div>
      {current && !current.used_by_engine && (
        <p className="mt-2 text-xs text-muted-foreground">
          The engine prices new car loans for salaried customers only; this grid is kept and approved for when this product starts.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {o.in_force ? (
          <p className="text-sm">
            In force: version {o.in_force.version_no}, since {day(o.in_force.effective_from)}
            {o.in_force.approved_by ? `, approved by ${o.in_force.approved_by}` : ""}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No grid in force for this product yet.</p>
        )}
        {o.approved_next && (
          <p className="text-sm">
            Version {o.approved_next.version_no} is approved and starts on {day(o.approved_next.effective_from)}.
          </p>
        )}

        {o.open ? (
          <OpenVersion
            key={o.open.id + o.open.status}
            v={o.open}
            canApprove={o.can_approve}
            busy={busy}
            run={run}
          />
        ) : (
          o.can_author && (
            <Button disabled={busy !== null} onClick={() => void run("start", () => startDraft(product), "Draft started from the grid in force")}>
              {busy === "start" && <Loader2 className="size-4 animate-spin" />} Edit the grid
            </Button>
          )
        )}

        {o.history.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
            <ul className="space-y-1 text-sm">
              {o.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Version {h.version_no}</span>
                  <Pill tone={STATUS[h.status].tone}>{STATUS[h.status].text}</Pill>
                  <span className="text-muted-foreground">
                    {h.effective_from ? `${day(h.effective_from)} – ${h.effective_to ? day(h.effective_to) : "now"}` : ""}
                    {h.authored_by ? ` · by ${h.authored_by}` : ""}
                    {h.approved_by ? ` · approved by ${h.approved_by}` : ""}
                    {h.rationale ? ` · ${h.rationale}` : ""}
                    {h.status === "REJECTED" && h.decision_note ? ` · rejected: ${h.decision_note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {adding && (
        <AddProduct
          onClose={() => setAdding(false)}
          onAdd={(code, name, desc) =>
            run("product", async () => {
              await addProduct(code, name, desc);
              setAdding(false);
              setProduct(code.toUpperCase().replace(/[^A-Z0-9]+/g, "_"));
            }, "Product added with a draft grid to fill in")
          }
        />
      )}
    </SectionCard>
  );
}

function OpenVersion({
  v,
  canApprove,
  busy,
  run,
}: {
  v: GridVersion;
  canApprove: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const editable = v.status === "DRAFT" && v.authored_by_me;
  const [bands, setBands] = useState<GridBand[]>(v.bands);
  const [cats, setCats] = useState<GridCategory[]>(v.categories);
  const [problems, setProblems] = useState<string[]>(v.problems ?? []);
  const [from, setFrom] = useState(todayIst());
  const [why, setWhy] = useState(v.rationale ?? "");
  const [note, setNote] = useState("");

  const setBand = (i: number, k: keyof GridBand, val: string) =>
    setBands((b) => b.map((x, j) => (j === i ? { ...x, [k]: k === "band_label" || k === "rate_type" ? val : Number(val) } : x)));
  const setCat = (i: number, k: keyof GridCategory, val: string) =>
    setCats((c) => c.map((x, j) => (j === i ? { ...x, [k]: Number(val) } : x)));

  const save = () =>
    run("save", async () => {
      const r = await saveDraft(v.id, bands, cats);
      setProblems(r.problems ?? []);
    }, "Draft saved");

  const num = (value: number, onChange: (s: string) => void, label: string, step = "0.01") =>
    editable ? (
      <Input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value)} className="h-8 w-24 text-right" aria-label={label} />
    ) : (
      <span className="tabular">{value}</span>
    );

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-medium">Version {v.version_no}</span>
        <Pill tone={STATUS[v.status].tone}>{STATUS[v.status].text}</Pill>
        <span className="text-sm text-muted-foreground">
          by {v.authored_by ?? "—"}
          {v.status === "PENDING_APPROVAL" && v.effective_from ? ` · to start ${day(v.effective_from)}` : ""}
          {v.rationale ? ` · ${v.rationale}` : ""}
        </span>
      </div>

      <div className="-mx-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Band</th>
              <th className="px-3 py-2 text-right font-medium">Score from</th>
              <th className="px-3 py-2 text-right font-medium">to</th>
              <th className="px-3 py-2 text-right font-medium">Rate %</th>
              <th className="px-3 py-2 text-right font-medium">Max LTV %</th>
              <th className="px-3 py-2 text-right font-medium">Max FOIR %</th>
              <th className="px-3 py-2 text-right font-medium">Max tenure</th>
              {editable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5">
                  {editable ? (
                    <Input value={b.band_label} onChange={(e) => setBand(i, "band_label", e.target.value.toUpperCase())} className="h-8 w-28" aria-label="Band name" />
                  ) : (
                    b.band_label
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">{num(b.score_band_min, (s) => setBand(i, "score_band_min", s), "Score from", "1")}</td>
                <td className="px-3 py-1.5 text-right">{num(b.score_band_max, (s) => setBand(i, "score_band_max", s), "Score to", "1")}</td>
                <td className="px-3 py-1.5 text-right">{num(b.rate_pct, (s) => setBand(i, "rate_pct", s), "Rate")}</td>
                <td className="px-3 py-1.5 text-right">{num(b.max_ltv_pct, (s) => setBand(i, "max_ltv_pct", s), "Max LTV")}</td>
                <td className="px-3 py-1.5 text-right">{num(b.max_foir_pct, (s) => setBand(i, "max_foir_pct", s), "Max FOIR")}</td>
                <td className="px-3 py-1.5 text-right">{num(b.max_tenure_months, (s) => setBand(i, "max_tenure_months", s), "Max tenure", "1")}</td>
                {editable && (
                  <td className="px-3 py-1.5 text-right">
                    <Button size="icon" variant="ghost" aria-label="Remove band" onClick={() => setBands((x) => x.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() =>
            setBands((b) => [
              ...b,
              { band_label: "NEW", score_band_min: 300, score_band_max: 300, rate_pct: 0, rate_type: "STANDARD", max_ltv_pct: 0, max_foir_pct: 0, max_tenure_months: 0 },
            ])
          }
        >
          <Plus className="size-4" /> Add a band
        </Button>
      )}

      <div className="-mx-3 mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-subtle text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Employer category</th>
              <th className="px-3 py-2 text-right font-medium">Loading %</th>
              <th className="px-3 py-2 text-right font-medium">LTV cap %</th>
              <th className="px-3 py-2 text-right font-medium">Tenure cap</th>
              <th className="px-3 py-2 text-right font-medium">Processing fee ₹</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c, i) => (
              <tr key={c.category_code} className="border-t border-border">
                <td className="px-3 py-1.5">{c.category_label}</td>
                <td className="px-3 py-1.5 text-right">{num(c.rate_loading_pct, (s) => setCat(i, "rate_loading_pct", s), "Loading")}</td>
                <td className="px-3 py-1.5 text-right">{num(c.max_ltv_pct, (s) => setCat(i, "max_ltv_pct", s), "LTV cap")}</td>
                <td className="px-3 py-1.5 text-right">{num(c.max_tenure_months, (s) => setCat(i, "max_tenure_months", s), "Tenure cap", "1")}</td>
                <td className="px-3 py-1.5 text-right">{num(c.processing_fee_inr, (s) => setCat(i, "processing_fee_inr", s), "Fee", "100")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void save()}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" />} Save draft
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => void run("discard", () => withdrawDraft(v.id, true), "Draft discarded")}>
              Discard draft
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="g-from">Starts on</Label>
              <Input id="g-from" type="date" min={todayIst()} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-why">Why it is changing</Label>
              <Input id="g-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="A sentence for the approver" />
            </div>
            <Button
              disabled={busy !== null || why.trim().length < 10}
              onClick={() =>
                void run("submit", async () => {
                  await saveDraft(v.id, bands, cats);
                  await submitDraft(v.id, from, why);
                }, "Sent for approval")
              }
            >
              Send for approval
            </Button>
          </div>
        </div>
      )}

      {v.status === "PENDING_APPROVAL" && (
        <div className="mt-3 space-y-2">
          {v.authored_by_me ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Waiting for someone with pricing approval.</span>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("withdraw", () => withdrawDraft(v.id, false), "Back to a draft")}>
                Withdraw to edit
              </Button>
            </div>
          ) : canApprove ? (
            <div className="space-y-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to reject)" />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => void run("approve", () => decideGrid(v.id, true, note), "Approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null || note.trim().length < 5} onClick={() => void run("reject", () => decideGrid(v.id, false, note), "Rejected")}>
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Waiting for someone with pricing approval.</p>
          )}
        </div>
      )}
      {v.status === "DRAFT" && !v.authored_by_me && (
        <p className={cn("mt-3 text-sm text-muted-foreground")}>{v.authored_by ?? "Someone"} is drafting a change.</p>
      )}
    </div>
  );
}

function AddProduct({ onClose, onAdd }: { onClose: () => void; onAdd: (code: string, name: string, desc: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a product or segment</DialogTitle>
          <DialogDescription>It starts with a draft copied from the car grid, for you to change and send for approval.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Commercial vehicle, salaried" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-code">Short code</Label>
            <Input id="p-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CV_SALARIED" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={code.trim().length < 3 || name.trim().length < 3} onClick={() => onAdd(code, name, desc)}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
