---
type: new
target: src/components/risk-score-explainer.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component that visualizes the ML risk score with feature-level explainability.

Requirements:
- Named export `RiskScoreExplainer`
- Props interface `RiskScoreExplainerProps`:
  - `score: number` — 0-1000
  - `grade: "A" | "B" | "C" | "D" | "E"`
  - `probability: number` — 0-1
  - `contributions: Array<{feature: string; weight: number; contribution: number}>`
  - `className?: string`
- Layout:
  - Header: "Risk assessment" with the grade as a large colored badge (A=green, B=teal, C=yellow, D=orange, E=red).
  - Score display: large number (e.g. "782") with "/1000" in smaller muted text. Below it, "Default probability: 4.2%" in smaller text.
  - Horizontal bar from 0-1000 with colored zones (0-350 red, 350-500 orange, 500-650 yellow, 650-800 teal, 800-1000 green) and a marker at the score.
  - "What drives this score" section: a horizontal bar chart of feature contributions. Each bar extends left (increasing risk, red) or right (reducing risk, green) from a center axis. Label on the left, contribution value on the right. Sorted by absolute contribution, top 8 only.
  - Feature labels should be human-readable: "bureauScore" becomes "Bureau score", "foirPct" becomes "FOIR ratio", "dpd90Count" becomes "90+ DPD history", etc.
- Import `pct` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class
