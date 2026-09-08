---
type: new
target: src/components/risk-matrix.tsx
model: deepseek-r1
---

## Instructions

Create a 2D risk matrix grid component that maps bureau score bands against FOIR bands.

Requirements:
- Named export `RiskMatrix`
- Props (export as `RiskMatrixProps`):
  - `highlightScore?: number` — optional CIBIL score to highlight the active row
  - `highlightFoir?: number` — optional FOIR value to highlight the active column
  - `className?: string`
- Define score bands as rows: "750+" | "700–749" | "650–699" | "< 650"
- Define FOIR bands as columns: "< 40%" | "40–50%" | "50–60%" | "> 60%"
- Each cell shows a risk label: "Low", "Medium", "High", or "Very High"
- Risk mapping (row × column):
  - 750+ row:     Low,    Low,     Medium,  High
  - 700-749 row:  Low,    Medium,  High,    High
  - 650-699 row:  Medium, High,    High,    Very High
  - < 650 row:    High,   High,    Very High, Very High
- Cell colors: Low = green-100/green-700 text, Medium = yellow-100/yellow-700, High = orange-100/orange-700, Very High = red-100/red-700
- Highlight: if highlightScore and highlightFoir are provided, find the matching cell and add a ring-2 ring-primary
- Use helper functions to determine which band a score/FOIR falls into
- Layout: HTML table with `@/components/ui/table` — import Table, TableBody, TableCell, TableHead, TableHeader, TableRow
- Top-left header cell: "Score \ FOIR"
- Import `cn` from `@/lib/utils`
- Wrapper: div with spread className, containing the Table
- Make cells compact: text-xs, px-3 py-2, text-center
