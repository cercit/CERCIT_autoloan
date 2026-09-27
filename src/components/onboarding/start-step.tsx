import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useCharacter } from "@/components/character/companion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { getSession, staffStatus } from "@/lib/auth";
import {
  getConsentText,
  getCustomerState,
  sendCustomerEmailCode,
  simulatedMobileCode,
  startApplication,
  verifyCustomerEmailCode,
  type ConsentText,
} from "@/lib/customer-api";
import { isSupabaseConfigured } from "@/lib/supabase";

import { OnboardingShell, StepBlock } from "./shell";

const NAME = /^[A-Za-z][A-Za-z .'-]{0,59}$/;
const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const STEP_ROUTES = { 2: "/onboarding/car", 3: "/onboarding/documents", 4: "/onboarding/details" } as const;

export function CustomerStart() {
  return (
    <OnboardingShell
      step={1}
      title="Start your car loan application"
      lead="Takes about 10 minutes. You can stop any time and continue later with your email."
    >
      <StartForm />
    </OnboardingShell>
  );
}

// The email code length is a Supabase project setting (Authentication > Email > OTP length); this project sends 8.
const EMAIL_CODE_LENGTH = 8;
const MOBILE_CODE_LENGTH = 6;

function OtpBoxes({ value, onChange, label, id, length }: { value: string; onChange: (v: string) => void; label: string; id: string; length: number }) {
  const { privateField } = useCharacter();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <InputOTP id={id} maxLength={length} value={value} onChange={onChange} inputMode="numeric" autoComplete="one-time-code" {...privateField}>
        <InputOTPGroup>
          {Array.from({ length }, (_, i) => i).map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

function StartForm() {
  const navigate = useNavigate();
  const { emit } = useCharacter();

  const [first, setFirst] = useState("");
  const [middle, setMiddle] = useState("");
  const [last, setLast] = useState("");

  const [mobile, setMobile] = useState("");
  const [mobileCode, setMobileCode] = useState<string | null>(null);
  const [mobileEntry, setMobileEntry] = useState("");
  const [mobileOk, setMobileOk] = useState(false);

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailEntry, setEmailEntry] = useState("");
  const [emailOk, setEmailOk] = useState(false);

  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<{ id: string; step: number } | null>(null);
  // Returning customers verify their email only, then continue where they left off.
  const [returning, setReturning] = useState(false);

  const namesOk = NAME.test(first.trim()) && NAME.test(last.trim()) && (!middle.trim() || NAME.test(middle.trim()));

  useEffect(() => {
    emit("FORM_STARTED");
    void getConsentText().then(setConsent);
    // Already signed in as a customer with a draft: offer to continue.
    void (async () => {
      if (!isSupabaseConfigured || !(await getSession())) return;
      if ((await staffStatus()) === "staff") return;
      const state = await getCustomerState().catch(() => null);
      if (state?.draft) setResume({ id: state.draft.application_id, step: state.draft.step });
    })();
  }, [emit]);

  function fail(msg: string) {
    setError(msg);
    emit("FIELD_INVALID");
  }

  function sendMobile() {
    setError(null);
    const digits = mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!MOBILE.test(digits)) return fail("Enter a 10-digit Indian mobile number.");
    setMobile(digits);
    setMobileCode(simulatedMobileCode());
    setMobileEntry("");
    emit("OTP_STARTED");
  }

  function checkMobile(v: string) {
    setMobileEntry(v);
    if (v.length < MOBILE_CODE_LENGTH) return;
    if (v === mobileCode) {
      setMobileOk(true);
      emit("OTP_SUCCESS");
    } else {
      emit("OTP_FAILED");
      setError("That code doesn't match. Check it and try again.");
    }
  }

  async function sendEmail() {
    setError(null);
    if (!EMAIL.test(email.trim())) return fail("Enter a valid email address.");
    setBusy("email");
    try {
      await sendCustomerEmailCode(email);
      setEmailSent(true);
      emit("OTP_STARTED");
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function checkEmail(v: string) {
    setEmailEntry(v);
    if (v.length < EMAIL_CODE_LENGTH) return;
    setBusy("email-code");
    setError(null);
    try {
      await verifyCustomerEmailCode(email, v);
      if ((await staffStatus()) === "staff") {
        setError("This email belongs to a cercit staff account. Use a personal email to apply.");
        emit("FIELD_INVALID");
        return;
      }
      setEmailOk(true);
      emit("OTP_SUCCESS");
      if (returning) {
        const state = await getCustomerState();
        if (state.draft) {
          navigate({ to: STEP_ROUTES[Math.min(4, Math.max(2, state.draft.step)) as 2 | 3 | 4], search: { app: state.draft.application_id } });
          return;
        }
        setReturning(false);
        setError("We couldn't find an application in progress for this email. Start a new one below.");
      }
    } catch (e) {
      emit("OTP_FAILED");
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!namesOk) return fail("Enter your first and last name (or initial) using letters only.");
    if (!mobileOk) return fail("Verify your mobile number first.");
    if (!emailOk) return fail("Verify your email first.");
    if (!agreed || !consent) return fail("Please read and accept the consent to continue.");
    setBusy("start");
    try {
      const r = await startApplication({
        firstName: first,
        middleName: middle,
        lastName: last,
        mobile,
        mobileMethod: "SIMULATED",
        consentVersion: consent.version,
      });
      emit("SECTION_COMPLETED");
      navigate({ to: STEP_ROUTES[2], search: { app: r.application_id } });
    } catch (err) {
      emit("TECHNICAL_ERROR");
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="panel p-6 text-sm text-muted-foreground">Applying needs the live database, which this copy of the site is not connected to.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {resume && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border-primary/40 p-4">
          <p className="text-sm">
            You have an application in progress: <span className="font-medium tabular-nums">{resume.id}</span>
          </p>
          <Button
            type="button"
            onClick={() => navigate({ to: STEP_ROUTES[Math.min(4, Math.max(2, resume.step)) as 2 | 3 | 4], search: { app: resume.id } })}
          >
            Continue <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {returning ? (
          <button type="button" className="text-primary hover:underline" onClick={() => setReturning(false)}>
            Start a new application instead
          </button>
        ) : (
          <>
            Already started?{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => { setReturning(true); setError(null); }}>
              Continue with your email
            </button>
          </>
        )}
      </p>

      {!returning && (
      <StepBlock n="1" title="Your name, as on your PAN" done={namesOk}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="first">First name</Label>
            <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="middle">
              Middle name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="middle" value={middle} onChange={(e) => setMiddle(e.target.value)} autoComplete="additional-name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last">Last name or initial</Label>
            <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" required />
          </div>
        </div>
      </StepBlock>
      )}

      {!returning && (
      <StepBlock n="2" title="Mobile number" done={mobileOk} disabled={!namesOk}>
        {!mobileOk ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="mobile">Mobile number</Label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-subtle px-3 text-sm text-muted-foreground">+91</span>
                  <Input
                    id="mobile"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    className="rounded-l-none"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    maxLength={14}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={sendMobile}>
                {mobileCode ? "Send again" : "Send OTP"}
              </Button>
            </div>
            {mobileCode && (
              <>
                <p className="rounded-md border border-dashed border-warning/60 bg-warning/10 px-3 py-2 text-xs">
                  Demo: SMS isn't connected yet, so no text message is sent. Your code is{" "}
                  <span className="font-mono text-sm font-semibold tabular-nums">{mobileCode}</span>.
                </p>
                <OtpBoxes id="mobile-otp" label="Enter the 6-digit code" length={MOBILE_CODE_LENGTH} value={mobileEntry} onChange={checkMobile} />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            +91 {mobile.slice(0, 2)}XXXXXX{mobile.slice(-2)} verified.{" "}
            <button type="button" className="text-primary hover:underline" onClick={() => { setMobileOk(false); setMobileCode(null); }}>
              Change
            </button>
          </p>
        )}
      </StepBlock>
      )}

      <StepBlock n={returning ? "1" : "3"} title="Email" done={emailOk} disabled={!returning && !mobileOk}>
        {!emailOk ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={emailSent && busy !== null} />
              </div>
              <Button type="button" variant="outline" onClick={() => void sendEmail()} disabled={busy === "email"}>
                {busy === "email" && <Loader2 className="size-4 animate-spin" />}
                {emailSent ? "Send again" : "Send code"}
              </Button>
            </div>
            {emailSent && (
              <>
                <p className="text-xs text-muted-foreground">We sent a code to {email.trim()}. Check spam if it isn't there in a minute.</p>
                <OtpBoxes id="email-otp" label={`Enter the ${EMAIL_CODE_LENGTH}-digit code from the email`} length={EMAIL_CODE_LENGTH} value={emailEntry} onChange={(v) => void checkEmail(v)} />
                {busy === "email-code" && <p className="text-xs text-muted-foreground">Checking…</p>}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{email.trim().toLowerCase()} verified.</p>
        )}
      </StepBlock>

      {!returning && (
      <StepBlock n="4" title="Your consent" done={agreed} disabled={!emailOk}>
        <p className="rounded-md bg-surface-subtle p-3 text-sm leading-relaxed text-muted-foreground">{consent?.body ?? "Loading…"}</p>
        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => {
              setAgreed(v === true);
              if (v === true) emit("CONSENT_GIVEN");
            }}
            className="mt-0.5"
          />
          <span>I have read this and I agree.</span>
        </label>
      </StepBlock>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!returning && (
      <div className="flex justify-start">
        <Button type="submit" size="lg" disabled={busy === "start" || !(namesOk && mobileOk && emailOk && agreed)}>
          {busy === "start" && <Loader2 className="size-4 animate-spin" />}
          Continue to car details <ArrowRight className="size-4" />
        </Button>
      </div>
      )}
    </form>
  );
}
