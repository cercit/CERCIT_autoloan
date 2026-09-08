---
type: new
target: src/components/document-extraction-review.tsx
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a React component for reviewing data extracted from an uploaded document.

Requirements:
- Named export `DocumentExtractionReview`
- Named export type `ExtractedField`:
  - `label: string` — field name, e.g. "Gross Salary"
  - `value: string` — extracted value as string
  - `confidence: "high" | "medium" | "low"`
  - `editable?: boolean` — defaults to true
- Props interface `DocumentExtractionReviewProps`:
  - `documentName: string` — file name of the uploaded document
  - `documentType: string` — e.g. "Salary Slip", "Bank Statement", "PAN Card"
  - `fields: ExtractedField[]`
  - `onFieldChange?: (index: number, newValue: string) => void`
  - `onConfirm?: () => void`
  - `onReject?: () => void`
  - `className?: string`
- Layout: a card with header showing document name and type
- Below the header: a grid of extracted fields. Each field shows:
  - Label in small muted text
  - Value in a text input (editable) or plain text (if editable is false)
  - Confidence indicator: green dot for high, yellow for medium, red for low, with tooltip text "High confidence" etc.
- If onFieldChange is provided, inputs are editable and call onFieldChange(index, newValue) on change
- Footer with two buttons: "Confirm extraction" (primary, calls onConfirm) and "Reject / re-upload" (outline/destructive, calls onReject)
- Show a summary line above the buttons: "X of Y fields extracted with high confidence"
- Import `cn` from `@/lib/utils`
- Use `panel` utility class for the card
- Use `useState` from React if needed for local input state
