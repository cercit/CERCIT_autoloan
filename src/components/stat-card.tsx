import React from "react";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <div className={cn("panel rounded-xl p-4 space-y-1", className)}>
      <div className="flex justify-end">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <h3 className="text-2xl font-bold">{value}</h3>
      {trend && (
        <p
          className={cn(
            "text-xs font-medium",
            trend.value > 0 ? "text-green-600" : "text-red-600"
          )}
        >
          {trend.value > 0 ? "â²" : "â¼"} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
}