import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FoirCalculatorProps {
  netIncome?: number;
  existingObligations?: number;
  proposedEmi?: number;
  onChange?: (foir: number) => void;
}

export function FoirCalculator({
  netIncome: initialNetIncome = 0,
  existingObligations: initialExistingObligations = 0,
  proposedEmi: initialProposedEmi = 0,
  onChange,
}: FoirCalculatorProps) {
  const [netIncome, setNetIncome] = useState<number>(initialNetIncome || 0);
  const [existingObligations, setExistingObligations] = useState<number>(
    initialExistingObligations || 0
  );
  const [proposedEmi, setProposedEmi] = useState<number>(initialProposedEmi || 0);

  const totalObligations = existingObligations + proposedEmi;
  const isValid = netIncome > 0 && !Number.isNaN(netIncome);
  const foir = isValid ? (totalObligations / netIncome) * 100 : NaN;

  useEffect(() => {
    if (onChange && isValid) {
      onChange(foir);
    }
  }, [foir, onChange, isValid]);

  const foirText = isValid ? `${foir.toFixed(1)}%` : "â";
  const barWidth = isValid ? Math.min(foir, 100) : 0;

  const colorClass =
    !isValid || foir > 60
      ? "text-red-600"
      : foir > 50
        ? "text-amber-600"
        : "text-green-600";

  const barColorClass =
    !isValid || foir > 60
      ? "bg-red-600"
      : foir > 50
        ? "bg-amber-600"
        : "bg-green-600";

  return (
    <div className="panel rounded-xl p-5 space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="net-income">Net Monthly Income</Label>
          <Input
            id="net-income"
            type="number"
            value={netIncome || ""}
            onChange={(e) => setNetIncome(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="existing-obligations">Existing Obligations (EMI)</Label>
          <Input
            id="existing-obligations"
            type="number"
            value={existingObligations || ""}
            onChange={(e) => setExistingObligations(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proposed-emi">Proposed Loan EMI</Label>
          <Input
            id="proposed-emi"
            type="number"
            value={proposedEmi || ""}
            onChange={(e) => setProposedEmi(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Total obligations: {inr(totalObligations)}
        </div>
        <div className={cn("text-4xl font-bold", colorClass)}>{foirText}</div>
      </div>

      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColorClass)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}