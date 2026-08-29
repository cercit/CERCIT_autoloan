import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AppStatus, Category } from "@/lib/mock-data";

type Tone = "success" | "warning" | "destructive" | "info" | "primary" | "muted";

const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/18 text-warning-foreground border-warning/40 dark:text-warning",
  destructive: "bg-destructive/12 text-destructive border-destructive/25",
  info: "bg-info/12 text-info border-info/25",
  primary: "bg-primary/12 text-primary border-primary/25",
  muted: "bg-muted text-muted-foreground border-border",
};

export function Pill({
  tone = "muted",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<AppStatus, Tone> = {
  New: "primary",
  "Documents Uploaded": "info",
  "Under Review": "warning",
  Referred: "warning",
  Sanctioned: "success",
  Rejected: "destructive",
};

export function StatusPill({ status }: { status: AppStatus }) {
  return <Pill tone={statusTone[status]}>{status}</Pill>;
}

const categoryTone: Record<Category, Tone> = {
  A: "success",
  B: "warning",
  C: "destructive",
};

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 items-center justify-center rounded border text-[11px] font-semibold",
        toneClass[categoryTone[category]],
      )}
    >
      {category}
    </span>
  );
}

export function ScoreText({ score }: { score: number }) {
  const tone = score >= 750 ? "text-success" : score >= 650 ? "text-warning" : "text-destructive";
  return <span className={cn("font-semibold tabular", tone)}>{score}</span>;
}

export function MeterBar({
  value,
  max = 100,
  threshold,
  tone,
}: {
  value: number;
  max?: number;
  threshold?: number;
  tone: Tone;
}) {
  const barTone =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "destructive"
          ? "bg-destructive"
          : "bg-primary";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", barTone)}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
      {threshold !== undefined && (
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/60"
          style={{ left: `${Math.min(100, (threshold / max) * 100)}%` }}
        />
      )}
    </div>
  );
}
