// Writes policy/credit-rules-2026.09.json — the unified credit rules as a GoRules
// Zen decision model (decisions D1–D7, docs/design/FD4-rule-definitions.md).
// Run: node scripts/gen-rules-2026-09.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "policy", "credit-rules-2026.09.json");

const columns = [
  ["hasBureau", "Bureau report present"],
  ["hasBank", "Bank data present"],
  ["hasIncome", "Income assessment present"],
  ["age", "Age"],
  ["ageAtMaturity", "Age at maturity"],
  ["govtEmployee", "Govt employee"],
  ["employmentYears", "Service years"],
  ["employerVerified", "Employer verified"],
  ["tenureMonths", "Tenure (months)"],
  ["onRoadPrice", "On-road price"],
  ["bureauScore", "Bureau score"],
  ["minorDpdMonths7to12", "1–30 DPD in months 7–12"],
  ["writeoffCount5y", "Write-offs (5 yrs)"],
  ["settledCount5y", "Settled accounts (5 yrs)"],
  ["enquiries90d", "Enquiries (90 days)"],
  ["activeAccounts", "Active accounts"],
  ["ccServicingPattern", "Card servicing (3 = minimum due)"],
  ["foir", "FOIR %"],
  ["freeIncomeRatio", "Free income %"],
  ["incomeVariancePct", "Income variance %"],
  ["nameMatchScore", "Name match %"],
  ["bounces6m", "Bounces (6 months)"],
  ["salaryMonthsRegular", "Regular salary months (of 6)"],
  ["ambVsEmiPct", "Average balance % of EMI"],
  ["ltvOnExShowroom", "LTV % ex-showroom"],
];

const inputs = [
  ...columns.map(([field, name]) => ({ id: `in_${field}`, name, field })),
  { id: "in_other", name: "Other condition" },
];
const outputs = [
  { id: "out_rule", name: "Rule", field: "rule" },
  { id: "out_severity", name: "Outcome", field: "severity" },
  { id: "out_name", name: "Name", field: "name" },
];

const B = { hasBureau: "true" };
const K = { hasBank: "true" };
const I = { hasIncome: "true" };

// [id, name, severity, cells, other]
const rows = [
  ["AGE_MIN", "Minimum age", "hard", { age: "< 21" }],
  ["AGE_MAX", "Age at maturity", "soft", { ageAtMaturity: "> 65" }],
  ["GOVT_SERVICE_MIN", "Govt service minimum", "hard", { govtEmployee: "true", employmentYears: "< 3" }],
  ["EMPLOYER_VERIFIED", "Employer verified", "soft", { employerVerified: "false" }],
  ["TENURE_CAP", "Tenure cap", "hard", { tenureMonths: "> 84" }, "not (govtEmployee and onRoadPrice < 1200000)"],
  ["TENURE_CAP", "Tenure cap", "hard", { govtEmployee: "true", onRoadPrice: "< 1200000", tenureMonths: "> 120" }],

  ["BUREAU_FLOOR", "Bureau score floor", "hard", { ...B, bureauScore: "< 650" }],
  ["BUREAU_BAND_700", "Bureau band (post Feb-2026)", "soft", { ...B, bureauScore: "< 700" }],
  ["DPD_SEVERE", "Serious payment delays", "hard", { ...B }, "dpd60Ever or dpd90OrWriteoff12m or anyDpd6m"],
  ["DPD_MINOR", "Minor older payment delay", "soft", { ...B, minorDpdMonths7to12: "true" }],
  ["WRITEOFF_5Y", "Write-off in 5 years", "hard", { ...B, writeoffCount5y: "> 0" }],
  ["SETTLED_5Y", "Settled account in 5 years", "hard", { ...B, settledCount5y: "> 0" }],
  ["ENQUIRY_VELOCITY", "Bureau enquiries in 90 days", "soft", { ...B, enquiries90d: "> 3" }],
  ["ACTIVE_ACCOUNTS", "Active credit accounts", "soft", { ...B, activeAccounts: "> 3" }],
  ["CC_SERVICING", "Card paid at minimum due", "soft", { ...B, ccServicingPattern: "3" }],

  ["FOIR_LIMIT", "FOIR above 50%", "soft", { foir: "> 50" }],
  ["FOIR_OPTIMAL", "FOIR above 40%", "soft", { foir: "> 40" }],
  ["FREE_INCOME_FLOOR", "Free income floor", "hard", { freeIncomeRatio: "< 15" }],
  ["INCOME_VARIANCE", "Income sources differ", "soft", { ...I, incomeVariancePct: "> 5" }],
  ["NAME_MATCH", "Name match across documents", "soft", { ...I, nameMatchScore: "< 98" }],

  ["BOUNCES", "Bounces in 6 months", "hard", { ...K, bounces6m: ">= 2" }],
  ["BOUNCES", "Bounces in 6 months", "soft", { ...K, bounces6m: "1" }],
  ["SALARY_REGULAR", "Salary regularity", "soft", { ...K, salaryMonthsRegular: "< 5" }],
  ["MIN_AVG_BALANCE", "Average balance vs EMI", "soft", { ...K, ambVsEmiPct: "< 20" }],

  ["LTV_LIMIT", "LTV on ex-showroom", "hard", { ltvOnExShowroom: "> 120" }],
  ["LTV_ON_ROAD", "LTV on on-road", "hard", {}, "ltvOnRoad > 100 or (ltvOnRoad > 90 and (incomeVerified == false or foir > 50))"],

  ["MISSING_DATA", "Report missing", "soft", {}, "hasBureau == false or hasBank == false or hasIncome == false"],
];

