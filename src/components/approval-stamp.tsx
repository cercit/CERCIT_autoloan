import { cn } from "@/lib/utils";

export interface ApprovalStampProps {
  decision: "Approve" | "Maybe" | "Reject";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ApprovalStamp({
  decision,
  size = "md",
  className,
}: ApprovalStampProps) {
  const config = {
    Approve: {
      label: "APPROVED",
      colorClass: "text-green-600 border-green-600",
    },
    Maybe: {
      label: "REVIEW",
      colorClass: "text-amber-500 border-amber-500",
    },
    Reject: {
      label: "REJECTED",
      colorClass: "text-red-600 border-red-600",
    },
  };

  const { label, colorClass } = config[decision];

  const sizeClasses = {
    sm: "w-16 text-xs h-16",
    md: "w-24 text-sm h-20",
    lg: "w-32 text-base h-24",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full border-4 border-solid bg-transparent/10 backdrop-blur-sm font-extrabold tracking-widest uppercase select-none",
        colorClass,
        sizeClasses[size],
        className
      )}
      style={{ transform: "rotate(-12deg)" }}
    >
      <div
        className={cn(
          "absolute inset-2 rounded-full border-2 border-dashed",
          colorClass
        )}
      />
      <span className="relative z-10">{label}</span>
    </div>
  );
}