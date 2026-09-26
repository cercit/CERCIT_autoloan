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
  getCurrentUser,
  isSupabaseConfigured,
  enableDemoMode,
  isEmployeeEmail,
  setCustomerEmail,
  DEMO_EMAIL,
} from "@/lib/auth";

export const Route = createFileRoute("/login")({
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
    const staff = isSupabaseConfigured ? await getCurrentUser().catch(() => null) : null;
    if (staff || isEmployeeEmail(userEmail)) {
      navigate({ to: "/dashboard" });
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
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your email or employee code.
            </p>
          </div>

          <form onSubmit={onSubmit} className="panel space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
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

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Need a car loan?{" "}
            <Link to="/apply" className="font-medium text-primary hover:underline">
              Apply now
            </Link>
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
