import { cn } from "@/lib/utils";

export type Violation = {
  rule: string;
  message: string;
  severity: "hard" | "soft";
};

export function PolicyViolationAlert({
  violations,
  className,
}: {
  violations: Violation[];
  className?: string;
}) {
  if (!violations || violations.length === 0) {
    return null;
  }

  const sorted = [...violations].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "hard" ? -1 : 1;
  });

  const hasHard = sorted.some((v) => v.severity === "hard");

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-4",
        hasHard
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50",
        className
      )}
    >
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {violations.length} policy violation{violations.length === 1 ? "" : "s"} found
      </h3>
      <div className="space-y-3">
        {sorted.map((v, i) => (
          <div key={i} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                v.severity === "hard" ? "bg-red-500" : "bg-amber-500"
              )}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {v.rule}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    v.severity === "hard"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  )}
                >
                  {v.severity === "hard" ? "Blocks approval" : "Warning"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{v.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}