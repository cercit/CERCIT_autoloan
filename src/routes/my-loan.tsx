import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Download,
  FileSignature,
  Landmark,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { BrandLogo } from "@/components/brand";
import { DocumentRow } from "@/components/onboarding/document-upload";
import { Pill } from "@/components/status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signOut } from "@/lib/auth";
import {
  getUploadTypes,
  sendCustomerEmailCode,
  verifyCustomerEmailCode,
  type UploadType,
} from "@/lib/customer-api";
import { downloadPdf } from "@/lib/doc-pdf";
import { inr } from "@/lib/format";
import {
  acceptOffer,
  getMyLoan,
  needsCode,
  setMandate,
  signAgreement,
  type AfterApproval,
} from "@/lib/loan-api";
import { agreementSpec, availableDocs, kfsSpec } from "@/lib/loan-docs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/my-loan")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    typeof s["app"] === "string" ? { app: s["app"] } : {},
  head: () => ({ meta: [{ title: "Your car loan — cercit" }] }),
  component: MyLoan,
});

const EMAIL_CODE_LENGTH = 8;
const d = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

function MyLoan() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [a, setA] = useState<AfterApproval | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<Record<string, UploadType>>({});

  const load = useCallback(async () => {
    if (!app) return setError("Open this page from your application's tracking page.");
    try {
      setA(await getMyLoan(app));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [app]);
  useEffect(() => {
    void load();
    void getUploadTypes()
      .then(setTypes)
      .catch(() => setTypes({}));
  }, [load]);

  const o = a?.offer;
  const steps = [
    { label: "Offer accepted", done: o?.status === "ACCEPTED" },
    { label: "Agreement signed", done: a?.agreement?.status === "SIGNED" },
    { label: "Auto-debit set up", done: !!a?.mandate },
    {
      label: "Dealer papers",
      done:
        !!a &&
        a.documents.filter((x) => x.doc_type !== "RC").length > 0 &&
        a.documents.filter((x) => x.doc_type !== "RC").every((x) => x.status === "ACCEPTED"),
    },
    { label: "Loan paid", done: !!a?.loan },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <BrandLogo height={30} />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut().then(() => navigate({ to: "/login" }))}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Link
          to="/application-status"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Your application
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your car loan</h1>
          {a && (
            <p className="mt-1 text-sm text-muted-foreground">
              {a.application.application_id}
              {a.vehicle
                ? ` · ${[a.vehicle.make, a.vehicle.model, a.vehicle.variant].filter(Boolean).join(" ")}`
                : ""}
            </p>
          )}
        </div>

        {error && <p className="panel p-5 text-sm text-destructive">{error}</p>}
        {!a && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {a && !o && (
          <p className="panel p-5 text-sm">
            Your loan offer isn't ready yet. We'll email you when it is.
          </p>
        )}

        {a && o && (
          <>
            <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps to get your loan">
              {steps.map((s, i) => (
                <li
                  key={s.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                    s.done
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s.done ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span className="tabular-nums">{i + 1}.</span>
                  )}
                  {s.label}
                </li>
              ))}
            </ol>
            <OfferSection a={a} email={a.customer.email} onDone={load} />
            {o.status === "ACCEPTED" && a.agreement && (
              <AgreementSection a={a} email={a.customer.email} onDone={load} />
            )}
            {a.agreement?.status === "SIGNED" && (
              <MandateSection a={a} email={a.customer.email} onDone={load} />
            )}
            {a.documents.length > 0 && (
              <Section
                icon={<Landmark className="size-4" />}
                title={a.loan ? "Your registration certificate" : "Papers from the dealer"}
                done={false}
              >
                <p className="mb-3 text-sm text-muted-foreground">
                  {a.loan
                    ? "Register the car with the hypothecation to us, then upload the RC within 30 days."
                    : "Ask the dealer for these, then upload each one. We pay the dealer once we've checked them."}
                </p>
                <ul className="space-y-3">
                  {a.documents
                    .filter((x) => (a.loan ? x.doc_type === "RC" : x.doc_type !== "RC"))
                    .map((x) => (
                      <DocumentRow
                        key={x.doc_type}
                        app={a.application.application_id}
                        doc={x}
                        type={types[x.doc_type]}
                        locked={false}
                        onDone={load}
                      />
                    ))}
                </ul>
              </Section>
            )}
            {a.loan && (
              <Section icon={<ShieldCheck className="size-4" />} title="Your loan is paid" done>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <Fact label="Loan account" value={a.loan.loan_account_no} />
                  <Fact label="Paid to" value={`${a.loan.paid_to}, ${d(a.loan.disbursed_on)}`} />
                  <Fact label="EMI" value={`${inr(a.loan.emi)} from ${d(a.loan.first_emi_date)}`} />
                </div>
              </Section>
            )}
            <DocumentsList a={a} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  done,
  children,
}: {
  icon: ReactNode;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full",
            done ? "bg-success text-success-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          {done ? <Check className="size-4" /> : icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 tabular-nums", strong && "text-lg font-semibold")}>{value}</p>
    </div>
  );
}