const rules = rows.map(([id, name, severity, cells, other], i) => {
  const r = { _id: `r${String(i + 1).padStart(2, "0")}` };
  for (const { id: col, field } of inputs) r[col] = field ? cells[field] ?? "" : other ?? "";
  r.out_rule = `'${id}'`;
  r.out_severity = `'${severity}'`;
  r.out_name = `'${name}'`;
  return r;
});

const hardOf = "filter(failed, #.severity == 'hard')";
const softOf = "filter(failed, #.severity == 'soft')";

const model = {
  contentType: "application/vnd.gorules.decision",
  nodes: [
    { id: "request", type: "inputNode", name: "Application facts", position: { x: 0, y: 0 } },
    {
      id: "rules",
      type: "decisionTableNode",
      name: "Credit policy 2026.09",
      position: { x: 300, y: 0 },
      content: { hitPolicy: "collect", inputs, outputs, rules, outputPath: "failed", passThrough: true },
    },
    {
      id: "decide",
      type: "expressionNode",
      name: "Decision",
      position: { x: 600, y: 0 },
      content: {
        expressions: [
          { id: "e1", key: "hard", value: `map(${hardOf}, #.rule)` },
          { id: "e2", key: "soft", value: `map(${softOf}, #.rule)` },
          { id: "e3", key: "decision", value: `len(${hardOf}) > 0 ? 'decline' : (len(failed) > 0 ? 'review' : 'approve')` },
          { id: "e4", key: "score", value: `max([0, 100 - 25 * len(${hardOf}) - 10 * len(${softOf})])` },
          { id: "e5", key: "policyVersion", value: "'2026.09'" },
        ],
      },
    },
    { id: "response", type: "outputNode", name: "Result", position: { x: 900, y: 0 } },
  ],
  edges: [
    { id: "e-1", sourceId: "request", targetId: "rules", type: "edge" },
    { id: "e-2", sourceId: "rules", targetId: "decide", type: "edge" },
    { id: "e-3", sourceId: "decide", targetId: "response", type: "edge" },
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n");
const ids = new Set(rows.map((r) => r[0]));
console.log(`wrote policy/credit-rules-2026.09.json: ${ids.size} rules in ${rows.length} rows`);
