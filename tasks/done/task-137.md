---
type: new
target: src/components/otp-verification-step.tsx
---

## Instructions

Create a React OTP input and verification component.

Requirements:
- Named export `OTPVerificationStep`
- Props interface `OTPVerificationStepProps`:
  - `maskedTarget: string` — e.g. "XXXX XXX 5678" (masked Aadhaar) or "XX****42@gmail.com" (masked email)
  - `targetType: "aadhaar" | "mobile" | "email"`
  - `otpLength: number` — default 6
  - `onVerify?: (otp: string) => void`
  - `onResend?: () => void`
  - `verified?: boolean`
  - `error?: string | null`
  - `className?: string`
- Layout:
  - Header: "Verify your {targetType}" with the masked target shown below.
  - "OTP sent to {maskedTarget}" message.
  - OTP input: a row of individual square input boxes (one per digit). Auto-focus first box. On typing a digit, auto-advance to next box. On backspace, go back to previous box. Paste support: if pasting a full OTP, distribute across all boxes.
  - Timer: "Resend OTP in 30s" countdown. When timer reaches 0, show "Resend OTP" as a clickable link that calls onResend and restarts the timer.
  - Verify button: "Verify OTP" — disabled until all boxes filled. Calls onVerify with the concatenated digits.
  - If verified is true: show green checkmark with "Verified successfully" and hide the input/button.
  - If error is set: show red error text below the input boxes.
- Use `useState` for OTP digits array, timer countdown.
- Use `useEffect` for the countdown timer (setInterval, clear on unmount).
- Use `useRef` for input element refs (auto-focus management).
- Import `cn` from `@/lib/utils`
