---
type: new
target: src/components/dealer-card.tsx
model: inkling
---

## Instructions

Create a card component displaying dealer information for the vehicle finance flow.

Requirements:
- Named export `DealerCard`
- Props interface `DealerCardProps`:
  - `name: string` — dealer name
  - `city: string` — dealer city
  - `oem: string` — OEM brand (e.g. "Maruti Suzuki", "Hyundai")
  - `tier: "A" | "B" | "C"` — dealer risk tier
  - `contactPerson?: string`
  - `phone?: string`
  - `active?: boolean` — defaults to true
  - `onClick?: () => void`
  - `className?: string`
- Show OEM name as a small badge at the top right
- Tier displayed as a colored circle: A = green, B = yellow, C = red with the letter inside
- If `active` is false, show a muted/dimmed card with an "Inactive" label
- Contact person and phone shown only if provided, in smaller muted text
- Card uses `panel` utility class from styles.css for the container
- Import `cn` from `@/lib/utils`
- No external dependencies beyond React
