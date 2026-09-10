import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export function BrandLogo({
  to = "/",
  className,
}: {
  to?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn("inline-flex items-center gap-2 rounded-md px-1 py-0.5", className)}
      aria-label="cercit home"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-primary">
        c
      </span>
      <span className="text-lg font-bold tracking-tight text-white">cercit</span>
    </Link>
  );
}
