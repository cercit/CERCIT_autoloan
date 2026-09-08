import { useState } from "react";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface NACHMandateFormProps {
  emi: number;
  applicantName?: string;
  onSubmit?: (data: { bankName: string; accountNumber: string; confirmAccountNumber: string; ifsc: string; accountType: "Savings" | "Current" }) => void;
  className?: string;
}

const BANKS = ["State Bank of India (SBI)", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank of India", "Indian Bank", "Bank of India", "IDFC First Bank", "IndusInd Bank", "Yes Bank", "Federal Bank"];

export function NACHMandateForm({ emi, applicantName, onSubmit, className }: NACHMandateFormProps) {
  const [bank, setBank] = useState(BANKS[0]!);
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountType, setAccountType] = useState<"Savings" | "Current">("Savings");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const maxDeduction = Math.round(emi * 1.5);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!bank) errs['bankName'] = "Select a bank";
    if (!/^\d{9,18}$/.test(accountNumber)) errs['accountNumber'] = "Account number must be 9-18 digits";
    if (confirmAccountNumber !== accountNumber) errs['confirmAccountNumber'] = "Account numbers do not match";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) errs['ifsc'] = "Invalid IFSC format";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.({ bankName: bank, accountNumber, confirmAccountNumber, ifsc: ifsc.toUpperCase(), accountType });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-1">NACH Auto-Debit Mandate</h3>
      {applicantName && <p className="text-xs text-muted-foreground mb-4">Applicant: {applicantName}</p>}

      <div className="rounded-lg border bg-muted/20 p-3 mb-4 text-sm space-y-1">
        <h4 className="font-semibold text-xs mb-2">EMI Summary</h4>
        <div className="flex justify-between"><span>Monthly EMI</span><span className="font-medium">{inr(emi)}</span></div>
        <div className="flex justify-between"><span>Max deduction allowed</span><span className="font-medium">{inr(maxDeduction)}</span></div>
        <div className="flex justify-between"><span>Mandate start</span><span>Next billing cycle</span></div>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="bankName" className="text-xs font-medium text-muted-foreground block mb-1">Bank</label>
          <select id="bankName" value={bank} onChange={(e) => setBank(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm bg-background">
            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="accNo" className="text-xs font-medium text-muted-foreground block mb-1">Account number</label>
          <input id="accNo" type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="10 to 18 digits" className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
          {errors['accountNumber'] && <p className="text-xs text-red-600 mt-0.5">{errors['accountNumber']}</p>}
        </div>

        <div>
          <label htmlFor="confirmAcc" className="text-xs font-medium text-muted-foreground block mb-1">Confirm account number</label>
          <input id="confirmAcc" type="text" value={confirmAccountNumber} onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter account number" className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
          {errors['confirmAccountNumber'] && <p className="text-xs text-red-600 mt-0.5">{errors['confirmAccountNumber']}</p>}
        </div>

        <div>
          <label htmlFor="ifscCode" className="text-xs font-medium text-muted-foreground block mb-1">IFSC code</label>
          <input id="ifscCode" type="text" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))} placeholder="ABCD0123456" className="w-full rounded-md border px-3 py-2 text-sm bg-background" />
          {errors['ifsc'] && <p className="text-xs text-red-600 mt-0.5">{errors['ifsc']}</p>}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Account type</label>
          <div className="flex gap-4">
            {(["Savings", "Current"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="accountType" value={t} checked={accountType === t} onChange={() => setAccountType(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t">
        <button type="button" onClick={() => { setBank(BANKS[0]!); setAccountNumber(""); setConfirmAccountNumber(""); setIfsc(""); setErrors({}); }} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
          Set up later
        </button>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
          Submit mandate
        </button>
      </div>
    </form>
  );
}
