import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isDemoMode } from "@/lib/auth";
import { getOrgSettings, saveOrgSettings, type OrgSettings } from "@/lib/org-api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SettingsDefaults } from "@/components/settings-defaults";

export const Route = createFileRoute("/organisation")({
  head: () => ({
    meta: [
      { title: "Organisation — cercit" },
      { name: "description", content: "The lender's registered details, customer contacts and staff email domains." },
    ],
  }),
  component: Organisation,
});

type Form = Omit<OrgSettings, "updated_at" | "updated_by" | "can_manage" | "staff_email_domains"> & {
  staff_email_domains: string;
};

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Organisation() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sample = !isSupabaseConfigured || isDemoMode();

  async function load() {
    try {
      const s = await getOrgSettings();
      setSettings(s);
      setForm({ ...s, staff_email_domains: s.staff_email_domains.join(", ") });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!sample) void load();
  }, [sample]);

  const set = (k: keyof Form) => (v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof Form) => String(form?.[k] ?? "");
  const locked = !settings?.can_manage;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await saveOrgSettings({
        ...form,
        grievance_reply_days: Number(form.grievance_reply_days),
        staff_email_domains: form.staff_email_domains
          .split(/[,\s]+/)
          .map((d) => d.trim().replace(/^@/, ""))
          .filter(Boolean),
      });
      toast.success("Organisation details saved");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Organisation" subtitle="Registered details, customer contacts and staff email domains">
      {sample ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">These settings live in the database. Sign in as an admin to change them.</p>
        </SectionCard>
      ) : !form ? (
        <SectionCard>
          <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error ?? "Loading..."}</p>
        </SectionCard>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          {locked && (
            <p className="rounded-md border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
              You can see these details. Only an admin can change them.
            </p>
          )}

          <SectionCard title="Who we are" description="Shown on the legal page. RBI rules expect a lender to publish these.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="o-name" label="Brand name" value={text("company_name")} onChange={set("company_name")} disabled={locked} />
              <Field id="o-legal" label="Registered company name" value={text("legal_name")} onChange={set("legal_name")} disabled={locked} placeholder="Not set" />
              <Field id="o-cin" label="CIN" value={text("cin")} onChange={set("cin")} disabled={locked} placeholder="Not set" hint="21 characters, e.g. U65999KA2026PTC123456" />
              <Field id="o-rbi" label="RBI registration number" value={text("rbi_registration_no")} onChange={set("rbi_registration_no")} disabled={locked} placeholder="Not set" hint="Certificate of Registration number" />
              <Field id="o-gst" label="GSTIN" value={text("gstin")} onChange={set("gstin")} disabled={locked} placeholder="Not set" />
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="o-addr">Registered address</Label>
                <Textarea id="o-addr" rows={2} value={text("registered_address")} onChange={(e) => set("registered_address")(e.target.value)} disabled={locked} placeholder="Not set" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Customer contacts" description="Shown in the site footer and on the grievance page.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="o-semail" label="Support email" type="email" value={text("support_email")} onChange={set("support_email")} disabled={locked} />
              <Field id="o-sphone" label="Support phone" value={text("support_phone")} onChange={set("support_phone")} disabled={locked} />
              <Field id="o-gname" label="Grievance Redressal Officer" value={text("grievance_officer_name")} onChange={set("grievance_officer_name")} disabled={locked} placeholder="Not set" />
              <Field id="o-gemail" label="Grievance officer email" type="email" value={text("grievance_officer_email")} onChange={set("grievance_officer_email")} disabled={locked} />
              <Field id="o-gphone" label="Grievance officer phone" value={text("grievance_officer_phone")} onChange={set("grievance_officer_phone")} disabled={locked} placeholder="Not set" />
              <Field id="o-days" label="Reply within (working days)" type="number" value={text("grievance_reply_days")} onChange={set("grievance_reply_days")} disabled={locked} />
            </div>
          </SectionCard>

          <SectionCard title="Staff email domains" description="Company addresses staff accounts use.">
            <div className="space-y-4">
              <Field
                id="o-domains"
                label="Domains"
                value={text("staff_email_domains")}
                onChange={set("staff_email_domains")}
                disabled={locked}
                hint="Separate with commas, e.g. cercit.in, cercit.com"
              />
              <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-3">
                <div>
                  <Label htmlFor="o-restrict" className="font-normal">
                    Staff must use these domains
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When on, no staff account can be added on any other address. Leave off while test users use Gmail.
                  </p>
                </div>
                <Switch
                  id="o-restrict"
                  checked={!!form.restrict_staff_domains}
                  onCheckedChange={(v) => set("restrict_staff_domains")(v)}
                  disabled={locked}
                />
              </div>
            </div>
          </SectionCard>

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {settings?.updated_by
                ? `Last changed by ${settings.updated_by}, ${new Date(settings.updated_at ?? "").toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Not changed since setup"}
            </p>
            {!locked && (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            )}
          </div>
        </form>
      )}
      {isSupabaseConfigured && !isDemoMode() && settings?.can_manage && <SettingsDefaults />}
    </AppShell>
  );
}
