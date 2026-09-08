---
type: new
target: src/components/application-detail-layout.tsx
context: src/lib/format.ts
---

## Instructions

Create a React layout component for the full application detail page, organizing all sub-components into a tabbed view.

Requirements:
- Named export `ApplicationDetailLayout`
- Props interface `ApplicationDetailLayoutProps`:
  - `applicationId: string`
  - `applicantName: string`
  - `status: string`
  - `decision: string | null`
  - `band: string | null`
  - `createdAt: string`
  - `activeTab: string`
  - `onTabChange?: (tab: string) => void`
  - `children: React.ReactNode` — the tab content rendered below
  - `className?: string`
- Layout:
  - Sticky top bar: application ID on the left, status badge, decision badge (if available) with band color strip. Applicant name. Created date.
  - Back button: "Back to queue" with a left arrow (just a styled button, no routing).
  - Tab navigation bar below the top bar with these tabs:
    - "Overview" (default)
    - "Documents"
    - "Bureau"
    - "Assessment"
    - "Decision"
    - "Audit trail"
  - Active tab has a bottom border highlight in primary blue.
  - Content area below the tabs: renders `children` (the parent page swaps content based on activeTab).
  - Right side actions (desktop only, floated right in the top bar):
    - Status badge
    - "Print CAM" button (outline style)
    - Kebab/three-dot menu for: "Export PDF", "Assign to reviewer", "Add note"
- The component only handles layout and tab navigation. It does NOT fetch data or render specific tab content — that's the parent's job via children.
- Import `cn` from `@/lib/utils`
- Use `panel` class for the top bar
