import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useEffect } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signIn,
  checkLogin,
  recordFailedLogin,
  lockedMessage,
  sendLoginCode,
  verifyLoginCode,
  getSession,
  staffStatus,
  isSupabaseConfigured,
  enableDemoMode,
  setCustomerEmail,
  DEMO_EMAIL,
} from "@/lib/auth";
import { BrandLogo } from "@/components/brand";
import { CustomerStart } from "@/components/onboarding/start-step";

type LoginAs = "customer" | "official";

const LIVE_DEMO_EMAIL = (import.meta.env["VITE_DEMO_EMAIL"] as string | undefined)?.trim();
const LIVE_DEMO_PASSWORD = (import.meta.env["VITE_DEMO_PASSWORD"] as string | undefined)?.trim();
const LIVE_DEMO = isSupabaseConfigured && !!LIVE_DEMO_EMAIL && !!LIVE_DEMO_PASSWORD;
// Practice logins (072, D3): do the real jobs on synthetic customers. One shared
// password, from the build (GitHub secret VITE_PRACTICE_PASSWORD), never this file.
const PRACTICE_PASSWORD = (import.meta.env["VITE_PRACTICE_PASSWORD"] as string | undefined)?.trim();
const PRACTICE = isSupabaseConfigured && !!PRACTICE_PASSWORD;
const PRACTICE_LOGINS = [
  { label: "Officer", email: "cercit+practice.officer@gmail.com", note: "takes and decides cases" },
  { label: "Manager", email: "cercit+practice.manager@gmail.com", note: "sees every case, can override" },
  { label: "Head", email: "cercit+practice.head@gmail.com", note: "also drafts and simulates policy" },
];
// Team logins (084): the real Head, Manager and Officer accounts. A button fills in
// the login; the password is never printed. Passwords come from the build (GitHub
// secrets), never this file. The Admin can undo their changes outside cases (085).
const env = (k: string) => (import.meta.env[k] as string | undefined)?.trim();
const TEAM_LOGINS = [
  { label: "Head", email: "cercit+head@gmail.com", password: env("VITE_TEAM_HEAD_PASSWORD"), note: "rules, rates, team" },
  { label: "Manager", email: "cercit+manager@gmail.com", password: env("VITE_TEAM_MANAGER_PASSWORD"), note: "every case, overrides" },
  { label: "Officer", email: "cercit+officer@gmail.com", password: env("VITE_TEAM_OFFICER_PASSWORD"), note: "checks and decides" },
].filter((t) => isSupabaseConfigured && !!t.password);
const DEMO_LOGIN = LIVE_DEMO
  ? { email: LIVE_DEMO_EMAIL!, password: LIVE_DEMO_PASSWORD! }
  : { email: DEMO_EMAIL, password: "demo" };

