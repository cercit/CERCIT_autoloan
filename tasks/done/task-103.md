---
type: new
target: src/lib/pan-validator.ts
model: inkling
---

## Instructions

Create a PAN (Permanent Account Number) validation utility for Indian tax IDs.

Requirements:
- Named export `isValidPan(pan: string): boolean`
  - PAN format: 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F)
  - The 4th character indicates entity type: P = Individual, C = Company, H = HUF, F = Firm, A = AOP, T = Trust, etc.
  - Return true only if the format matches exactly (10 chars, correct pattern)
- Named export `panEntityType(pan: string): string | null`
  - Return the entity type based on the 4th character: "Individual", "Company", "HUF", "Firm", "AOP", "Trust", "BOI", "Local Authority", "Government", "Artificial Juridical Person"
  - Return null if PAN is invalid
- Named export `maskPan(pan: string): string`
  - Mask the middle characters, showing only first 2 and last 2: "AB******4F"
  - If PAN is invalid, return the input unchanged
- Named export `panMatchesName(pan: string, name: string): boolean`
  - Basic heuristic: the 5th character of PAN should match the first letter of the person's last name
  - Extract the last word from the name as the last name
  - Return true if they match (case-insensitive), false otherwise
  - Return false if PAN is invalid or name is empty
- Pure TypeScript, no external dependencies
