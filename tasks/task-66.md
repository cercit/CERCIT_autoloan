# Task 66 — Employer verification against known employer database

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a function that checks the applicant's employer against a known employer list (with categories: CAT_A, CAT_B, CAT_C, UNVERIFIED). Display the employer category and verification status on the application detail page.

## Current state

- `src/routes/employers.tsx` exists and shows an employer management page
- `src/lib/api.ts` has the standard `isSupabaseConfigured` pattern
- `src/lib/mock-data.ts` likely has mock employer data
- `src/components/copilot-review.tsx` has the employer check from task 65
- The rate grid uses categories A, B, C for interest rate tiers

## Steps

### 1. Add `verifyEmployer` to `src/lib/api.ts`

```typescript
export type EmployerVerification = {
  employerName: string;
  found: boolean;
  category: "CAT_A" | "CAT_B" | "CAT_C" | "UNVERIFIED";
  rateImpact: string;
};

export async function verifyEmployer(
  employerName: string
): Promise<EmployerVerification> {
  if (!isSupabaseConfigured) {
    const knownEmployers: Record<string, "CAT_A" | "CAT_B" | "CAT_C"> = {
      "Infosys": "CAT_A", "TCS": "CAT_A", "Wipro": "CAT_A", "HCL": "CAT_A",
      "Reliance": "CAT_A", "HDFC Bank": "CAT_A", "SBI": "CAT_A",
      "Tech Mahindra": "CAT_B", "Mindtree": "CAT_B", "L&T": "CAT_B",
    };
    const cat = knownEmployers[employerName];
    return {
      employerName,
      found: !!cat,
      category: cat ?? "UNVERIFIED",
      rateImpact: cat === "CAT_A" ? "Best rate eligible" : cat === "CAT_B" ? "Standard rate" : cat === "CAT_C" ? "Higher rate bracket" : "Manual verification required",
    };
  }

  const { data, error } = await supabase
    .from("employers")
    .select("category")
    .ilike("name", employerName)
    .limit(1)
    .single();

  if (error || !data) {
    return { employerName, found: false, category: "UNVERIFIED", rateImpact: "Manual verification required" };
  }

  const cat = data.category as EmployerVerification["category"];
  return {
    employerName,
    found: true,
    category: cat,
    rateImpact: cat === "CAT_A" ? "Best rate eligible" : cat === "CAT_B" ? "Standard rate" : "Higher rate bracket",
  };
}
```

Run `npx tsc --noEmit`.

### 2. Add employer verification display to `src/components/copilot-review.tsx`

Import `verifyEmployer` and call it inside a `useEffect` with the application's employer name. Store the result in state.

Add a new row in the copilot review showing:
- Employer name
- Category badge (use `CategoryBadge` from status.tsx if available, otherwise a `Pill`)
- Rate impact description
- "Verified" / "Unverified" indicator

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `EmployerVerification` type and `verifyEmployer` function
- `src/components/copilot-review.tsx` — import, fetch, and display employer verification

## Done when

- `npx tsc --noEmit` exits clean
- `verifyEmployer` has mock-data fallback with a hardcoded list of known employers
- Returns category and rate impact for known employers
- Returns UNVERIFIED for unknown employers
- Employer verification result renders in the copilot review
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new data field resolves from its source, not a hardcoded fallback
