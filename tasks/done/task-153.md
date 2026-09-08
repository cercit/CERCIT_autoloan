---
type: new
target: src/components/skeleton-loaders.tsx
---

## Instructions

Create a React module exporting a set of skeleton/shimmer loading placeholder components.

Requirements:
- Named export `SkeletonLine` — a single animated bar. Props: `width?: string` (default "100%"), `height?: string` (default "1rem"), `className?: string`. Renders a rounded div with a shimmer animation.

- Named export `SkeletonCard` — a card-shaped placeholder. Props: `lines?: number` (default 3), `showAvatar?: boolean` (default false), `className?: string`. Renders a panel-class container with: optional circle (avatar), a wider bar (title), then N narrower bars (content lines) of varying widths (100%, 80%, 60% cycling).

- Named export `SkeletonTable` — a table placeholder. Props: `rows?: number` (default 5), `columns?: number` (default 4), `className?: string`. Renders a header row of bars, then N body rows of bars.

- Named export `SkeletonKPIRow` — matches the DashboardKPIRow layout. Props: `count?: number` (default 4), `className?: string`. Renders N card-shaped placeholders in a grid.

- Named export `SkeletonApplicationStrip` — matches the ApplicationSummaryStrip layout. Props: `count?: number` (default 5), `className?: string`. Renders N horizontal strip placeholders.

- Shimmer animation: use CSS keyframes. A gradient that slides left to right across the placeholder. Light mode: gray-100 to gray-200 to gray-100. Dark mode aware: use CSS variables or prefers-color-scheme for darker tones.

- All skeletons use `aria-hidden="true"` and `role="presentation"`.
- Import `cn` from `@/lib/utils`
- Define the @keyframes shimmer animation in a <style> tag or inline styles within the component file.
