---
type: new
target: src/components/vehicle-info-card.tsx
model: inkling
---

## Instructions

Create a card component displaying vehicle details for a loan application.

Requirements:
- Named export `VehicleInfoCard`
- Props interface `VehicleInfoCardProps`:
  - `make: string` — e.g. "Hyundai"
  - `model: string` — e.g. "Creta SX 1.5 Diesel"
  - `type: "Car" | "SUV" | "Commercial"` — vehicle category
  - `exShowroom: number` — ex-showroom price
  - `onRoad: number` — on-road price
  - `dealer?: string` — dealer name
  - `dealerCity?: string`
  - `className?: string`
- Import `inr` from `@/lib/format` to format prices
- Import `cn` from `@/lib/utils`
- Show make and model as the main heading
- Vehicle type as a small pill/badge next to the heading
- Two price rows: "Ex-showroom" and "On-road" with values right-aligned
- Dealer name and city in a muted footer section, only if provided
- Use `panel` utility class for the container
- Use `tabular-nums` or the `tabular` utility on price values
