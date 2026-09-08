---
type: edit
target: src/routes/applications/$id/index.tsx
---

## Instructions

Update the imports in the application detail page to use the newer Hermes components where they are direct replacements. Keep all existing functionality working.

Changes:

1. Replace this import:
```typescript
import { BankStatementSummary } from "@/components/bank-statement-summary";
```
With:
```typescript
import { CashflowSummaryCard } from "@/components/cashflow-summary-card";
```

2. Replace this import:
```typescript
import { ExtractionResult } from "@/components/extraction-result";
```
With:
```typescript
import { DocumentExtractionReview } from "@/components/document-extraction-review";
```

3. Replace this import:
```typescript
import { ApplicationTimeline } from "@/components/application-timeline";
```
With:
```typescript
import { AuditTrailTimeline } from "@/components/audit-trail-timeline";
```

4. Replace this import:
```typescript
import { CamReport } from "@/components/cam-report";
```
With:
```typescript
import { CAMPreview } from "@/components/cam-preview";
```

5. In the "banking" TabsContent, replace `<BankStatementSummary data={bankingSummary} />` with:
```tsx
<CashflowSummaryCard
  totalCredits={bankingSummary.totalCredits ?? 0}
  totalDebits={bankingSummary.totalDebits ?? 0}
  avgMonthlyBalance={bankingSummary.avgBalance ?? 0}
  avgSalary={bankingSummary.avgSalaryAmount ?? 0}
  salaryRegularity={bankingSummary.salaryRegularity ?? "none"}
  bounceCount={bankingSummary.bounceCount ?? 0}
  totalEmiBurden={bankingSummary.totalEmiOutflow ?? 0}
  cashWithdrawalRatio={bankingSummary.cashWithdrawalPct ?? 0}
  monthCount={bankingSummary.monthCount ?? 6}
/>
```

6. In the "extracted" TabsContent, replace `<ExtractionResult />` with:
```tsx
<DocumentExtractionReview
  documentName="Application documents"
  documentType="Combined extraction"
  fields={[]}
/>
```

7. In the "timeline" TabsContent, replace `<ApplicationTimeline events={timeline} />` with:
```tsx
<AuditTrailTimeline
  entries={timeline.map(e => ({
    id: e.id ?? String(Math.random()),
    created_at: e.timestamp,
    actor_name: e.actor ?? "System",
    action: e.action,
    detail: e.detail ?? {},
  }))}
/>
```

8. In the "cam" TabsContent, replace `<CamReport app={app} />` with:
```tsx
<CAMPreview
  applicationId={app.id}
  generatedAt={new Date().toISOString()}
  applicantName={app.name}
  applicantAge={app.age ?? 30}
  employer={app.employer}
  employerCategory={app.employerCategory ?? "B"}
  grossIncome={app.netIncome}
  vehicleMake={app.vehicleMake ?? ""}
  vehicleModel={app.vehicleModel ?? ""}
  onRoadPrice={app.vehiclePrice ?? 0}
  loanAmount={app.loanAmount}
  tenure={app.tenure ?? 60}
  rate={app.rate}
  emi={0}
  bureauScore={app.cibilScore}
  bureauBand={app.cibilScore >= 750 ? "green" : app.cibilScore >= 700 ? "amber-high" : app.cibilScore >= 650 ? "amber-low" : "red"}
  foirPct={0}
  ltvPct={0}
  netSurplus={0}
  decision={app.recommendation === "Approve" ? "approve" : app.recommendation === "Reject" ? "decline" : "review"}
  policyScore={0}
  failedRules={[]}
  recommendation={`Application ${app.recommendation.toLowerCase()}ed based on assessment.`}
/>
```

Keep DocumentUpload and BankStatementTransactions imports unchanged — those will be migrated separately. The file must compile.
