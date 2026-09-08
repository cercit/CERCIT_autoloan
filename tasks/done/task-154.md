---
type: new
target: src/lib/employer-verifier.ts
---

## Instructions

Create a TypeScript module for employer verification and categorization.

Requirements:
- Named export type `EmployerProfile`:
  - `name: string`
  - `category: "A" | "B" | "C" | "unverified"`
  - `categoryLabel: string` — "Premium employer", "Standard employer", "Other employer", "Unverified"
  - `sector: string | null` — "Banking", "IT/Software", "Government", "Manufacturing", "FMCG", "Telecom", "Healthcare", "Education", "Other"
  - `verified: boolean`
  - `matchedAgainst: string | null` — the known employer name it matched against, if any
- Named export `CATEGORY_A_EMPLOYERS: string[]` — Top employers: "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra", "TCS", "Infosys", "Wipro", "HCL Technologies", "Tech Mahindra", "Reliance Industries", "Tata Group", "L&T", "ITC", "Hindustan Unilever", "Bharti Airtel", "Government of India", "Indian Railways", "Indian Army", "Indian Navy", "Indian Air Force", "ISRO", "DRDO", "ONGC", "NTPC", "BHEL", "Coal India", "IOC", "BPCL", "HPCL", "Maruti Suzuki", "Hyundai Motor India", "Bajaj Auto", "Hero MotoCorp", "TVS Motor"

- Named export `CATEGORY_B_EMPLOYERS: string[]` — 20 mid-tier employers: regional banks, mid-size IT companies, state governments, large hospitals, universities, mid-size manufacturing.

- Named export `classifyEmployer(employerName: string): EmployerProfile`
  - Normalize input: trim, lowercase for matching.
  - Fuzzy match against Category A list first: if any keyword from a Category A name appears in the input (e.g. "sbi" matches "State Bank of India", "tcs" matches "TCS"), return category A.
  - Then check Category B similarly.
  - If no match: return category C with verified: false.
  - Detect sector from keywords: "bank" → Banking, "tech" or "software" or "IT" → IT/Software, "government" or "govt" → Government, etc.
- Named export `verifyEmployerPAN(employerPan: string): {valid: boolean; entityType: string | null}`
  - Check PAN format (same as personal PAN but 4th char should be C for Company, F for Firm, T for Trust, etc.)
  - Return entity type based on 4th character
- Pure TypeScript, no deps
