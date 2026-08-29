import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, FileUp, Plus, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, LabelValue, SectionCard } from "@/components/app-shell";
import { CategoryBadge, Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emiFor, inr } from "@/lib/format";
import { employers, makes } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/applications/new")({
  head: () => ({
    meta: [
      { title: "New Application — cercit" },
      {
        name: "description",
        content:
          "Capture customer, employment, vehicle, obligation and document details for a new car loan application in five guided steps.",
      },
      { property: "og:title", content: "New Application — cercit" },
      {
        property: "og:description",
        content: "Five-step guided intake for a new car loan application.",
      },
    ],
  }),
  component: NewApplication,
});

const steps = ["Customer Details", "Employment", "Vehicle & Deal", "Obligations", "Documents"];

const states = [
  "Tamil Nadu",
  "Karnataka",
  "Kerala",
  "Telangana",
  "Andhra Pradesh",
  "Maharashtra",
  "Delhi",
];

const docSlots = [
  { name: "PAN Card", required: true },
  { name: "Aadhaar Card", required: true },
  { name: "Salary Slip — Month 1", required: true },
  { name: "Salary Slip — Month 2", required: true },
  { name: "Salary Slip — Month 3", required: true },
  { name: "Bank Statement — 6 months", required: true, note: "PDF from bank portal preferred" },
  { name: "Form 16", required: true },
  { name: "Employee ID / Appointment Letter", required: true },
  { name: "Dealer Quotation", required: true },
  { name: "Additional Documents", required: false, note: "Multi-file upload" },
];

