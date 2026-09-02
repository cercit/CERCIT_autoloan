# Task 67 — Vehicle verification: make/model lookup and display

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a function that looks up the vehicle make/model/variant against the known dealer/OEM database and returns pricing and risk tier information. Display it in the copilot review section.

## Current state

- `src/lib/api.ts` has the standard `isSupabaseConfigured` pattern
- `src/lib/mock-data.ts` has mock application data with vehicle fields (`vehicleMake`, `vehicleModel`, `vehicleVariant`, `exShowroom`, `onRoad`)
- `src/components/copilot-review.tsx` has a "Vehicle & LTV" Collapsible section
- Supabase has a `dealers` table with OEM/make data (132 dealers seeded)
- No vehicle verification function exists

## Steps

### 1. Add `verifyVehicle` to `src/lib/api.ts`

```typescript
export type VehicleVerification = {
  make: string;
  model: string;
  variant: string;
  exShowroomVerified: number | null;
  priceDelta: number | null;
  dealerFound: boolean;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
};

export async function verifyVehicle(
  make: string,
  model: string,
  variant: string,
  declaredExShowroom: number
): Promise<VehicleVerification> {
  if (!isSupabaseConfigured) {
    return {
      make, model, variant,
      exShowroomVerified: declaredExShowroom,
      priceDelta: 0,
      dealerFound: true,
      riskTier: "LOW",
    };
  }

  const { data: dealer } = await supabase
    .from("dealers")
    .select("oem, risk_tier")
    .ilike("oem", make)
    .limit(1)
    .single();

  return {
    make, model, variant,
    exShowroomVerified: declaredExShowroom,
    priceDelta: 0,
    dealerFound: !!dealer,
    riskTier: (dealer?.risk_tier as VehicleVerification["riskTier"]) ?? "MEDIUM",
  };
}
```

Run `npx tsc --noEmit`.

### 2. Add vehicle verification to `src/components/copilot-review.tsx`

Import `verifyVehicle` and call it in a `useEffect` with the application's vehicle details. Store the result in state.

Inside the existing "Vehicle & LTV" Collapsible section, add a subsection below the existing content:
- Show "Dealer verified: Yes/No" with a green/red pill
- Show risk tier with a colored pill (LOW=green, MEDIUM=amber, HIGH=red)
- Show price delta if any (difference between declared and verified ex-showroom)

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `VehicleVerification` type and `verifyVehicle` function
- `src/components/copilot-review.tsx` — import, fetch, and display vehicle verification

## Done when

- `npx tsc --noEmit` exits clean
- `verifyVehicle` has mock-data fallback (returns verified with zero delta)
- Dealer found status and risk tier display in the Vehicle & LTV section
- Risk tier has appropriate color coding
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
