import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EligibilityIndicator } from "@/components/eligibility-indicator";
import { emiFor, inr } from "@/lib/format";

export const Route = createFileRoute("/check-eligibility")({
  head: () => ({
    meta: [
      { title: "Check eligibility — cercit" },
      {
        name: "description",
        content:
          "Quick eligibility check for a car loan — enter income, CIBIL score, loan amount and tenure to get an instant signal.",
      },
    ],
  }),
  component: CheckEligibility,
});

function CheckEligibility() {
  const [cibil, setCibil] = useState("");
  const [income, setIncome] = useState("");
  const [loan, setLoan] = useState("");
  const [tenure, setTenure] = useState("60");
  const [existingEmi, setExistingEmi] = useState("");
  const [show, setShow] = useState(false);

  const cibilNum = Number(cibil) || null;
  const incomeNum = Number(income) || null;
  const loanNum = Number(loan) || null;
  const tenureNum = Number(tenure) || null;
  const emiNum = Number(existingEmi) || null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Car loan eligibility</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick check — no login needed
          </p>
        </div>

        <div className="panel space-y-4 p-6">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">CIBIL score</Label>
            <Input
              value={cibil}
              onChange={(e) => setCibil(e.target.value)}
              placeholder="e.g. 750"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Monthly net income (Rs)</Label>
            <Input
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="e.g. 85000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Loan amount (Rs)</Label>
            <Input
              value={loan}
              onChange={(e) => setLoan(e.target.value)}
              placeholder="e.g. 800000"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tenure (months)</Label>
              <Select value={tenure} onValueChange={setTenure}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[12, 24, 36, 48, 60, 72, 84].map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {t} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Existing EMIs (Rs)</Label>
              <Input
                value={existingEmi}
                onChange={(e) => setExistingEmi(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <Button className="w-full" onClick={() => setShow(true)}>
            Check eligibility
          </Button>
        </div>

        {show && (
          <EligibilityIndicator
            cibilScore={cibilNum}
            monthlyIncome={incomeNum}
            loanAmount={loanNum}
            tenure={tenureNum}
            existingEmi={emiNum}
          />
        )}

        {show && loanNum && tenureNum && (
          <p className="text-center text-xs text-muted-foreground">
            Estimated EMI at 8.99%: {inr(emiFor(loanNum, 8.99, tenureNum))} / month
          </p>
        )}
      </div>
    </div>
  );
}
