// The 18 rules in json-rules-engine format. Shared by the Node and Deno runners.
const f = (fact, operator, value) => ({ fact, operator, value });
const rule = (id, name, severity, conditions) => ({
  name: id,
  conditions,
  event: { type: id, params: { severity, name } },
});

export const RULES = [
  rule("AGE_MIN", "Age Minimum", "hard", { all: [f("age", "lessThan", 21)] }),
  rule("AGE_MAX", "Age Maximum", "soft", { all: [f("ageAtMaturity", "greaterThan", 65)] }),
  rule("BUREAU_FLOOR", "Bureau Score Floor", "hard", { all: [f("bureauScore", "lessThan", 650)] }),
  rule("BUREAU_GOOD", "Good Bureau Score", "soft", { all: [f("bureauScore", "lessThan", 700)] }),
  rule("FOIR_LIMIT", "FOIR Limit", "hard", { all: [f("foir", "greaterThan", 50)] }),
  rule("FOIR_OPTIMAL", "FOIR Optimal", "soft", { all: [f("foir", "greaterThan", 40)] }),
  rule("LTV_LIMIT", "LTV Limit", "hard", { all: [f("ltvOnExShowroom", "greaterThan", 120)] }),
  rule("NO_SEVERE_DPD", "No Severe DPD", "hard", { all: [f("hasSevereDPD", "equal", true)] }),
  rule("NO_RECENT_DPD", "No Recent DPD", "soft", { all: [f("hasRecentDPD", "equal", true)] }),
  rule("LOW_BOUNCES", "Low Bounce Rate", "soft", { all: [f("bounces", "greaterThan", 0)] }),
  rule("SALARY_REGULAR", "Salary Regular", "soft", { all: [f("salaryMonthsRegular", "lessThan", 5)] }),
  rule("EMPLOYER_VERIFIED", "Employer Verified", "soft", { all: [f("employerVerified", "equal", false)] }),
  rule("GOVT_EMPLOYEE_CHECK", "Govt Service Minimum", "hard", {
    all: [f("govtEmployee", "equal", true), f("employmentYears", "lessThan", 3)],
  }),
  rule("FREE_INCOME_FLOOR", "Free Income Floor", "hard", { all: [f("freeIncomeRatio", "lessThan", 15)] }),
  rule("CC_SERVICING", "Card Servicing", "soft", { all: [f("ccServicingPattern", "equal", 3)] }),
  rule("BUREAU_RECALIBRATED", "Bureau Band (post Feb-2026)", "soft", { all: [f("bureauScore", "lessThan", 700)] }),
  rule("TENURE_CAP", "Tenure Cap", "hard", {
    any: [
      {
        all: [
          f("tenureMonths", "greaterThan", 84),
          { any: [f("govtEmployee", "equal", false), f("onRoadPrice", "greaterThanInclusive", 1200000)] },
        ],
      },
      {
        all: [
          f("govtEmployee", "equal", true),
          f("onRoadPrice", "lessThan", 1200000),
          f("tenureMonths", "greaterThan", 120),
        ],
      },
    ],
  }),
  rule("LTV_100_SALARIED", "LTV 100% On-Road", "hard", {
    any: [
      f("ltvOnRoad", "greaterThan", 100),
      {
        all: [
          f("ltvOnRoad", "greaterThan", 90),
          f("ltvOnRoad", "lessThanInclusive", 100),
          { any: [f("incomeVerified", "equal", false), f("foir", "greaterThan", 50)] },
        ],
      },
    ],
  }),
];

// json-rules-engine only reports which rules fired; the decision step is our own code.
export function decide(events) {
  const hard = [...new Set(events.filter((e) => e.params.severity === "hard").map((e) => e.type))].sort();
  const soft = [...new Set(events.filter((e) => e.params.severity === "soft").map((e) => e.type))].sort();
  const decision = hard.length > 0 ? "decline" : soft.length === 0 ? "approve" : "review";
  const score = Math.max(0, 100 - 25 * hard.length - 10 * soft.length);
  return { decision, hard, soft, score };
}

export async function runAll(Engine, cases) {
  const engine = new Engine(RULES, { allowUndefinedFacts: false });
  let match = 0;
  const diffs = [];
  const t0 = performance.now();
  for (const c of cases) {
    const { events } = await engine.run({ ...c.input });
    const got = decide(events);
    const e = c.expected;
    const same = got.decision === e.decision && JSON.stringify(got.hard) === JSON.stringify(e.hard) &&
      JSON.stringify(got.soft) === JSON.stringify(e.soft) && got.score === e.score;
    if (same) match++;
    else if (diffs.length < 5) diffs.push({ id: c.id, exp: e, got });
  }
  return { match, total: cases.length, msPer: (performance.now() - t0) / cases.length, diffs };
}
