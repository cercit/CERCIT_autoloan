---
type: new
target: src/components/score-gauge.tsx
model: inkling
---

## Instructions

Create a semicircular gauge component that displays a bureau/CIBIL score visually.

Requirements:
- Named export `ScoreGauge`
- Props: `score: number` (300–900 range), optional `label?: string` (defaults to "CIBIL Score")
- Render an SVG semicircle (180-degree arc) with a colored fill arc showing the score position
- Color zones: red (300–599), amber/yellow (600–699), light green (700–749), green (750–900)
- Show the numeric score centered below the arc in large bold text
- Show the label above the arc in small muted text
- SVG viewBox should be "0 0 200 120" — compact
- Use `stroke-dasharray` and `stroke-dashoffset` on a `<path>` or `<circle>` for the arc
- Background arc in muted gray, foreground arc in the score color
- Import `cn` from `@/lib/utils`
- Tailwind classes for the wrapper div: `flex flex-col items-center`
- No inline styles except on SVG elements where needed for stroke math
- Accept and spread an optional `className` prop on the outer div
