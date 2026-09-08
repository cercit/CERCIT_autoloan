import { cn } from "@/lib/utils";
import { inr, pct } from "@/lib/format";

export interface CAMPreviewProps {
  data: {
    applicationId: string;
    applicantName: string;
    applicantAge: number;
    pan: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleSegment: string;
    exShowroom: number;
    onRoad: number;
    loanAmount: number;
    tenureMonths: number;
    ratePercent: number;
    emi: number;
    bureauScore: number;
    bureauName: string;
    foirPercent: number;
    ltvPercent: number;
    policyDecision: "approve" | "review" | "decline";
    policyFailedRules: string[];
    recommendation: string;
    generatedAt: string;
  };
  className?: string;
}

export function CAMPreview({ data, className }: CAMPreviewProps) {
  const decisionColor = data.policyDecision === "approve" ? "bg-green-600 text-green-50" : data.policyDecision === "review" ? "bg-amber-500 text-amber-950" : "bg-red-600 text-red-50";
  const decisionLabel = data.policyDecision === "approve" ? "APPROVED" : data.policyDecision === "review" ? "REVIEW" : "DECLINED";

  return (
    <div className={cn("panel bg-white text-foreground", className)}>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .panel { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
      `}</style>

      <header className="border-b-2 border-foreground pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight uppercase">Credit Appraisal Memo</h1>
            <p className="text-sm text-muted-foreground mt-1">cercit — AI Credit Underwriter System</p>
          </div>
          <span className={cn("rounded-md px-3 py-1.5 text-sm font-extrabold tracking-wider", decisionColor)}>
            {decisionLabel}
          </span>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span>App ID: <strong className="text-foreground">{data.applicationId}</strong></span>
          <span>Generated: <strong className="text-foreground">{new Date(data.generatedAt).toLocaleString("en-IN")}</strong></span>
        </div>
      </header>

      <section className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2">Applicant Details</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Name" value={data.applicantName} />
          <Row label="Age" value={`${data.applicantAge} years`} />
          <Row label="PAN" value={data.pan} />
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2">Vehicle & Loan</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Make / Model" value={`${data.vehicleMake} ${data.vehicleModel}`} />
          <Row label="Segment" value={data.vehicleSegment} />
          <Row label="Ex-Showroom" value={inr(data.exShowroom)} />
          <Row label="On-Road" value={inr(data.onRoad)} />
          <Row label="Loan Amount" value={inr(data.loanAmount)} />
          <Row label="Tenure" value={`${data.tenureMonths} months`} />
          <Row label="Rate" value={`${data.ratePercent}%`} />
          <Row label="EMI" value={inr(data.emi)} />
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2">Credit Assessment</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Bureau" value={`${data.bureauName} — ${data.bureauScore}`} />
          <Row label="FOIR" value={`${data.foirPercent.toFixed(1)}%`} />
          <Row label="LTV" value={`${pct(data.ltvPercent)}`} />
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2">Policy Evaluation</h2>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium mb-1">Decision: <span className={cn("font-extrabold", decisionColor.replace("bg-", "text-").replace("text-", "").split(" ")[0])}>{decisionLabel}</span></p>
          <p className="text-xs text-muted-foreground">Score: {data.policyDecision === "approve" ? 100 : data.policyDecision === "review" ? 50 : 0}/100</p>
          {data.policyFailedRules.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 space-y-0.5">
              {data.policyFailedRules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-4 rounded-md border-2 border-green-500 bg-green-50 p-3">
        <h2 className="text-sm font-bold uppercase tracking-wide mb-2 text-green-800">Recommendation</h2>
        <p className="text-sm text-green-900 leading-relaxed">{data.recommendation}</p>
      </section>

      <footer className="border-t pt-3 text-[10px] text-muted-foreground flex justify-between no-print">
        <span>Generated by cercit — AI Credit Appraisal System</span>
        <span>CONFIDENTIAL — For internal use only</span>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-0.5 border-b border-border/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
