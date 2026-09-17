// Generates zen-policy.json (GoRules JDM): a "collect" decision table listing every
// failed rule, then an expression node that turns the failures into a decision.
import { writeFileSync } from "node:fs";

const cols = [
  ["age", "Age"], ["ageAtMaturity", "Age at maturity"], ["bureauScore", "Bureau score"],
  ["foir", "FOIR %"], ["freeIncomeRatio", "Free income %"], ["ltvOnExShowroom", "LTV % ex-showroom"],
  ["ltvOnRoad", "LTV % on-road"], ["hasSevereDPD", "Severe DPD"], ["hasRecentDPD", "Recent DPD"],
  ["bounces", "Bounces"], ["salaryMonthsRegular", "Regular salary months"], ["employerVerified", "Employer verified"],
  ["govtEmployee", "Govt employee"], ["employmentYears", "Service years"], ["ccServicingPattern", "Card servicing"],
  ["tenureMonths", "Tenure months"], ["onRoadPrice", "On-road price"], ["incomeVerified", "Income verified"],
];
const inputs = [
  ...cols.map(([field, name]) => ({ id: `in_${field}`, name, field })),
  { id: "in_extra", name: "Other condition" }, // no field: cell holds a full expression
];
const outputs = [
  { id: "out_rule", name: "Rule", field: "rule" },
  { id: "out_severity", name: "Severity", field: "severity" },
  { id: "out_name", name: "Name", field: "name" },
];

// [ruleId, name, severity, { field: unary test }, extraExpression?]
const rows = [
  ["AGE_MIN", "Age Minimum", "hard", { age: "< 21" }],
  ["AGE_MAX", "Age Maximum", "soft", { ageAtMaturity: "> 65" }],
  ["BUREAU_FLOOR", "Bureau Score Floor", "hard", { bureauScore: "< 650" }],
  ["BUREAU_GOOD", "Good Bureau Score", "soft", { bureauScore: "< 700" }],
  ["FOIR_LIMIT", "FOIR Limit", "hard", { foir: "> 50" }],
  ["FOIR_OPTIMAL", "FOIR Optimal", "soft", { foir: "> 40" }],
  ["LTV_LIMIT", "LTV Limit", "hard", { ltvOnExShowroom: "> 120" }],
  ["NO_SEVERE_DPD", "No Severe DPD", "hard", { hasSevereDPD: "true" }],
  ["NO_RECENT_DPD", "No Recent DPD", "soft", { hasRecentDPD: "true" }],
  ["LOW_BOUNCES", "Low Bounce Rate", "soft", { bounces: "> 0" }],
  ["SALARY_REGULAR", "Salary Regular", "soft", { salaryMonthsRegular: "< 5" }],
  ["EMPLOYER_VERIFIED", "Employer Verified", "soft", { employerVerified: "false" }],
  ["GOVT_EMPLOYEE_CHECK", "Govt Service Minimum", "hard", { govtEmployee: "true", employmentYears: "< 3" }],
  ["FREE_INCOME_FLOOR", "Free Income Floor", "hard", { freeIncomeRatio: "< 15" }],
  ["CC_SERVICING", "Card Servicing", "soft", { ccServicingPattern: "3" }],
  ["BUREAU_RECALIBRATED", "Bureau Band (post Feb-2026)", "soft", { bureauScore: "< 700" }],
  // Tenure: 84 months, or 120 for a govt employee on a car under Rs 12L
  ["TENURE_CAP", "Tenure Cap", "hard", { tenureMonths: "> 84" }, "not (govtEmployee and onRoadPrice < 1200000)"],
  ["TENURE_CAP", "Tenure Cap", "hard", { govtEmployee: "true", onRoadPrice: "< 1200000", tenureMonths: "> 120" }],
  // LTV on-road: over 100 always fails; 90-100 fails without verified income or with FOIR over 50
  ["LTV_100_SALARIED", "LTV 100% On-Road", "hard", { ltvOnRoad: "> 100" }],
  ["LTV_100_SALARIED", "LTV 100% On-Road", "hard", { ltvOnRoad: "(90..100]" }, "incomeVerified == false or foir > 50"],
];

const rules = rows.map(([id, name, severity, cells, extra], i) => {
  const r = { _id: `r${i + 1}` };
  for (const { id: colId, field } of inputs) r[colId] = field ? cells[field] ?? "" : extra ?? "";
  r.out_rule = `'${id}'`;
  r.out_severity = `'${severity}'`;
  r.out_name = `'${name}'`;
  return r;
});

const jdm = {
  contentType: "application/vnd.gorules.decision",
  nodes: [
    { id: "request", type: "inputNode", name: "Application", position: { x: 0, y: 0 } },
    {
      id: "rules",
      type: "decisionTableNode",
      name: "Credit policy 2026.08",
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
          { id: "e1", key: "hard", value: "map(filter(failed, #.severity == 'hard'), #.rule)" },
          { id: "e2", key: "soft", value: "map(filter(failed, #.severity == 'soft'), #.rule)" },
          { id: "e3", key: "decision", value: "len(filter(failed, #.severity == 'hard')) > 0 ? 'decline' : (len(failed) == 0 ? 'approve' : 'review')" },
          { id: "e4", key: "score", value: "max([0, 100 - 25 * len(filter(failed, #.severity == 'hard')) - 10 * len(filter(failed, #.severity == 'soft'))])" },
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

writeFileSync("zen-policy.json", JSON.stringify(jdm, null, 2));
console.log(`zen-policy.json: ${rules.length} table rows for 18 rules`);
