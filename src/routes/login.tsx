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

type LoginAs = "customer" | "official";

const LIVE_DEMO_EMAIL = (import.meta.env["VITE_DEMO_EMAIL"] as string | undefined)?.trim();
const LIVE_DEMO_PASSWORD = (import.meta.env["VITE_DEMO_PASSWORD"] as string | undefined)?.trim();
const LIVE_DEMO = isSupabaseConfigured && !!LIVE_DEMO_EMAIL && !!LIVE_DEMO_PASSWORD;
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
      try { sessionStorage.removeItem("cercit_customer_email"); } catch {}
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
          setError("Wrong email or password. After 5 wrong tries in a row the account locks for 30 minutes.");
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

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-background to-slate-100 px-4 py-10">
      <div className="flex items-center justify-between px-2">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            c
          </span>
          <span className="text-lg font-bold tracking-tight">cercit</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.lead}</p>
          </div>

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
                    placeholder="6-digit code"
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
                  We will email you a six-digit code. No password needed.
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

          {as !== "customer" && (
            // Live demo: a read-only account on the real database (042). Its email and
            // password come from the build (GitHub secrets), never from this file.
            // Without them, the sample-data demo that stays in the browser.
            <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-medium">{LIVE_DEMO ? "Try the live demo" : "Try the demo"}</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                <dt>Email</dt>
                <dd className="break-all font-mono text-foreground">{DEMO_LOGIN.email}</dd>
                <dt>Password</dt>
                <dd className="break-all font-mono text-foreground">{DEMO_LOGIN.password}</dd>
              </dl>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {LIVE_DEMO
                  ? "Read-only: look around real cases, rules and rates. Nothing can be changed. All data is synthetic."
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

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {as === "official" ? (
              <>
                Customer?{" "}
                <Link to="/login" search={{ as: "customer" }} className="font-medium text-primary hover:underline">
                  Customer sign in
                </Link>
              </>
            ) : (
              <>
                Need a car loan?{" "}
                <Link to="/apply" className="font-medium text-primary hover:underline">
                  Apply now
                </Link>
                {as === "customer" && (
                  <>
                    {" · "}
                    <Link to="/login" search={{ as: "official" }} className="font-medium text-primary hover:underline">
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
