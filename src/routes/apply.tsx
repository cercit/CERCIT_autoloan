import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { makes } from "@/lib/customer-data";
import { emiFor, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply for a Car Loan -- cercit" },
      {
        name: "description",
        content:
          "Complete your cercit car loan application in four steps: personal details, employment and income, car and loan details, and document upload.",
      },
      { property: "og:title", content: "Apply for a Car Loan -- cercit" },
      {
        property: "og:description",
        content: "A four-step online car loan application. Most decisions in under an hour.",
      },
    ],
  }),
  component: Apply,
});

const stepLabels = ["Personal details", "Employment & income", "Car & loan", "Documents"];

const docSlots = [
  { name: "PAN Card", hint: "A clear photo or scan of the card", required: true },
  { name: "Aadhaar Card -- front & back", hint: "Both sides in one or two files", required: true },
  { name: "Last 3 salary slips", hint: "Upload all three together", required: true },
  {
    name: "Bank statement -- last 6 months",
    hint: "Download the PDF from your netbanking portal",
    required: true,
  },
  { name: "Form 16", hint: "Most recent financial year", required: true },
  { name: "Any other document", hint: "Optional -- anything that supports your case", required: false },
];

function Field({
  label,
  id,
  children,
  hint,
  required,
}: {
  label: string;
  id: string;
  children?: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="ml-0.5 text-destructive">*</span>}</Label>
      {children ?? <Input id={id} required={required} />}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function UploadZone({
  name,
  hint,
  required,
  uploaded,
  onUpload,
}: {
  name: string;
  hint: string;
  required: boolean;
  uploaded: boolean;
  onUpload: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed p-4 transition-colors",
        uploaded ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {name}
            {required && <span className="ml-1 text-destructive">*</span>}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {uploaded ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-4" /> Uploaded
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={onUpload}>
            <UploadCloud className="size-4" /> Choose file
          </Button>
        )}
      </div>
      {uploaded && <Progress value={100} className="mt-3 h-1.5" />}
    </div>
  );
}

function Apply() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [make, setMake] = useState("Hyundai");
  const [amount, setAmount] = useState(850000);
  const [tenure, setTenure] = useState(60);
  const [uploads, setUploads] = useState<Record<string, boolean>>({});
  const [otpSent, setOtpSent] = useState(false);

  const rate = 8.99;
  const emi = emiFor(amount, rate, tenure);
  const models = makes[make] ?? [];

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-background px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            c
          </span>
          <span className="text-lg font-bold tracking-tight">cercit</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="panel max-w-md p-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/12 text-success">
              <FileCheck2 className="size-7" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Application submitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We have everything we need for now.
            </p>
            <div className="mt-6 rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs text-muted-foreground">Your application ID</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">CER-2026-04821</p>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              You should hear from us within 2 hours. We'll send updates by SMS and email.
            </p>
            <Button className="mt-6 w-full" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              c
            </span>
            <span className="text-lg font-bold tracking-tight">cercit</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Login</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Apply for your car loan
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step {step} of 4 -- {stepLabels[step - 1]}
        </p>

        <Progress value={(step / 4) * 100} className="mt-5 h-2" />
        <ol className="mt-3 hidden justify-between text-xs sm:flex">
          {stepLabels.map((label, i) => (
            <li
              key={label}
              className={cn(
                "font-medium",
                i + 1 <= step ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </li>
          ))}
        </ol>

        <div className="panel mt-6 space-y-5 p-5 sm:p-6">
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" id="name" required />
              <Field label="Date of birth" id="dob" required>
                <Input id="dob" type="date" />
              </Field>
              <Field label="Gender" id="gender">
                <Select defaultValue="male">
                  <SelectTrigger id="gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="PAN" id="pan" hint="10-character permanent account number" required />
              <Field label="Aadhaar" id="aadhaar" hint="12-digit number" required />
              <div className="space-y-1.5">
                <Label htmlFor="mobile">Mobile</Label>
                <div className="flex gap-2">
                  <Input id="mobile" className="flex-1" defaultValue="+91 " />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOtpSent(true)}
                    disabled={otpSent}
                  >
                    {otpSent ? "OTP sent" : "Verify"}
                  </Button>
                </div>
                {otpSent && (
                  <p className="text-xs text-success">
                    A 6-digit OTP has been sent to your mobile number.
                  </p>
                )}
              </div>
              <Field label="Email" id="email" required>
                <Input id="email" type="email" required />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Current address" id="address" />
              </div>
              <Field label="City" id="city" />
              <Field label="State" id="state" />
              <Field label="PIN code" id="pin" />
              <Field label="Residence type" id="residence">
                <Select defaultValue="own">
                  <SelectTrigger id="residence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">Own</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" id="company" required />
              <Field label="Designation" id="designation" required />
              <Field label="Monthly take-home salary" id="salary" required>
                <Input id="salary" type="number" placeholder="85000" required />
              </Field>
              <Field label="Years in current company" id="years-current" />
              <Field label="Total work experience (years)" id="total-exp" />
              <Field label="Salary account bank" id="bank" />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Which car are you looking at?" id="make">
                  <Select value={make} onValueChange={setMake}>
                    <SelectTrigger id="make">
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
                <Field label="Model" id="model">
                  <Select value={models[0] ?? ""} key={make}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Dealer name or city" id="dealer" />
                <Field
                  label="Approximate on-road price"
                  id="onroad"
                  hint="Check with your dealer for the exact figure"
                >
                  <Input id="onroad" type="number" defaultValue={1985000} />
                </Field>
                <Field label="How much loan do you need?" id="loan">
                  <Input
                    id="loan"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Preferred tenure" id="tenure">
                  <Select value={String(tenure)} onValueChange={(v) => setTenure(Number(v))}>
                    <SelectTrigger id="tenure">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[36, 48, 60, 72, 84].map((t) => (
                        <SelectItem key={t} value={String(t)}>
                          {t / 12} years
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-subtle p-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Estimated monthly payment at {rate}% p.a.
                  </p>
                  <p className="mt-0.5 text-2xl font-semibold text-primary">{inr(emi)}</p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {docSlots.map((doc) => (
                <UploadZone
                  key={doc.name}
                  name={doc.name}
                  hint={doc.hint}
                  required={doc.required}
                  uploaded={Boolean(uploads[doc.name])}
                  onUpload={() => setUploads((u) => ({ ...u, [doc.name]: true }))}
                />
              ))}

              <div className="mt-6 rounded-lg border border-border p-4">
                <h2 className="text-sm font-semibold">Review and submit</h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Car", `${make} ${models[0] ?? ""}`],
                    ["Loan amount", inr(amount)],
                    ["Tenure", `${tenure} months`],
                    ["Estimated EMI", inr(emi)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 space-y-3">
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox defaultChecked className="mt-0.5" />
                    <span>
                      I authorize cercit to pull my credit report from CIBIL / Experian.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox defaultChecked className="mt-0.5" />
                    <span>I agree to the Terms and Conditions and Privacy Policy.</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="size-4" /> Home
              </Link>
            </Button>
          )}

          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => setSubmitted(true)}>Submit Application</Button>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Your documents are encrypted in transit and at rest.
        </p>
      </main>
    </div>
  );
}
