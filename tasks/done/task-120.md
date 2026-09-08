---
type: new
target: src/components/esign-consent-flow.tsx
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a React component for an e-signature consent and agreement flow.

Requirements:
- Named export `ESignConsentFlow`
- Props interface `ESignConsentFlowProps`:
  - `applicantName: string`
  - `loanAmount: number`
  - `tenure: number`
  - `rate: number`
  - `emi: number`
  - `agreementItems: string[]` — list of agreement clauses
  - `onConsent?: (signature: {name: string; timestamp: string; ipAddress: string; method: string}) => void`
  - `onDecline?: () => void`
  - `className?: string`
- Layout — a multi-step flow using useState for currentStep (0, 1, 2):
  - Step 0 "Review terms": Show loan summary (amount, tenure, rate, EMI in INR) in a highlighted box. Below it, list each agreement clause with a checkbox. All checkboxes must be checked to proceed. "Next" button disabled until all checked.
  - Step 1 "Sign": A text input where the user types their full name as their digital signature. Below it, a canvas-style box (just a bordered div with the typed name rendered in a cursive/script font style using CSS font-style: italic and a larger size). A checkbox: "I confirm this is my digital signature". Timestamp shown: current date/time. "Sign & submit" button, disabled until name entered and checkbox checked.
  - Step 2 "Confirmation": A success state showing a green checkmark icon (SVG), "Agreement signed successfully", the signature details (name, timestamp, method: "typed"), and a note: "A copy has been sent to your registered email."
  - "Decline" link/button available on steps 0 and 1, calls onDecline.
  - On submit in step 1, call onConsent with {name, timestamp: ISO string, ipAddress: "collected-on-server", method: "typed"}.
- Step indicator at the top: three dots/circles showing progress.
- Import `inr` from `@/lib/format`
- Import `cn` from `@/lib/utils`
- Use `panel` class for the container
