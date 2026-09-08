import { useState } from "react";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface ESignConsentFlowProps {
  applicantName: string;
  loanAmount: number;
  tenure: number;
  rate: number;
  emi: number;
  agreementItems: string[];
  onConsent?: (signature: { name: string; timestamp: string; ipAddress: string; method: string }) => void;
  onDecline?: () => void;
  className?: string;
}

export function ESignConsentFlow({
  applicantName,
  loanAmount,
  tenure,
  rate,
  emi,
  agreementItems,
  onConsent,
  onDecline,
  className,
}: ESignConsentFlowProps) {
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [signatureName, setSignatureName] = useState("");
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);

  const allChecked = agreementItems.every((_, i) => checked[i]);

  const handleCheck = (i: number) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const handleNext = () => setStep((s) => s + 1);
  const handleSubmit = () => {
    onConsent?.({
      name: signatureName,
      timestamp: new Date().toISOString(),
      ipAddress: "collected-on-server",
      method: "typed",
    });
    setStep(2);
  };

  const steps = [
    { label: "Review", completed: step >= 0 },
    { label: "Sign", completed: step >= 1 },
    { label: "Confirm", completed: step === 2 },
  ];

  return (
    <div className={cn("panel", className)}>
      <div className="flex items-center justify-center gap-3 mb-5">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                s.completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span className={cn("text-xs font-medium hidden sm:inline", s.completed ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 h-0.5 bg-muted rounded-full" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
            <h4 className="font-semibold">Loan Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Amount</span><span className="text-foreground text-right">{inr(loanAmount)}</span>
              <span>Tenure</span><span className="text-foreground text-right">{tenure} months</span>
              <span>Rate</span><span className="text-foreground text-right">{rate}%</span>
              <span>Monthly EMI</span><span className="text-foreground text-right font-medium">{inr(emi)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Agreement clauses</h4>
            {agreementItems.map((item, i) => (
              <label key={i} className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => handleCheck(i)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-foreground">{item}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={onDecline} className="text-sm text-destructive underline hover:text-destructive/80">Decline</button>
            <button
              onClick={handleNext}
              disabled={!allChecked}
              className={cn("rounded-md px-5 py-2.5 text-sm font-medium text-white transition-colors", allChecked ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Type your full name to sign digitally</p>
          <input
            type="text"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="Enter full name"
            className="w-full rounded-md border px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="rounded-md border-2 border-dashed p-6 text-center bg-muted/10">
            <p className="text-2xl italic font-serif text-foreground tracking-wide">{signatureName || "Your digital signature"}</p>
          </div>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={signatureConfirmed}
              onChange={(e) => setSignatureConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>I confirm this is my digital signature and agree to the terms</span>
          </label>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>

          <div className="flex items-center justify-between pt-2">
            <button onClick={onDecline} className="text-sm text-destructive underline hover:text-destructive/80">Decline</button>
            <button
              onClick={handleSubmit}
              disabled={!signatureName.trim() || !signatureConfirmed}
              className={cn("rounded-md px-5 py-2.5 text-sm font-medium text-white transition-colors", signatureName.trim() && signatureConfirmed ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}
            >
              Sign & submit
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="text-center py-6 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 text-green-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3 className="text-xl font-bold text-green-700">Agreement signed successfully</h3>
          <div className="rounded-md border bg-muted/20 p-4 text-left text-sm space-y-1">
            <p><strong>Signed by:</strong> {signatureName}</p>
            <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
            <p><strong>Method:</strong> typed digital signature</p>
          </div>
          <p className="text-xs text-muted-foreground">A copy has been sent to your registered email.</p>
        </div>
      )}
    </div>
  );
}
