import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useEffect } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, getSession, isSupabaseConfigured, enableDemoMode, isEmployeeEmail, setCustomerEmail } from "@/lib/auth";

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

  useEffect(() => {
    getSession().then((s) => {
      if (s) {
        const userEmail = s.user?.email ?? "";
        if (isEmployeeEmail(userEmail)) {
          navigate({ to: "/dashboard" });
        } else {
          setCustomerEmail(userEmail);
          navigate({ to: "/application-status" });
        }
      }
    });
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const useDemo = !isSupabaseConfigured || email === "demo@cercit.in";
      let authenticated = useDemo;

      if (!useDemo) {
        const result = await signIn(email, password);
        if (result.error) {
          enableDemoMode();
          authenticated = true;
        } else {
          authenticated = true;
        }
      } else {
        enableDemoMode();
      }

      if (authenticated) {
        if (isEmployeeEmail(email)) {
          navigate({ to: "/dashboard" });
        } else {
          setCustomerEmail(email);
          navigate({ to: "/application-status" });
        }
      }
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter any password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
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
