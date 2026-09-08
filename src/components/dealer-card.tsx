import React from "react";
import { cn } from "@/lib/utils";

export interface DealerCardProps {
  name: string;
  city: string;
  oem: string;
  tier: "A" | "B" | "C";
  contactPerson?: string;
  phone?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DealerCard({
  name,
  city,
  oem,
  tier,
  contactPerson,
  phone,
  active = true,
  onClick,
  className,
}: DealerCardProps) {
  const tierColor =
    tier === "A" ? "bg-green-500" : tier === "B" ? "bg-yellow-400" : "bg-red-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "panel relative w-full text-left rounded-xl border p-5 transition-opacity",
        !active && "opacity-50 grayscale",
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
      disabled={!active && !onClick}
    >
      {!active && (
        <span className="absolute top-3 left-3 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Inactive
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight text-foreground truncate">
            {name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{city}</p>
        </div>

        <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {oem}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm",
            tierColor
          )}
          aria-label={`Tier ${tier}`}
        >
          {tier}
        </span>

        <div className="min-w-0">
          {contactPerson && (
            <p className="text-xs text-muted-foreground truncate">
              {contactPerson}
            </p>
          )}
          {phone && (
            <p className="text-xs text-muted-foreground truncate">{phone}</p>
          )}
        </div>
      </div>
    </button>
  );
}