---
type: new
target: src/components/activity-feed.tsx
model: qwen-coder
---

## Instructions

Create a generic activity/audit feed component showing timestamped events.

Requirements:
- Named export `ActivityFeed`
- Type `FeedItem`:
  - `id: string`
  - `actor: string` — who performed the action (name or system label)
  - `action: string` — what happened, e.g. "submitted application", "updated CIBIL score"
  - `timestamp: string` — ISO date string
  - `type?: "info" | "success" | "warning" | "error"` — defaults to "info"
- Props: `items: FeedItem[]`, optional `maxItems?: number` (defaults to 10), optional `className?: string`
- Render a vertical list with a thin left-side timeline line (2px gray)
- Each item shows:
  - A small colored dot on the timeline line (color based on type)
  - Actor name in semibold
  - Action text in regular weight
  - Relative timestamp: "2m ago", "1h ago", "3d ago" format — compute from the ISO string
- Show only the first `maxItems` items; if there are more, show a "Show N more" text button at the bottom
- The list should be sorted newest first (assume input is already sorted)
- Import `cn` from `@/lib/utils`
- No external dependencies
