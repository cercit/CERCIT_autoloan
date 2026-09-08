import { cn } from "@/lib/utils";

export function SkeletonLine({ width = "100%", height = 16, className }: { width?: string; height?: number; className?: string }) {
  return (
    <div className={cn("rounded shimmer", className)} style={{ width, height }} aria-hidden="true" />
  );
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-muted/20 p-4 shimmer-parent", className)} aria-hidden="true">
      <div className="h-6 w-3/4 rounded shimmer mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("h-3 rounded shimmer mb-2", i === lines - 1 ? "w-5/6" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 6, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("w-full shimmer-parent", className)} aria-hidden="true">
      <div className="grid grid-cols-6 gap-2 mb-2">
        {Array.from({ length: columns }).map((_, i) => <SkeletonLine key={i} height={14} width={`${60 + (i * 15) % 30}%`} />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-6 gap-2 mb-1">
          {Array.from({ length: columns }).map((_, j) => <SkeletonLine key={j} height={16} width={`${50 + ((i + j) * 8) % 40}%`} />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKPIRow({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4 shimmer-parent", className)} aria-hidden="true">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-muted/20 p-4 shimmer">
          <div className="h-3 w-16 rounded shimmer mb-2" />
          <div className="h-6 w-24 rounded shimmer" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonApplicationStrip({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 shimmer-parent", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-muted/20 p-3 shimmer">
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded shimmer mb-2" />
            <div className="h-6 w-16 rounded shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Keyframes shimmer added via global CSS or can be injected */
