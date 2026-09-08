---
type: new
target: src/lib/aadhaar-validator.ts
model: gemini-flash
---

## Instructions

Create an Aadhaar number validation utility using the Verhoeff checksum algorithm.

Requirements:
- Named export `isValidAadhaar(aadhaar: string): boolean`
  - Strip all spaces and hyphens from input
  - Must be exactly 12 digits
  - Must not start with 0 or 1
  - Must pass the Verhoeff checksum (last digit is the check digit)
  - Return true only if all conditions pass
- Implement the Verhoeff algorithm internally:
  - Define the multiplication table `d` (10x10 matrix)
  - Define the permutation table `p` (8x10 matrix)
  - Define the inverse table `inv` (10 elements)
  - The checksum of all 12 digits (including check digit) should equal 0
- Named export `formatAadhaar(aadhaar: string): string`
  - Format as "XXXX XXXX XXXX" with spaces every 4 digits
  - If input is not 12 digits after stripping, return input unchanged
- Named export `maskAadhaar(aadhaar: string): string`
  - Show only last 4 digits: "XXXX XXXX 5678"
  - If invalid, return input unchanged
- Pure TypeScript, no external dependencies, no React
