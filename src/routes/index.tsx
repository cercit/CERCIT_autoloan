import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useState, useEffect } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, getSession, isSupabaseConfigured } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — cercit Credit Intelligence" },
      {
        name: "description",
        content:
          "Sign in to cercit, the credit evaluation and risk compliance intelligence tool for vehicle finance teams.",
      },
      { property: "og:title", content: "Sign in — cercit Credit Intelligence" },
      {
        property: "og:description",
        content: "Credit evaluation and risk compliance intelligence for vehicle finance teams.",
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
      if (s) navigate({ to: "/dashboard" });
    });
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: navigate straight to dashboard
        navigate({ to: "/dashboard" });
      } else {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error);
        } else {
          navigate({ to: "/dashboard" });
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
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
              c
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">cercit</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Credit Appraisal System — Vehicle Finance Intelligence
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
            <div className="text-center">
              <Link to="/dashboard" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            {isSupabaseConfigured
              ? "Secured by Supabase Auth · cercit v1.0"
              : "Demo mode — any credentials accepted · cercit v1.0"}
          </p>
        </div>
      </div>
    </div>
  );
}
