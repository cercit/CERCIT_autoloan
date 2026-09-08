---
type: new
target: src/components/nach-mandate-form.tsx
context: src/lib/format.ts
---

## Instructions

Create a React component for registering a NACH (National Automated Clearing House) auto-debit mandate.

Requirements:
- Named export `NACHMandateForm`
- Props interface `NACHMandateFormProps`:
  - `applicantName: string`
  - `emi: number`
  - `loanStartDate: string` — ISO date
  - `tenure: number` — months
  - `onSubmit?: (mandate: {bankName: string; accountNumber: string; ifsc: string; accountType: string; maxAmount: number; frequency: string; startDate: string; endDate: string}) => void`
  - `onSkip?: () => void`
  - `className?: string`
- Layout:
  - Header: "Set up auto-debit (NACH)" with explanation: "Authorize automatic EMI deduction from your bank account on the 5th of every month."
  - EMI summary: show EMI amount, start date, end date (startDate + tenure months), total payments count.
  - Form fields:
    - Bank name: dropdown with common banks (SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, Union, IndusInd, Yes, IDFC First, Federal, South Indian, Karur Vysya). Required.
    - Account number: text input, must be 10-18 digits. Required.
    - Confirm account number: must match. Required.
    - IFSC code: text input, format validation (4 letters + 0 + 6 alphanumeric). Required.
    - Account type: radio — "Savings" or "Current". Default "Savings".
  - Max deduction amount: auto-filled as EMI * 1.5 (to cover penalties). Show as read-only field with note: "Maximum amount includes buffer for penalty charges."
  - Submit button: "Register NACH mandate". Skip link: "I'll set this up later" (calls onSkip).
  - Validation: all required fields filled, account numbers match, IFSC format valid.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class
- Use `useState` for form state and validation errors
