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
import { isAwsConfigured, requestContinueLink } from "@/lib/aws-doc-api";
import {
  getConsentText,
  getCustomerState,
  getTracking,
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

export const STEP_ROUTES = {
  2: "/onboarding/car",
  3: "/onboarding/documents",
  4: "/onboarding/details",
} as const;

export function CustomerStart() {
  const [progress, setProgress] = useState(0);
  return (
    <OnboardingShell
      step={1}
      progress={progress}
      title="Your car loan"
      lead="New here or coming back, start with your mobile number or email. Applying takes about 10 minutes and you can stop any time."
    >
      <StartForm onProgress={setProgress} />
    </OnboardingShell>
  );
}

// The email code length is a Supabase project setting (Authentication > Email > OTP length); this project sends 8.
const EMAIL_CODE_LENGTH = 8;
const MOBILE_CODE_LENGTH = 6;

function OtpBoxes({
  value,
  onChange,
  label,
  id,
  length,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id: string;
  length: number;
}) {
  const { privateField } = useCharacter();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <InputOTP
        id={id}
        maxLength={length}
        value={value}
        onChange={onChange}
        inputMode="numeric"
        autoComplete="one-time-code"
        {...privateField}
      >
        <InputOTPGroup>
          {Array.from({ length }, (_, i) => i).map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

/*
 * The customer's way in (Sameer, 28 Sep 2026):
 *   identify  one box, mobile number or email
 *   by email  email code, then: application in progress -> back to its step;
 *             submitted before -> tracking page; nothing yet -> new application
 *             with the email already verified
 *   by mobile known number -> "welcome back", code to the email on file;
 *             new number -> new application with the mobile filled in
 *   new       name, mobile code, email code, consent, then the car step
 */
type Phase = "identify" | "known" | "new";

function StartForm({ onProgress }: { onProgress: (p: number) => void }) {
  const navigate = useNavigate();
  const { emit } = useCharacter();

  const [phase, setPhase] = useState<Phase>("identify");
  const [who, setWho] = useState("");

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
  // A known mobile: where the sign-in link went (masked), for the "welcome back" screen.
  const [linkSent, setLinkSent] = useState<{ to: string; sent: boolean } | null>(null);

  const namesOk =
    NAME.test(first.trim()) &&
    NAME.test(last.trim()) &&
    (!middle.trim() || NAME.test(middle.trim()));

  useEffect(() => {
    const parts = [phase !== "identify", namesOk, mobileOk, emailOk, agreed];
    onProgress(parts.filter(Boolean).length / parts.length);
  }, [phase, namesOk, mobileOk, emailOk, agreed, onProgress]);

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

  const goToStep = (id: string, step: number) =>
    navigate({ to: STEP_ROUTES[Math.min(4, Math.max(2, step)) as 2 | 3 | 4], search: { app: id } });

  /** Signed in by email: pick up where they are, or start new with the email verified. */
  async function routeSignedIn() {
    const state = await getCustomerState();
    if (state.draft) return goToStep(state.draft.application_id, state.draft.step);
    const tracking = await getTracking().catch(() => null);
    if (tracking && tracking.applications.length > 0)
      return navigate({ to: "/application-status" });
    setPhase("new");
  }

  // ---- step 0: who is this? ----------------------------------------------

  async function identify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const v = who.trim();
    if (v.includes("@")) {
      if (!EMAIL.test(v)) return fail("That email doesn't look right. Check it and try again.");
      setEmail(v);
      return sendEmail(v);
    }
    const digits = v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!MOBILE.test(digits)) return fail("Enter your 10-digit mobile number, or your email.");
    setMobile(digits);
    setBusy("identify");
    try {
      const r = isAwsConfigured()
        ? await requestContinueLink(digits).catch(() => ({ found: false as const }))
        : { found: false as const };
      if (r.found) {
        setLinkSent({ to: r.emailMasked, sent: r.sent });
        setPhase("known");
      } else {
        setPhase("new");
      }
    } finally {
      setBusy(null);
    }
  }

  // ---- mobile code (simulated until an SMS provider is connected) ------------

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
      void checkExistingByMobile();
    } else {
      emit("OTP_FAILED");
      setError("That code doesn't match. Check it and try again.");
    }
  }

  // A number typed in the new-application form that already belongs to someone.
  async function checkExistingByMobile() {
    if (!isAwsConfigured() || phase !== "new") return;
    const r = await requestContinueLink(mobile).catch(() => ({ found: false as const }));
    if (!r.found) return;
    setLinkSent({ to: r.emailMasked, sent: r.sent });
    setPhase("known");
    setError(null);
  }

  // ---- email code ------------------------------------------------------------

  async function sendEmail(address = email) {
    setError(null);
    if (!EMAIL.test(address.trim())) return fail("Enter a valid email address.");
    setBusy("email");
    try {
      await sendCustomerEmailCode(address);
      setEmailSent(true);
      setEmailEntry("");
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
      // Coming in from the first box or the welcome-back screen: route them.
      if (phase !== "new") await routeSignedIn();
    } catch (e) {
      emit("OTP_FAILED");
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ---- new application -----------------------------------------------------

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
    return (
      <p className="panel p-6 text-sm text-muted-foreground">
        Applying needs the live database, which this copy of the site is not connected to.
      </p>
    );
  }

  const errorBox = error && (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {error}
    </p>
  );

  const emailCodeBox = emailSent && !emailOk && (
    <>
      <p className="text-xs text-muted-foreground">
        We sent a code to {email.trim()}. Check spam if it isn't there in a minute.
      </p>
      <OtpBoxes
        id="email-otp"
        label={`Enter the ${EMAIL_CODE_LENGTH}-digit code from the email`}
        length={EMAIL_CODE_LENGTH}
        value={emailEntry}
        onChange={(v) => void checkEmail(v)}
      />
      {busy === "email-code" && <p className="text-xs text-muted-foreground">Checking…</p>}
    </>
  );

  const resumePanel = resume && (
    <div className="panel flex flex-wrap items-center justify-between gap-3 border-primary/40 p-4">
      <p className="text-sm">
        You have an application in progress:{" "}
        <span className="font-medium tabular-nums">{resume.id}</span>
      </p>
      <Button type="button" onClick={() => goToStep(resume.id, resume.step)}>
        Continue where you left off <ArrowRight className="size-4" />
      </Button>
    </div>
  );

  // ---- screens -----------------------------------------------------------------

  if (phase === "identify") {
    return (
      <div className="space-y-4">
        {resumePanel}
        <form onSubmit={identify} className="panel space-y-4 p-5 sm:p-6" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="who">Your mobile number or email</Label>
            <Input
              id="who"
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
                setEmailSent(false);
              }}
              autoComplete="username"
              inputMode={/^[\d\s+]*$/.test(who) && who ? "tel" : "email"}
              placeholder="98765 43210 or name@example.com"
              disabled={emailSent}
            />
            <p className="text-xs text-muted-foreground">
              If you've applied before, we'll take you back to your application. If not, we'll start
              a new one.
            </p>
          </div>
          {!emailSent && (
            <Button type="submit" size="lg" disabled={busy !== null || !who.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />} Continue{" "}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {emailCodeBox}
          {emailSent && !emailOk && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => (setEmailSent(false), setError(null))}
            >
              Use a different mobile number or email
            </button>
          )}
          {errorBox}
        </form>
      </div>
    );
  }

  if (phase === "known") {
    return (
      <div className="space-y-4">
        <div className="panel space-y-3 border-primary/40 p-5 sm:p-6" role="status">
          <p className="text-base font-semibold">Welcome back.</p>
          <p className="text-sm text-muted-foreground">
            {linkSent?.sent ? (
              <>
                This number already has an application with us. We've emailed a sign-in link to{" "}
                <span className="font-medium text-foreground">{linkSent.to}</span>. Open it on this
                device, or type that email below for a code.
              </>
            ) : (
              <>
                This number already has an application with us. Type the email you used (
                <span className="font-medium text-foreground">{linkSent?.to}</span>) for a code.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailSent && busy !== null}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void sendEmail()}
              disabled={busy === "email"}
            >
              {busy === "email" && <Loader2 className="size-4 animate-spin" />}
              {emailSent ? "Send again" : "Send code"}
            </Button>
          </div>
          {emailCodeBox}
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => (setPhase("identify"), setEmailSent(false), setError(null))}
          >
            That's not me: use a different number or email
          </button>
        </div>
        {errorBox}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {resumePanel}
      <p className="text-sm text-muted-foreground">
        New application.{" "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => (setPhase("identify"), setError(null))}
        >
          Change the mobile number or email
        </button>
      </p>

      <StepBlock n="1" title="Your name, as on your PAN" done={namesOk}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="first">First name</Label>
            <Input
              id="first"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              autoComplete="given-name"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="middle">
              Middle name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="middle"
              value={middle}
              onChange={(e) => setMiddle(e.target.value)}
              autoComplete="additional-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last">Last name or initial</Label>
            <Input
              id="last"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              autoComplete="family-name"
              required
            />
          </div>
        </div>
      </StepBlock>

      <StepBlock n="2" title="Mobile number" done={mobileOk} disabled={!namesOk}>
        {!mobileOk ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="mobile">Mobile number</Label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-subtle px-3 text-sm text-muted-foreground">
                    +91
                  </span>
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
                  <span className="font-mono text-sm font-semibold tabular-nums">{mobileCode}</span>
                  .
                </p>
                <OtpBoxes
                  id="mobile-otp"
                  label="Enter the 6-digit code"
                  length={MOBILE_CODE_LENGTH}
                  value={mobileEntry}
                  onChange={checkMobile}
                />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            +91 {mobile.slice(0, 2)}XXXXXX{mobile.slice(-2)} verified.{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => (setMobileOk(false), setMobileCode(null))}
            >
              Change
            </button>
          </p>
        )}
      </StepBlock>

      <StepBlock n="3" title="Email" done={emailOk} disabled={!mobileOk && !emailOk}>
        {!emailOk ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1 space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={emailSent && busy !== null}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void sendEmail()}
                disabled={busy === "email"}
              >
                {busy === "email" && <Loader2 className="size-4 animate-spin" />}
                {emailSent ? "Send again" : "Send code"}
              </Button>
            </div>
            {emailCodeBox}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{email.trim().toLowerCase()} verified.</p>
        )}
      </StepBlock>

      <StepBlock n="4" title="Your consent" done={agreed} disabled={!emailOk || !mobileOk}>
        <p className="rounded-md bg-surface-subtle p-3 text-sm leading-relaxed text-muted-foreground">
          {consent?.body ?? "Loading…"}
        </p>
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

      {errorBox}

      <div className="flex justify-start">
        <Button
          type="submit"
          size="lg"
          disabled={busy === "start" || !(namesOk && mobileOk && emailOk && agreed)}
        >
          {busy === "start" && <Loader2 className="size-4 animate-spin" />}
          Continue to car details <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}