type ObligationRow = {
  id: number;
  lender: string;
  type: string;
  original: string;
  outstanding: string;
  emi: string;
  tenure: string;
  dpd: string;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NewApplication() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const [netSalary, setNetSalary] = useState("85000");
  const [make, setMake] = useState("Hyundai");
  const [onRoad, setOnRoad] = useState("2115000");
  const [loanAmount, setLoanAmount] = useState("850000");
  const [tenure, setTenure] = useState("60");
  const [showEmi, setShowEmi] = useState(false);
  const [noObligations, setNoObligations] = useState(false);
  const [rows, setRows] = useState<ObligationRow[]>([
    {
      id: 1,
      lender: "HDFC Bank",
      type: "Home",
      original: "2500000",
      outstanding: "1850000",
      emi: "22000",
      tenure: "168",
      dpd: "0",
    },
  ]);
  const [uploaded, setUploaded] = useState<string[]>(["PAN Card", "Aadhaar Card"]);

  const emi = useMemo(
    () => emiFor(Number(loanAmount) || 0, 8.99, Number(tenure) || 60),
    [loanAmount, tenure],
  );
  const downPayment = Math.max(0, (Number(onRoad) || 0) - (Number(loanAmount) || 0));
  const existingEmis = noObligations
    ? 0
    : rows.reduce((sum, r) => sum + (Number(r.emi) || 0), 0);
  const totalObligations = existingEmis + emi;
  const foir = Number(netSalary) > 0 ? (totalObligations / Number(netSalary)) * 100 : 0;

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        id: Date.now(),
        lender: "",
        type: "Personal",
        original: "",
        outstanding: "",
        emi: "",
        tenure: "",
        dpd: "0",
      },
    ]);

  const update = (id: number, key: keyof ObligationRow, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  return (
    <AppShell title="New Application" subtitle="Car loan — salaried applicant">
      <ol className="panel flex flex-wrap gap-3 p-4 sm:gap-1">
        {steps.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(i)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-success bg-success text-success-foreground",
                    active && "border-primary bg-primary text-primary-foreground",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "truncate text-sm",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className="hidden h-px flex-1 bg-border lg:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <SectionCard title={`Step ${step + 1} — ${steps[step]}`} className="mt-4">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First name">
              <Input defaultValue="Rajesh" />
            </Field>
            <Field label="Mobile number">
              <Input defaultValue="+91 98400 12345" />
            </Field>
            <Field label="Middle name">
              <Input defaultValue="Kumar" />
            </Field>
            <Field label="Email">
              <Input type="email" defaultValue="rajesh.sharma@tcs.com" />
            </Field>
            <Field label="Last name">
              <Input defaultValue="Sharma" />
            </Field>
            <Field label="Current address">
              <Textarea rows={2} defaultValue="12/4 Anna Nagar East, 3rd Street" />
            </Field>
            <Field label="Date of birth">
              <Input type="date" defaultValue="1994-03-14" />
            </Field>
            <Field label="City">
              <Input defaultValue="Chennai" />
            </Field>
            <Field label="Gender">
              <Select defaultValue="Male">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Male", "Female", "Other"].map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="State">
              <Select defaultValue="Tamil Nadu">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="PAN number" hint="Format: ABCDE1234F">
              <Input defaultValue="ABCDE1234F" />
            </Field>
            <Field label="PIN code">
              <Input defaultValue="600102" />
            </Field>
            <Field label="Aadhaar number" hint="12 digits">
              <Input defaultValue="4321 8765 9012" />
            </Field>
            <Field label="Residence type">
              <Select defaultValue="Owned">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Owned", "Rented", "Company Provided", "Family"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="hidden md:block" />
            <Field label="Years at current address">
              <Input defaultValue="4" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Employer name" hint="Category shown from employer master">
              <Select defaultValue="Tata Consultancy Services">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employers.map((e) => (
                    <SelectItem key={e.name} value={e.name}>
                      <span className="flex items-center gap-2">
                        <CategoryBadge category={e.category} />
                        {e.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Monthly gross salary (Rs)">
              <Input defaultValue="104200" />
            </Field>
            <Field label="Designation">
              <Input defaultValue="Senior Software Engineer" />
            </Field>
            <Field label="Monthly net salary (Rs)">
              <Input value={netSalary} onChange={(e) => setNetSalary(e.target.value)} />
            </Field>
            <Field label="Department">
              <Input defaultValue="Digital Engineering" />
            </Field>
            <Field label="Total work experience (years)">
              <Input defaultValue="8" />
            </Field>
            <Field label="Employee ID">
              <Input defaultValue="TCS-884210" />
            </Field>
            <Field label="Current employer tenure">
              <div className="grid grid-cols-2 gap-2">
                <Input defaultValue="3" placeholder="Years" />
                <Input defaultValue="6" placeholder="Months" />
              </div>
            </Field>
            <Field label="Official email">
              <Input defaultValue="rajesh.sharma@tcs.com" />
            </Field>
            <Field label="Salary account bank">
              <Select defaultValue="HDFC Bank">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["HDFC Bank", "ICICI Bank", "Axis Bank", "SBI", "Kotak Mahindra", "Indian Bank"].map(
                    (b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <div className="hidden md:block" />
            <Field label="Salary account number">
              <Input defaultValue="50100288417721" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Make">
                <Select value={make} onValueChange={setMake}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(makes).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dealer name">
                <Select defaultValue="Lakshmi Hyundai">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Lakshmi Hyundai", "KUN Kia", "ABT Maruti", "Lanson Toyota", "TVS Mahindra"].map(
                      (d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Model">
                <Select defaultValue={makes[make]?.[0] ?? ""} key={make}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(makes[make] ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dealer city">
                <Input defaultValue="Chennai" />
              </Field>
              <Field label="Variant">
                <Select defaultValue="SX(O) 1.5 Turbo DCT">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["E", "S", "SX", "SX(O) 1.5 Turbo DCT"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ex-showroom price (Rs)" hint="Auto-filled from variant, editable">
                <Input defaultValue="1840000" />
              </Field>
              <Field label="Fuel type" hint="Auto-filled from variant">
                <Input defaultValue="Petrol" readOnly className="bg-muted" />
              </Field>
              <Field label="On-road price (Rs)">
                <Input value={onRoad} onChange={(e) => setOnRoad(e.target.value)} />
              </Field>
              <Field label="Transmission" hint="Auto-filled from variant">
                <Input defaultValue="DCT Automatic" readOnly className="bg-muted" />
              </Field>
              <Field label="Insurance amount (Rs)">
                <Input defaultValue="68000" />
              </Field>
              <div className="hidden md:block" />
              <Field label="Registration + road tax (Rs)">
                <Input defaultValue="207000" />
              </Field>
            </div>

            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Requested loan amount (Rs)">
                  <Input value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
                </Field>
                <Field label="Down payment (calculated)">
                  <Input value={inr(downPayment)} readOnly className="bg-muted" />
                </Field>
                <Field label="Tenure (months)">
                  <Select value={tenure} onValueChange={setTenure}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 24, 36, 48, 60, 72, 84].map((t) => (
                        <SelectItem key={t} value={String(t)}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setShowEmi(true)}>
                  Calculate EMI
                </Button>
                {showEmi && (
                  <p className="text-sm">
                    Estimated EMI at 8.99% p.a.:{" "}
                    <span className="font-semibold text-primary">{inr(emi)}</span> / month
                  </p>
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Total on-road cost: <span className="font-medium">{inr(Number(onRoad) || 0)}</span>
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={noObligations}
                  onCheckedChange={(v) => setNoObligations(Boolean(v))}
                />
                No existing obligations
              </label>
              <Button variant="outline" size="sm" onClick={addRow} disabled={noObligations}>
                <Plus className="size-4" /> Add obligation
              </Button>
            </div>

            <div className={cn("overflow-x-auto", noObligations && "pointer-events-none opacity-50")}>
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface-subtle text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Lender</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Original</th>
                    <th className="px-3 py-2 text-left font-medium">Outstanding</th>
                    <th className="px-3 py-2 text-left font-medium">Monthly EMI</th>
                    <th className="px-3 py-2 text-left font-medium">Remaining (m)</th>
                    <th className="px-3 py-2 text-left font-medium">DPD</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Input
                          value={row.lender}
                          onChange={(e) => update(row.id, "lender", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.type}
                          onValueChange={(v) => update(row.id, "type", v)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Home", "Car", "Personal", "Credit Card", "Gold", "Education", "Other"].map(
                              (t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.original}
                          onChange={(e) => update(row.id, "original", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.outstanding}
                          onChange={(e) => update(row.id, "outstanding", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.emi}
                          onChange={(e) => update(row.id, "emi", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.tenure}
                          onChange={(e) => update(row.id, "tenure", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select value={row.dpd} onValueChange={(v) => update(row.id, "dpd", v)}>
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["0", "30", "60", "90+"].map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove obligation"
                          onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 rounded-lg border border-border bg-surface-subtle p-4 sm:grid-cols-2 lg:grid-cols-4">
              <LabelValue label="Total existing EMIs" value={inr(existingEmis)} />
              <LabelValue label="Proposed new EMI" value={inr(emi)} />
              <LabelValue label="Total obligations" value={inr(totalObligations)} />
              <LabelValue
                label="Preliminary FOIR"
                value={
                  <span className={foir > 50 ? "text-destructive" : "text-success"}>
                    {foir.toFixed(1)}%
                  </span>
                }
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3 md:grid-cols-2">
            {docSlots.map((doc) => {
              const isUploaded = uploaded.includes(doc.name);
              return (
                <div
                  key={doc.name}
                  className={cn(
                    "rounded-lg border-2 border-dashed p-4 transition-colors",
                    isUploaded ? "border-success/40 bg-success/5" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {doc.name}{" "}
                        {doc.required ? (
                          <span className="text-destructive">*</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">(optional)</span>
                        )}
                      </p>
                      {doc.note && (
                        <p className="text-[11px] text-muted-foreground">{doc.note}</p>
                      )}
                    </div>
                    {isUploaded ? (
                      <Pill tone="success">Uploaded</Pill>
                    ) : (
                      <Pill tone="muted">Pending</Pill>
                    )}
                  </div>

                  {isUploaded ? (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-xs">
                        <FileUp className="size-4 shrink-0 text-success" />
                        <span className="truncate">
                          {doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf
                        </span>
                        <span className="text-muted-foreground">· 412 KB</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUploaded((p) => p.filter((n) => n !== doc.name))}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUploaded((p) => [...p, doc.name])}
                      className="mt-3 flex w-full flex-col items-center gap-1 rounded-md py-4 text-xs text-muted-foreground hover:bg-muted"
                    >
                      <UploadCloud className="size-5" />
                      Drag and drop, or click to browse
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button variant="outline">Save as draft</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setSubmitted(true)}>Submit application</Button>
            )}
          </div>
        </div>
      </SectionCard>

      <Dialog open={submitted} onOpenChange={setSubmitted}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application APP-2026-00848 submitted</DialogTitle>
            <DialogDescription>
              Documents will be processed for extraction. You will be notified when the assessment
              is ready.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitted(false)}>
              Stay here
            </Button>
            <Button onClick={() => navigate({ to: "/applications" })}>Go to applications</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
