import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand";
import { CharacterProvider } from "@/components/character/companion";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// The four customer steps (Sameer, 27 Sep 2026).
export const ONBOARDING_STEPS = ["You", "Car", "Documents", "Address & details"] as const;

// How much of the whole application each step is, by the customer's effort:
// the documents take longest. About 12 minutes end to end.
const STEP_WEIGHT = [0.15, 0.15, 0.45, 0.25] as const;
const TOTAL_MINUTES = 12;

function cheer(pct: number) {
  if (pct >= 100) return "All done";
  if (pct >= 75) return "Almost there";
  if (pct >= 50) return "More than halfway";
  if (pct >= 25) return "Good progress";
  return "Just getting started";
}

export function OnboardingShell({
  step,
  title,
  lead,
  children,
  applicationId,
  progress = 0,
}: {
  step: 1 | 2 | 3 | 4;
  /** How far through this step the customer is, 0 to 1. */
  progress?: number;
  title: string;
  lead?: string;
  children: ReactNode;
  applicationId?: string | undefined;
}) {
  const within = Math.max(0, Math.min(1, progress));
  const overall =
    STEP_WEIGHT.slice(0, step - 1).reduce((a, w) => a + w, 0) + (STEP_WEIGHT[step - 1] ?? 0) * within;
  const pct = Math.round(overall * 100);
  const minutes = Math.max(1, Math.ceil(TOTAL_MINUTES * (1 - overall)));

  return (
    <CharacterProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <BrandLogo height={30} />
            <div className="flex items-center gap-3">
              {applicationId && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Application{" "}
                  <span className="font-medium text-foreground tabular-nums">{applicationId}</span>
                </span>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="companion-safe mx-auto max-w-3xl px-4 pt-6 sm:pt-8">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
            <p className="text-muted-foreground">
              Step {step} of {ONBOARDING_STEPS.length}
            </p>
            <p aria-live="polite">
              <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
              <span className="text-muted-foreground">
                {" "}
                · {cheer(pct)}
                {pct < 100 ? ` · about ${minutes} min to go` : ""}
              </span>
            </p>
          </div>
          <ol className="grid grid-cols-4 gap-2" aria-label="Application steps">
            {ONBOARDING_STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <li key={label} className="min-w-0" aria-current={current ? "step" : undefined}>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-border"
                    role={current ? "progressbar" : undefined}
                    aria-valuemin={current ? 0 : undefined}
                    aria-valuemax={current ? 100 : undefined}
                    aria-valuenow={current ? Math.round(within * 100) : undefined}
                    aria-label={current ? `${label}: ${Math.round(within * 100)}% done` : undefined}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{
                        width: done ? "100%" : current ? `${Math.max(4, within * 100)}%` : "0%",
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 flex items-center gap-1 truncate text-xs",
                      current
                        ? "font-semibold text-foreground"
                        : done
                          ? "text-primary"
                          : "text-muted-foreground",
                    )}
                  >
                    {done && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                    <span className="truncate">
                      <span className="sr-only">Step {n}: </span>
                      {label}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>

          <h1 className="mt-7 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {lead && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{lead}</p>}
          <div className="mt-6">{children}</div>
          <p className="mt-8 text-xs text-muted-foreground">
            cercit is a product demo, not a licensed lender. Do not enter real personal data.
          </p>
        </main>
      </div>
    </CharacterProvider>
  );
}

/** A numbered block inside a step, with a tick when it is done. */
export function StepBlock({
  n,
  title,
  done,
  children,
  disabled,
}: {
  n: string;
  title: string;
  done?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "panel p-5 transition-opacity sm:p-6",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-disabled={disabled}
    >
      <h2 className="flex items-center gap-2.5 text-sm font-semibold">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs",
            done ? "bg-success text-success-foreground" : "bg-accent text-accent-foreground",
          )}
        >
          {done ? <Check className="size-3.5" aria-hidden="true" /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
