---
type: new
target: src/components/stat-card.tsx
model: inkling
---

## Instructions

Create a reusable statistics card component for dashboard metrics.

Requirements:
- Named export `StatCard`
- Props type (export it as `StatCardProps`):
  - `label: string` — metric name (e.g. "Total Applications")
  - `value: string | number` — the main display value
  - `icon: React.ElementType` — a lucide-react icon component
  - `trend?: { value: number; label: string }` — optional trend indicator
  - `className?: string`
- Layout: a card with the icon top-right (muted, size-5), label below it (text-xs text-muted-foreground), value large and bold (text-2xl font-bold), trend at bottom if provided
- Trend: show an up or down arrow (▲ / ▼ character) with the value. Positive = text-green-600, negative = text-red-600. Format: `▲ 12% vs last month`
- Use the `cn` utility from `@/lib/utils`
- Wrapper: a `div` with classes `panel rounded-xl p-4 space-y-1` (the project uses `panel` class for card surfaces)
- No shadcn Card import needed — just use `panel` class div
- No inline styles