// Which door the person came through. It only changes the wording: where they
// land after signing in is decided by the database (staff or not), never by this.
const COPY: Record<LoginAs | "any", { title: string; lead: string; placeholder: string }> = {
  customer: {
    title: "Customer sign in",
    lead: "Track your car loan application and upload documents.",
    placeholder: "you@example.com",
  },
  official: {
    title: "Official sign in",
    lead: "For credit officers, managers and admins.",
    placeholder: "name@company.com",
  },
  any: {
    title: "Welcome back",
    lead: "Sign in with your email or employee code.",
    placeholder: "name@company.com",
  },
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { as?: LoginAs } =>
    search["as"] === "customer" || search["as"] === "official" ? { as: search["as"] } : {},
  head: () => ({
    meta: [
      { title: "Sign in -- cercit" },
      {
        name: "description",
        content:
          "Sign in to cercit. Employees reach the credit console, customers reach the application portal.",
      },
      { property: "og:title", content: "Sign in -- cercit" },
      {
        property: "og:description",
        content: "Sign in to cercit. Employees and customers.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { as } = Route.useSearch();
  // Customers start (or continue) their application here (onboarding step 1).
  return as === "customer" ? <CustomerStart /> : <StaffLogin />;
}

function StaffLogin() {
  const navigate = useNavigate();
  const { as } = Route.useSearch();
  const copy = COPY[as ?? "any"];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accounts that hold every right sign in with a code sent to their inbox
  // instead of a password.
  const [byCode, setByCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    getSession().then(async (s) => {
      if (!s) return;
      await routeByRole(s.user?.email ?? "");
    });
  }, []);

  /** Staff go to the dashboard, customers to their application. */
  async function routeByRole(userEmail: string) {
    const status = isSupabaseConfigured ? await staffStatus() : "not_staff";
    if (status === "staff") {
      try {
        sessionStorage.removeItem("cercit_customer_email");
      } catch {}
      navigate({ to: "/dashboard" });
      return;
    }
    if (status === "unknown") {
      setError("Signed in, but we could not check your access. Refresh the page to try again.");
      return;
    }
    setCustomerEmail(userEmail);
    navigate({ to: "/application-status" });
  }

  /** A locked account is signed straight out again, with the reason shown. */
  async function passesLoginCheck(): Promise<boolean> {
    const check = await checkLogin();
    if (!check.allowed) setError(lockedMessage(check.lockedUntil));
    return check.allowed;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const normalized = email.trim().toLowerCase();
      // Demo access is explicit: the demo account, or a deployment with no backend.
      if (!isSupabaseConfigured || normalized === DEMO_EMAIL) {
        enableDemoMode();
        await routeByRole(normalized);
        return;
      }

      if (byCode) {
        if (!codeSent) {
          const sent = await sendLoginCode(normalized);
          if (sent.error) {
            setError(sent.error);
            return;
          }
          setCodeSent(true);
          return;
        }
        const checked = await verifyLoginCode(normalized, code);
        if (checked.error) {
          setError(checked.error);
          return;
        }
        if (!(await passesLoginCheck())) return;
        await routeByRole(normalized);
        return;
      }

      const result = await signIn(email, password);
      if (result.error) {
        // Only a wrong password counts towards the lockout, not a network fault.
        if (/invalid login credentials/i.test(result.error)) {
          await recordFailedLogin(normalized);
          setError(
            'Wrong email or password. After 5 wrong tries in a row the account locks for 30 minutes. Added by an admin and never set a password? Use "Email me a code instead".',
          );
        } else {
          setError(result.error);
        }
        return;
      }
      if (!(await passesLoginCheck())) return;
      await routeByRole(normalized);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const showTeam = as !== "customer" && TEAM_LOGINS.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-background to-slate-100 dark:from-background dark:via-background dark:to-surface-subtle px-4 py-10">
      <div className="flex items-center justify-between px-2">
        <BrandLogo height={30} />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className={showTeam ? "w-full max-w-sm md:max-w-3xl" : "w-full max-w-sm"}>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.lead}</p>
          </div>

          {/* With the team logins, the sign-in form and the role picker sit side by side (stacked on a phone). */}
          <div className={showTeam ? "grid gap-4 md:grid-cols-2 md:items-stretch" : undefined}>
          <form onSubmit={onSubmit} className="panel space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder={copy.placeholder}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {byCode ? (
              codeSent ? (
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code from your email</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="8-digit code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sent to {email}. It is valid for a few minutes.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  We will email you an 8-digit code. No password needed.
                </p>
              )
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={isSupabaseConfigured ? "Enter your password" : "Enter any password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? byCode && !codeSent
                  ? "Sending the code..."
                  : "Signing in..."
                : byCode
                  ? codeSent
                    ? "Sign in"
                    : "Email me a code"
                  : "Sign in"}
            </Button>
            {isSupabaseConfigured && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  setByCode((on) => !on);
                  setCodeSent(false);
                  setCode("");
                  setError(null);
                }}
              >
                {byCode ? "Use a password instead" : "Email me a code instead"}
              </Button>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </form>

          {showTeam && (
            // Team logins (084): one click fills in the login; the password is never shown.
            <div className="flex flex-col rounded-lg border border-dashed border-primary/40 bg-primary/5 p-6 text-sm">
              <p className="font-medium">Try cercit as the credit team</p>
              <p className="mt-1 text-xs text-muted-foreground">
                1. Pick a role: the login fills in for you. 2. Press Sign in. Every customer here is made up, so look
                around, decide cases and try the rules.
              </p>
              <div className="mt-4 grid flex-1 content-center gap-2">
                {TEAM_LOGINS.map((t) => (
                  <Button
                    key={t.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto flex-col gap-0 whitespace-normal py-1.5 text-center"
                    onClick={() => {
                      setByCode(false);
                      setCodeSent(false);
                      setError(null);
                      setEmail(t.email);
                      setPassword(t.password ?? "");
                    }}
                  >
                    <span>Login as {t.label}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{t.note}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
          </div>

          {as !== "customer" && TEAM_LOGINS.length === 0 && (
            // Fallback when the team passwords aren't in the build (local runs): the
            // read-only demo (042), or the sample-data demo that stays in the browser.
            <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium">{LIVE_DEMO ? "Try the live demo" : "Try the demo"}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {LIVE_DEMO
                  ? "Read-only: look around cases, rules and rates. All data is synthetic."
                  : "Sample data only. Nothing you do is saved."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full"
                onClick={() => {
                  setByCode(false);
                  setCodeSent(false);
                  setError(null);
                  setEmail(DEMO_LOGIN.email);
                  setPassword(DEMO_LOGIN.password);
                }}
              >
                Fill in the demo login
              </Button>
            </div>
          )}

          {as !== "customer" && PRACTICE && (
            <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
              <p className="font-medium">Practice the real jobs</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Work synthetic customers' cases as an officer, a manager or a credit head. No real customers are shown, and
                practice cases are reset regularly. Password: <span className="font-mono text-foreground">{PRACTICE_PASSWORD}</span>
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {PRACTICE_LOGINS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    title={`Practice ${p.label.toLowerCase()}: ${p.note}`}
                    onClick={() => {
                      setByCode(false);
                      setCodeSent(false);
                      setError(null);
                      setEmail(p.email);
                      setPassword(PRACTICE_PASSWORD ?? "");
                    }}
                  >
                    Try as {p.label}
                  </Button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Fills in the login; then press Sign in.</p>
            </div>
          )}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {as === "official" ? (
              <>
                Customer?{" "}
                <Link
                  to="/login"
                  search={{ as: "customer" }}
                  className="font-medium text-primary hover:underline"
                >
                  Customer sign in
                </Link>
              </>
            ) : (
              <>
                Need a car loan?{" "}
                <Link
                  to="/login"
                  search={{ as: "customer" }}
                  className="font-medium text-primary hover:underline"
                >
                  Apply now
                </Link>
                {as === "customer" && (
                  <>
                    {" · "}
                    <Link
                      to="/login"
                      search={{ as: "official" }}
                      className="font-medium text-primary hover:underline"
                    >
                      Official sign in
                    </Link>
                  </>
                )}
              </>
            )}
          </p>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            {isSupabaseConfigured
              ? "Secured by Supabase Auth"
              : "Demo mode -- any credentials accepted"}
          </p>
        </div>
      </div>
    </div>
  );
}
