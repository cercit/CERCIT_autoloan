import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-10">
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
              Credit Evaluation and Risk Compliance Intelligence Tool
            </p>
          </div>

          <form onSubmit={onSubmit} className="panel space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                defaultValue="rajeev.menon@cercit.in"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                defaultValue="demo-password"
              />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
            <div className="text-center">
              <Link to="/dashboard" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Powered by cercit v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
