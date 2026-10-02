import { Pill } from "@/components/status";

/**
 * The policy engine's rule results (recommendations.risk_factors) in plain words, for the
 * officer. Before this the card printed the raw rule objects, and a file referred for, say,
 * FOIR read as if its 720 score was the problem.
 */

type RuleResult = {
  rule_id?: string;
  rule_name?: string;
  result?: string; // PASS / FAIL / SKIPPED / FLAG / INFO
  severity?: string | null; // REJECT / MAYBE when it fails
  actual?: number | string | null;
  threshold?: number | string | null;
  reason?: string;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

// What each failure means, said the way an officer would say it
const WHY: Record<string, (a: number | null, t: number | null) => string> = {
  "HF-AGE-MIN": (a, t) => `Applicant is ${a} years old; the minimum is ${t}.`,
  "HF-AGE-MAX": (a, t) => `Applicant would be ${a} when the loan ends; the limit is ${t}.`,
  "KYC-NAME": (a, t) => `Names on the documents match ${a ?? "?"}%; at least ${t}% is needed.`,
  "BUR-SCORE-MIN": (a, t) => `Bureau score ${a} is below the ${t} minimum.`,
  "BUR-DPD-12M": (a) => `Paid late in the last 12 months (worst: ${a} days).`,
  "BUR-DPD-60": (a) => `Has been 60+ days late on a loan (worst: ${a} days).`,
  "BUR-WRITEOFF": (a) => `${a} loan${a === 1 ? "" : "s"} written off in the last 5 years.`,
  "BUR-SETTLED": (a) => `${a} loan${a === 1 ? "" : "s"} settled for less in the last 5 years.`,
  "BUR-ACTIVE": (a, t) => `${a} loans running already; more than ${t} needs a closer look.`,
  "BUR-ENQUIRY": (a, t) => `${a} credit enquiries in 90 days; more than ${t} suggests the customer is shopping for credit.`,
  "INC-FOIR": (a, t) => `EMIs would take ${a}% of income, including this loan; the limit is ${t}%.`,
  "INC-VARIANCE": (a, t) => `Income sources differ by ${a}%; up to ${t}% is accepted.`,
  "BS-AMB": (a, t) => `Average bank balance ₹${a?.toLocaleString("en-IN")} is below ₹${t?.toLocaleString("en-IN")}.`,
  "BS-BOUNCE": (a, t) => `${a} bounced payments on the bank statement; up to ${t} accepted.`,
  "BS-SALARY-REG": () => "Salary did not arrive every month on the bank statement.",
  "COL-LTV": (a, t) => `Loan is ${a}% of the car's price; the limit is ${t}%.`,
  MISSING_DATA: () => "Neither bureau has a record of this customer, so the bureau checks could not run.",
};

function explain(f: RuleResult): string {
  if (f.reason) return f.reason;
  const why = f.rule_id ? WHY[f.rule_id] : undefined;
  if (why) return why(num(f.actual), num(f.threshold));
  return `${f.rule_name ?? f.rule_id}: ${f.actual ?? "?"} against a limit of ${f.threshold ?? "?"}.`;
}

export function EngineReasons({
  factors,
  recommendation,
  score,
}: {
  factors: unknown;
  recommendation: "APPROVE" | "MAYBE" | "REJECT";
  score: number | null;
}) {
  const all: RuleResult[] = Array.isArray(factors)
    ? (factors as unknown[]).filter((f): f is RuleResult => typeof f === "object" && f !== null)
    : [];
  if (all.length === 0) return null;

  const fails = all.filter((f) => f.result === "FAIL" && f.severity === "REJECT");
  const reviews = all.filter((f) => (f.result === "FAIL" && f.severity !== "REJECT") || f.result === "FLAG");
  const notes = all.filter((f) => f.result === "INFO");
  const skipped = all.filter((f) => f.result === "SKIPPED");
  const passed = all.filter((f) => f.result === "PASS").length;
  const scorePassed = all.some((f) => f.rule_id === "BUR-SCORE-MIN" && f.result === "PASS");
  const scoreIsAReason = [...fails, ...reviews].some((f) => f.rule_id === "BUR-SCORE-MIN");

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">
        {recommendation === "APPROVE"
          ? "No rule failed."
          : recommendation === "REJECT"
            ? `Declined: ${fails.length} rule${fails.length === 1 ? "" : "s"} failed.`
            : `Sent for a closer look: ${reviews.length} rule${reviews.length === 1 ? " needs" : "s need"} a person.`}
      </p>
      {fails.length + reviews.length > 0 && (
        <ul className="space-y-1">
          {fails.map((f, n) => (
            <li key={`f${n}`} className="flex items-start gap-2">
              <Pill tone="destructive">Fails</Pill>
              <span>{explain(f)}</span>
            </li>
          ))}
          {reviews.map((f, n) => (
            <li key={`r${n}`} className="flex items-start gap-2">
              <Pill tone="warning">Check</Pill>
              <span>{explain(f)}</span>
            </li>
          ))}
        </ul>
      )}
      {recommendation !== "APPROVE" && scorePassed && !scoreIsAReason && score !== null && (
        <p className="text-muted-foreground">
          The bureau score ({score}) passed. It is not why this file was{" "}
          {recommendation === "REJECT" ? "declined" : "referred"}; the score sets the rate band only.
        </p>
      )}
      {notes.map((f, n) => (
        <p key={`i${n}`} className="text-muted-foreground">
          {explain(f)}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        {passed} rule{passed === 1 ? "" : "s"} passed
        {skipped.length > 0 &&
          ` · ${skipped.length} could not run (${skipped
            .map((f) => f.rule_name ?? f.rule_id)
            .slice(0, 4)
            .join(", ")}${skipped.length > 4 ? ", …" : ""})`}
      </p>
    </div>
  );
}