/** Runs an action; if the last email code is too old, sends one and runs it again once it's entered. */
function useCodeGate(email: string) {
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (needsCode(e)) {
        try {
          await sendCustomerEmailCode(email);
          setPending(() => action);
          setCode("");
        } catch (err) {
          setError((err as Error).message);
        }
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const enter = async (v: string) => {
    setCode(v);
    if (v.length < EMAIL_CODE_LENGTH || !pending) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCustomerEmailCode(email, v);
      await pending();
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const box = pending ? (
    <div className="mt-3 space-y-2 rounded-md bg-surface-subtle p-3">
      <Label htmlFor="loan-code">
        We emailed a {EMAIL_CODE_LENGTH}-digit code to {email}. Enter it to confirm.
      </Label>
      <InputOTP
        id="loan-code"
        maxLength={EMAIL_CODE_LENGTH}
        value={code}
        onChange={(v) => void enter(v)}
        inputMode="numeric"
        autoComplete="one-time-code"
        disabled={busy}
      >
        <InputOTPGroup>
          {Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  ) : null;

  return { run, busy, error, box };
}

function OfferSection({
  a,
  email,
  onDone,
}: {
  a: AfterApproval;
  email: string;
  onDone: () => Promise<void>;
}) {
  const o = a.offer!;
  const [read, setRead] = useState(false);
  const gate = useCodeGate(email);
  const accepted = o.status === "ACCEPTED";
  const expired = o.expired || o.status === "EXPIRED";

  return (
    <Section
      icon={<FileSignature className="size-4" />}
      title={accepted ? "Offer accepted" : "Your loan offer"}
      done={accepted}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <Fact label="Loan" value={inr(o.sanctioned_amount)} strong />
        <Fact label="EMI" value={`${inr(o.emi)} × ${o.tenure_months}`} strong />
        <Fact label="Interest rate" value={`${o.rate_pct}% fixed`} />
        <Fact label="APR (all-in cost)" value={`${o.apr_pct}%`} />
        <Fact label="Upfront charges" value={inr(o.total_upfront, true)} />
        <Fact label="Paid to the dealer" value={inr(o.net_disbursal, true)} />
        <Fact label="Cooling-off" value={`${o.cooling_off_days} days after payment`} />
        <Fact
          label={accepted ? "Accepted" : "Open until"}
          value={accepted ? d(o.accepted_at) : d(o.valid_until)}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        The Key Facts Statement lists every charge and shows how the APR is worked out. Nothing that
        isn't in it can be charged to you.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void downloadPdf(kfsSpec(a), `kfs_${a.application.application_id}.pdf`)}
        >
          <Download className="size-4" /> Key Facts Statement (PDF)
        </Button>
      </div>
      {!accepted && expired && (
        <p className="mt-4 rounded-md bg-warning/10 p-3 text-sm">
          This offer expired on {d(o.valid_until)}. We'll send you a fresh one; nothing is lost.
        </p>
      )}
      {!accepted && !expired && (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              id="kfs-read"
              checked={read}
              onCheckedChange={(v) => setRead(v === true)}
              className="mt-0.5"
            />
            <span>I have read the Key Facts Statement and accept the loan on these terms.</span>
          </label>
          <Button
            disabled={!read || gate.busy}
            onClick={() =>
              void gate.run(
                async () => (
                  await acceptOffer(a.application.application_id, o.kfs_hash),
                  await onDone()
                ),
              )
            }
          >
            {gate.busy && <Loader2 className="size-4 animate-spin" />} Accept the offer
          </Button>
          {gate.box}
        </div>
      )}
      {gate.error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {gate.error}
        </p>
      )}
    </Section>
  );
}

function AgreementSection({
  a,
  email,
  onDone,
}: {
  a: AfterApproval;
  email: string;
  onDone: () => Promise<void>;
}) {
  const g = a.agreement!;
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const gate = useCodeGate(email);
  const signed = g.status === "SIGNED";
  const spec = () =>
    agreementSpec(g.snapshot, {
      ref: g.agreement_ref,
      hash: g.content_hash,
      template: g.template_version,
      signedAt: g.signed_at,
      signer: g.signer_name,
      codeAt: g.code_verified_at,
    });

  return (
    <Section
      icon={<FileSignature className="size-4" />}
      title={signed ? "Agreement signed" : "Sign the loan agreement"}
      done={signed}
    >
      {signed ? (
        <p className="text-sm">
          Signed by {g.signer_name} on{" "}
          {new Date(g.signed_at!).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            The main points, in plain words. The full agreement is in the PDF; please read it before
            signing.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>
              The car stays hypothecated to us until the loan is repaid; you can't sell it without
              our NOC.
            </li>
            <li>
              Keep it comprehensively insured with us as loss payee, and send the RC within 30 days
              of registration.
            </li>
            <li>
              A missed EMI costs a fixed penal charge; it is never compounded or added to your
              interest.
            </li>
            <li>
              After 6 EMIs you may prepay or close the loan early; within 3 days of payment you can
              exit without penalty.
            </li>
            <li>
              We report the loan to credit bureaus monthly; the PDF shows exactly when an overdue
              EMI changes your account's status.
            </li>
          </ul>
        </>
      )}
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void downloadPdf(spec(), `loan-agreement_${a.application.application_id}.pdf`)
          }
        >
          <Download className="size-4" />{" "}
          {signed ? "Signed agreement (PDF)" : "Read the full agreement (PDF)"}
        </Button>
      </div>
      {!signed && (
        <div className="mt-4 space-y-3">
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="signer">Type your full name to sign: {a.customer.full_name}</Label>
            <Input
              id="signer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              id="agree"
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
              className="mt-0.5"
            />
            <span>I have read the loan agreement and sign it electronically.</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Agreement fingerprint {g.content_hash.slice(0, 16)}… This demo signs with an email code;
            a live service would use Aadhaar eSign.
          </p>
          <Button
            disabled={!agree || name.trim().length < 2 || gate.busy}
            onClick={() =>
              void gate.run(
                async () => (
                  await signAgreement(a.application.application_id, g.content_hash, name),
                  await onDone()
                ),
              )
            }
          >
            {gate.busy && <Loader2 className="size-4 animate-spin" />} Sign the agreement
          </Button>
          {gate.box}
        </div>
      )}
      {gate.error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {gate.error}
        </p>
      )}
    </Section>
  );
}

function MandateSection({
  a,
  email,
  onDone,
}: {
  a: AfterApproval;
  email: string;
  onDone: () => Promise<void>;
}) {
  const m = a.mandate;
  const [f, setF] = useState({
    holder_name: a.customer.full_name,
    bank_name: "",
    ifsc: "",
    account_number: "",
    confirm: "",
    account_type: "SAVINGS" as "SAVINGS" | "CURRENT",
  });
  const gate = useCodeGate(email);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const mismatch = f.confirm.length > 0 && f.confirm !== f.account_number;

  return (
    <Section
      icon={<Landmark className="size-4" />}
      title={m ? "EMI auto-debit set up" : "Set up EMI auto-debit"}
      done={!!m}
    >
      {m ? (
        <p className="text-sm">
          {m.bank_name}, account {m.account}. Mandate {m.umrn} (
          {m.mode.includes("SIMULATED") ? "simulated in this demo" : "registered"}), up to{" "}
          {inr(m.max_amount)} a month.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void gate.run(async () => {
              await setMandate(a.application.application_id, {
                holder_name: f.holder_name,
                bank_name: f.bank_name,
                ifsc: f.ifsc,
                account_number: f.account_number,
                account_type: f.account_type,
              });
              await onDone();
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Usually your salary account. The EMI of {inr(a.offer!.emi)} is debited on the{" "}
            {a.offer!.emi_day}th of each month. In a live service you'd confirm this with your
            bank's netbanking or debit card (e-NACH); here it is simulated.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="holder" label="Account holder's name">
              <Input
                id="holder"
                value={f.holder_name}
                onChange={(e) => set("holder_name")(e.target.value)}
              />
            </Field>
            <Field id="bank" label="Bank">
              <Input
                id="bank"
                value={f.bank_name}
                onChange={(e) => set("bank_name")(e.target.value)}
                placeholder="e.g. HDFC Bank"
              />
            </Field>
            <Field id="ifsc" label="IFSC">
              <Input
                id="ifsc"
                value={f.ifsc}
                onChange={(e) => set("ifsc")(e.target.value.toUpperCase().slice(0, 11))}
                className="font-mono uppercase"
                placeholder="HDFC0001234"
              />
            </Field>
            <Field id="acct-type" label="Account type">
              <Select value={f.account_type} onValueChange={(v) => set("account_type")(v)}>
                <SelectTrigger id="acct-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAVINGS">Savings</SelectItem>
                  <SelectItem value="CURRENT">Current</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="acct" label="Account number">
              <Input
                id="acct"
                value={f.account_number}
                onChange={(e) =>
                  set("account_number")(e.target.value.replace(/\D/g, "").slice(0, 18))
                }
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field id="acct2" label="Account number again">
              <Input
                id="acct2"
                value={f.confirm}
                onChange={(e) => set("confirm")(e.target.value.replace(/\D/g, "").slice(0, 18))}
                inputMode="numeric"
                autoComplete="off"
                onPaste={(e) => e.preventDefault()}
              />
              {mismatch && <p className="text-xs text-destructive">The two numbers don't match.</p>}
            </Field>
          </div>
          <Button
            type="submit"
            disabled={gate.busy || mismatch || !f.account_number || f.confirm !== f.account_number}
          >
            {gate.busy && <Loader2 className="size-4 animate-spin" />} Set up auto-debit
          </Button>
          {gate.box}
        </form>
      )}
      {gate.error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {gate.error}
        </p>
      )}
    </Section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function DocumentsList({ a }: { a: AfterApproval }) {
  const [busy, setBusy] = useState<string | null>(null);
  const docs = availableDocs(a);
  if (docs.length === 0) return null;
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-base font-semibold">Your loan documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each one is made fresh from your loan record when you download it.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {docs.map((doc) => (
          <li key={doc.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>{doc.name}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setBusy(doc.key);
                void downloadPdf(doc.spec(), doc.file).finally(() => setBusy(null));
              }}
            >
              {busy === doc.key ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}{" "}
              PDF
            </Button>
          </li>
        ))}
      </ul>
      {a.loan && <Pill tone="success">All documents for loan {a.loan.loan_account_no}</Pill>}
    </section>
  );
}
