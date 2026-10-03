import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type Baseline = { id: string; name: string; taken_at: string; taken_by: string | null; settings: number };
type Diff = { area: string; item: string; now: unknown; default: unknown; how: string };

const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const day = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Settings defaults (fix list G1): save today's settings by name, and reset to
 * saved defaults after a preview and a typed RESET. Credit policy and the rate
 * grid come back through approval; everything else at once. Admin only.
 */
export function SettingsDefaults() {
  const [list, setList] = useState<Baseline[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ base: Baseline; diff: Diff[] } | null>(null);
  const [confirm, setConfirm] = useState("");

  const load = () =>
    call<Baseline[]>("fn_settings_baselines")
      .then(setList)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (error) return null; // not an admin: the section isn't shown

  return (
    <SectionCard
      title="Settings defaults"
      description="Save today's settings by name, or put every setting back to saved defaults. Cases, customers, documents and loans are never touched."
      className="mt-4"
    >
      <ul className="space-y-1 text-sm">
        {(list ?? []).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-medium">{b.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {day(b.taken_at)}
                {b.taken_by ? ` by ${b.taken_by}` : ""} · {b.settings} settings
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                call<Diff[]>("fn_settings_reset_preview", { p_baseline: b.id })
                  .then((diff) => {
                    setConfirm("");
                    setPreview({ base: b, diff });
                  })
                  .catch((e: Error) => toast.error(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Reset to these…
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="baseline-name">Save today's settings as</Label>
          <Input id="baseline-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Before the October changes" />
        </div>
        <Button
          variant="outline"
          disabled={busy || !name.trim()}
          onClick={() => {
            setBusy(true);
            call<Baseline[]>("fn_settings_baseline_save", { p_name: name })
              .then((l) => {
                setList(l);
                setName("");
                toast.success("Saved");
              })
              .catch((e: Error) => toast.error(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Save
        </Button>
      </div>

      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Reset to "{preview.base.name}"</DialogTitle>
              <DialogDescription>
                {preview.diff.length === 0
                  ? "Every setting already matches these defaults."
                  : `${preview.diff.length} setting${preview.diff.length === 1 ? "" : "s"} differ. Credit policy and the rate grid come back through approval by someone else; the risk model and bureau switches are only listed.`}
              </DialogDescription>
            </DialogHeader>
            {preview.diff.length > 0 && (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Setting</th>
                      <th className="px-2 py-1 text-left font-medium">Now</th>
                      <th className="px-2 py-1 text-left font-medium">Default</th>
                      <th className="px-2 py-1 text-left font-medium">How</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.diff.map((d) => (
                      <tr key={`${d.area}|${d.item}`} className="border-t border-border align-top">
                        <td className="px-2 py-1">
                          <span className="text-muted-foreground">{d.area}:</span> {d.item}
                        </td>
                        <td className="max-w-[160px] px-2 py-1 break-words">{show(d.now)}</td>
                        <td className="max-w-[160px] px-2 py-1 break-words">{show(d.default)}</td>
                        <td className="px-2 py-1">
                          <Pill tone={d.how === "at once" ? "warning" : d.how.startsWith("through") ? "info" : "muted"}>{d.how}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.diff.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
                <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              {preview.diff.length > 0 && (
                <Button
                  variant="destructive"
                  disabled={busy || confirm.trim() !== "RESET"}
                  onClick={() => {
                    setBusy(true);
                    call<{ changed: number; policy_version_for_approval: string | null; rate_grid_for_approval: boolean }>("fn_settings_reset", {
                      p_baseline: preview.base.id,
                      p_confirm: confirm,
                    })
                      .then((r) => {
                        toast.success(
                          `${r.changed} setting${r.changed === 1 ? "" : "s"} reset.` +
                            (r.policy_version_for_approval ? ` Policy version ${r.policy_version_for_approval} waits for approval.` : "") +
                            (r.rate_grid_for_approval ? " A rate grid waits for pricing approval." : ""),
                        );
                        setPreview(null);
                      })
                      .catch((e: Error) => toast.error(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />} Reset
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}
