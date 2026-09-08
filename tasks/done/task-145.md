---
type: new
target: src/components/application-form-steps.tsx
context: src/lib/format.ts
---

## Instructions

Create a React multi-step application form orchestrator component.

Requirements:
- Named export `ApplicationFormSteps`
- Props interface `ApplicationFormStepsProps`:
  - `initialData?: Record<string, unknown>`
  - `onComplete?: (data: Record<string, unknown>) => void`
  - `onSaveDraft?: (data: Record<string, unknown>, step: number) => void`
  - `className?: string`
- The component manages a 4-step form flow using useState for currentStep (0-3) and formData:
  - Step 0 "Personal details": name (text, required), date of birth (date, required), PAN (text, required, validate 10-char format), mobile (text, required, 10 digits), email (text, required), current address (textarea), pincode (text, 6 digits)
  - Step 1 "Employment": employer name (text, required), designation (text), employer category (select: A/B/C/Unverified), employment type (select: Salaried/Self-employed), gross monthly income (number, required), net monthly income (number)
  - Step 2 "Loan & vehicle": vehicle make (select from: Maruti Suzuki, Hyundai, Tata Motors, Mahindra, Kia, Toyota, Honda, MG, Skoda, Volkswagen), vehicle model (text, required), vehicle segment (select: car/suv/lcv/scv/3w), ex-showroom price (number, required), on-road price (number, required), loan amount (number, required), tenure (select: 12/24/36/48/60/72/84 months), dealer name (text)
  - Step 3 "Review & submit": read-only summary of all entered data in sections, with an "Edit" link next to each section that jumps back to that step.
- Step indicator at top: horizontal bar with 4 circles, labels below, completed steps filled green.
- Navigation: "Back" and "Next" buttons. "Save draft" link on every step (calls onSaveDraft). Step 3 has "Submit application" instead of "Next" (calls onComplete).
- Basic validation: required fields must be filled before advancing. Show inline red error messages for invalid fields.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class for the form container
