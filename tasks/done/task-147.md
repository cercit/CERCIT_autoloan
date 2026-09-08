---
type: new
target: src/components/help-support-panel.tsx
---

## Instructions

Create a React help and support panel component for the customer portal.

Requirements:
- Named export `HelpSupportPanel`
- Props interface `HelpSupportPanelProps`:
  - `applicationId?: string`
  - `applicantName?: string`
  - `onContactSubmit?: (data: {category: string; subject: string; message: string; applicationId?: string}) => void`
  - `className?: string`
- Layout with two tabs (use useState for activeTab):
  - Tab 1 "FAQ": an accordion of common questions. Each question is clickable to expand/collapse the answer:
    - "How long does the approval process take?" → "Typically 24-48 hours for complete applications. Applications with missing documents may take longer."
    - "What documents do I need?" → "For salaried applicants: 3 months salary slips, 6 months bank statement, PAN card, Aadhaar card, and address proof. Self-employed applicants need additional GST returns and ITR."
    - "How is my interest rate decided?" → "Your rate depends on your credit score, income, loan amount, and vehicle type. Better credit profiles qualify for lower rates."
    - "Can I prepay my loan?" → "Yes, prepayment is allowed after 6 months from disbursement. A 2% charge applies on the outstanding principal."
    - "What if my application is declined?" → "You can reapply after 90 days. We recommend improving your credit score and reducing existing obligations before reapplying."
    - "How do I track my application?" → "Use the status tracker on your dashboard. You will also receive SMS and email updates at each stage."
    - "What is NACH mandate?" → "NACH (National Automated Clearing House) is an auto-debit facility. Your EMI will be automatically deducted from your bank account each month."
    - "Who can I contact for help?" → "Use the contact form below or call our helpline at 1800-XXX-XXXX (toll-free, 9 AM - 6 PM IST)."
  - Tab 2 "Contact us": a simple form with:
    - Category dropdown: "Application query", "Document issue", "Payment query", "Technical issue", "Other"
    - Subject text input (required)
    - Message textarea (required, min 20 chars)
    - Application ID: pre-filled if provided in props, editable
    - Submit button: "Send message" (calls onContactSubmit)
- Import `cn` from `@/lib/utils`
- Use `panel` class
- Use `useState` for tab, accordion open states, form state
