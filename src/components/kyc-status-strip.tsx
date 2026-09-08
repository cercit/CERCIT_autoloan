import { cn } from "@/lib/utils";

type KycStatus = "verified" | "pending" | "failed" | "not_started";

export interface KycStatusStripProps {
  pan: KycStatus;
  aadhaar: KycStatus;
  mobile: KycStatus;
  email?: KycStatus;
  className?: string;
}

function statusConfig(status: KycStatus) {
  switch (status) {
    case "verified":
      return {
        symbol: "â",
        label: "Verified",
        ring: "border-green-500 text-green-600 bg-green-50",
        text: "text-green-600",
      };
    case "pending":
      return {
        symbol: "â·",
        label: "Pending",
        ring: "border-amber-400 text-amber-500 bg-amber-50",
        text: "text-amber-500",
      };
    case "failed":
      return {
        symbol: "â",
        label: "Failed",
        ring: "border-red-500 text-red-600 bg-red-50",
        text: "text-red-600",
      };
    case "not_started":
      return {
        symbol: "â",
        label: "Not started",
        ring: "border-gray-300 text-gray-400 bg-gray-50",
        text: "text-gray-400",
      };
  }
}

export function KycStatusStrip({
  pan,
  aadhaar,
  mobile,
  email,
  className,
}: KycStatusStripProps) {
  const items = [
    { key: "PAN", status: pan },
    { key: "Aadhaar", status: aadhaar },
    { key: "Mobile", status: mobile },
    ...(email !== undefined ? [{ key: "Email", status: email } as const] : []),
  ];

  return (
    <div className={cn("flex flex-wrap gap-8 justify-center sm:justify-start", className)}>
      {items.map((item) => {
        const cfg = statusConfig(item.status);
        return (
          <div key={item.key} className="flex flex-col items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center justify-center w-9 h-9 rounded-full border-2 text-base leading-none select-none",
                cfg.ring
              )}
              aria-label={cfg.label}
            >
              {cfg.symbol}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
              {item.key}
            </span>
            <span className={cn("text-xs font-semibold", cfg.text)}>
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}