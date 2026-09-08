---
type: edit
target: src/lib/engine.ts
context: src/lib/policy-rule-engine.ts
---

## Instructions

The file `src/lib/policy-rule-engine.ts` has a cleaner rule-definition pattern with named POLICY_RULES and evaluatePolicy(). Import and re-export them from engine.ts so consumers can use either file.

At the BOTTOM of engine.ts (after all existing code), add these lines:

```typescript
// Re-export policy rule engine for standalone use
export {
  POLICY_RULES,
  evaluatePolicy,
  type PolicyRule,
  type PolicyInput as PolicyRuleInput,
  type PolicyResult,
  type Severity,
} from "./policy-rule-engine";
```

Do NOT change any existing code in engine.ts. Only append the re-export block at the end. The file must compile with `npx tsc --noEmit`.
