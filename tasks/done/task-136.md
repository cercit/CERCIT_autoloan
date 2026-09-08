---
type: new
target: src/components/decision-override-form.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for a credit officer to override an automated decision with justification.

Requirements:
- Named export `DecisionOverrideForm`
- Props interface `DecisionOverrideFormProps`:
  - `applicationId: string`
  - `currentDecision: "approve" | "review" | "decline"`
  - `currentBand: string`
  - `policyScore: number`
  - `failedRules: Array<{id: string; description: string; severity: string}>`
  - `onSubmit?: (override: {newDecision: string; reason: string; category: string; conditions: string[]}) => void`
  - `onCancel?: () => void`
  - `className?: string`
- Layout:
  - Header: "Override decision" with current decision shown as a badge.
  - Current status section: show policy score, failed rules list (read-only, for reference).
  - New decision selector: three radio options — "Approve", "Send to review", "Decline". Cannot select the same as current decision.
  - Override category dropdown: "Credit exception", "Policy relaxation", "Additional collateral", "Guarantor added", "Management approval", "Other".
  - Reason textarea: required, minimum 50 characters. Show character count. Placeholder: "Explain why this decision is being overridden..."
  - Conditions checklist (optional, shown only if overriding to approve):
    - "Additional income proof required"
    - "Higher margin money"
    - "Guarantor required"
    - "Reduced loan amount"
    - "Shorter tenure"
    - Each is a checkbox the officer can select
  - Warning banner if overriding a "decline" to "approve": "Overriding a declined application requires management approval and will be flagged in the audit trail."
  - Submit button: "Submit override" (disabled until reason has 50+ chars and new decision selected). Cancel button.
- Import `cn` from `@/lib/utils`
- Use `panel` class
- Use `useState` for form state
