---
type: new
target: src/components/policy-violation-alert.tsx
model: deepseek
---

## Instructions

Create an alert banner component for policy rule violations in the credit appraisal flow.

Requirements:
- Named export `PolicyViolationAlert`
- Type `Violation`:
  - `rule: string` — rule name, e.g. "FOIR Limit"
  - `message: string` — human-readable explanation
  - `severity: "hard" | "soft"` — hard = blocks approval, soft = warning only
- Props: `violations: Violation[]`, optional `className?: string`
- If no violations, render nothing (return null)
- Render a container with:
  - A header showing count: "2 policy violations found" (or "1 policy violation found")
  - Each violation as a row with:
    - A colored dot: red for hard, amber for soft
    - Rule name in bold
    - Message in regular text
    - A small badge: "Blocks approval" (red) for hard, "Warning" (amber) for soft
- Hard violations should appear before soft violations (sort by severity)
- Container background: light red if any hard violations exist, light amber if all are soft
- Import `cn` from `@/lib/utils`
- No external dependencies
