---
type: new
target: src/components/document-checklist.tsx
model: deepseek
---

## Instructions

Create a document verification checklist that shows which required documents have been uploaded and verified.

Requirements:
- Named export `DocumentChecklist`
- Export type `DocCheckItem`:
  - `name: string` — document name (e.g. "PAN Card", "Salary Slip (3 months)")
  - `status: "pending" | "uploaded" | "verified" | "rejected"`
  - `note?: string` — optional reviewer note
- Props type (export as `DocumentChecklistProps`):
  - `items: DocCheckItem[]`
  - `className?: string`
- Layout: a vertical list with each item as a row
- Each row shows:
  - Left: status icon — pending (Circle, muted), uploaded (Upload, blue), verified (CheckCircle, green), rejected (XCircle, red). Import these from `lucide-react`.
  - Middle: document name (text-sm), note below in text-xs text-muted-foreground if present
  - Right: a Badge showing the status text. Use variant "outline" for pending, "default" for uploaded, "secondary" for verified (add green bg with className), "destructive" for rejected.
- Import Badge from `@/components/ui/badge`
- Import `cn` from `@/lib/utils`
- Wrapper: div with `space-y-2` + spread className
- Each row: `flex items-start gap-3 rounded-lg border p-3`
- If all items are verified, show a green banner at the top: "All documents verified"
