import { useState, useRef, useEffect, ChangeEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface OTPVerificationStepProps {
  maskedTarget?: string;
  length?: number;
  onVerify?: (otp: string) => Promise<boolean>;
  className?: string;
}

export function OTPVerificationStep({ maskedTarget = "XXXX XXX 5678", length = 6, onVerify, className }: OTPVerificationStepProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const [timer, setTimer] = useState(30);
  const [resendReady, setResendReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
    setResendReady(true);
    return undefined;
  }, [timer]);

  const handleResend = () => {
    setTimer(30);
    setResendReady(false);
    setDigits(Array(length).fill(""));
    setVerified(false);
    setError("");
    inputRefs.current[0]?.focus();
  };

  const handleChange = (i: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const nextDigits = [...digits];
    nextDigits[i] = value.slice(-1);
    setDigits(nextDigits);
    setError("");
    if (value && i < length - 1) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const nextDigits = [...digits];
        nextDigits[i] = "";
        setDigits(nextDigits);
      } else if (i > 0) {
        inputRefs.current[i - 1]?.focus();
        const nextDigits = [...digits];
        nextDigits[i - 1] = "";
        setDigits(nextDigits);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length - startIndex);
    if (!pasted) return;
    const nextDigits = [...digits];
    for (let j = 0; j < pasted.length && startIndex + j < length; j++) {
      nextDigits[startIndex + j] = pasted[j]!;
    }
    setDigits(nextDigits);
  };

  const handleVerify = async () => {
    const otp = digits.join("");
    if (otp.length < length) return;
    setVerifying(true);
    setError("");
    try {
      const ok = onVerify ? await onVerify(otp) : true;
      if (ok) setVerified(true);
      else setError("Invalid OTP. Please try again.");
    } catch {
      setError("Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const allFilled = digits.every((d) => d.length === 1);

  return (
    <div className={cn("panel", className)}>
      <h3 className="text-sm font-semibold tracking-tight mb-1">Verify OTP</h3>
      <p className="text-xs text-muted-foreground mb-4">Sent to your registered mobile ({maskedTarget})</p>

      <div className="flex gap-2 mb-4 justify-center">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(e, i)}
            disabled={verified}
            className={cn(
              "w-10 h-12 rounded-lg border-2 text-center text-xl font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
              error ? "border-red-500 bg-red-50" : "border-border bg-background hover:border-muted-foreground/50"
            )}
          />
        ))}
      </div>

      {error && <p className="text-xs text-red-600 text-center mb-2">{error}</p>}

      {verified && (
        <div className="flex items-center justify-center gap-2 text-green-600 text-sm font-medium mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
          Verified successfully
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {timer > 0 ? `Resend in ${timer}s` : (
            <button onClick={handleResend} className="underline hover:text-foreground">Resend OTP</button>
          )}
        </div>
        <button
          onClick={handleVerify}
          disabled={!allFilled || verified || verifying}
          className={cn("rounded-md px-5 py-2 text-sm font-medium transition-colors", allFilled && !verified ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}
        >
          {verifying ? "Verifying..." : "Verify"}
        </button>
      </div>
    </div>
  );
}
