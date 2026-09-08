---
type: new
target: src/lib/address-proof-parser.ts
---

## Instructions

Create a TypeScript module that extracts address information from utility bills, rent agreements, and other address proof documents.

Requirements:
- Named export type `AddressData`:
  - `fullAddress: string | null`
  - `name: string | null`
  - `pincode: string | null`
  - `city: string | null`
  - `state: string | null`
  - `documentType: "electricity_bill" | "water_bill" | "gas_bill" | "telephone_bill" | "rent_agreement" | "other"`
  - `issueDate: string | null` — ISO date
  - `confidence: "high" | "medium" | "low"`
- Named export `parseAddressProof(text: string): AddressData`
  - Detect document type from keywords: "electricity" or "power" or "discom" → electricity_bill, "water supply" or "jal board" → water_bill, "gas" or "lpg" or "png" → gas_bill, "telephone" or "airtel" or "jio" or "bsnl" → telephone_bill, "rent agreement" or "lease deed" or "tenancy" → rent_agreement
  - Extract pincode: regex for 6-digit number that's a valid Indian pincode (100000-999999)
  - Extract state: match against a list of Indian state names
  - Extract city: match against common city names (Mumbai, Delhi, Chennai, Bangalore, Hyderabad, Kolkata, Pune, Ahmedabad, Jaipur, Lucknow, plus 20 more)
  - Extract full address: look for lines containing the pincode or state, take the surrounding 2-3 lines as the address block
  - Extract name: look for "Name:", "Consumer Name:", "Subscriber:", "Tenant:", "Lessee:" followed by text
  - Extract date: look for "Date:", "Bill Date:", "Issue Date:" followed by a date pattern
  - Confidence: high if pincode + state + name found, medium if 2 of 3, low otherwise
- Named export `INDIAN_STATES: string[]` — all 28 states + 8 UTs
- Pure TypeScript, no deps
