/**
 * Runs every scripts/test-cases/TC-*.json through the policy rule engine and checks
 * the decision against `expected.policyDecision`. Model expectations are produced by
 * build-test-cases.py and are only echoed here.
 *
 * Run: node --experimental-strip-types scripts/run-test-cases.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePolicy, type PolicyInput } from "../src/lib/policy-rule-engine.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "test-cases");
const files = readdirSync(dir).filter((f) => f.startsWith("TC-") && f.endsWith(".json")).sort();

let pass = 0;
const failures: string[] = [];

for (const file of files) {
  const tc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const f = tc.features;
  const input: PolicyInput = {
    age: f.age,
    ageAtMaturity: f.age + f.tenureMonths / 12,
    bureauScore: f.bureauScore,
    foir: f.foirPercent,
    ltvOnExShowroom: f.ltvPercent * 1.12, // on-road ~ 12% over ex-showroom
    hasSevereDPD: f.dpd90 > 0 || f.dpdWriteOff === 1,
    hasRecentDPD: f.dpd30 > 0 || f.dpd60 > 0,
    bounces: f.bounceCount,
    salaryMonthsRegular: f.salaryRegularity,
    employerVerified: tc.context?.employerVerified ?? true,
    govtEmployee: f.govtEmployee === 1,
    employmentYears: f.employmentYears,
    freeIncomeRatio: f.freeIncomeRatio,
    ccServicingPattern: f.ccServicingPattern,
    tenureMonths: f.tenureMonths,
    onRoadPrice: tc.context?.onRoadPrice ?? 900000,
    ltvOnRoad: f.ltvPercent,
    incomeVerified: tc.context?.incomeVerified ?? true,
  };
  const r = evaluatePolicy(input);
  const ok = r.decision === tc.expected.policyDecision;
  if (ok) pass++;
  else failures.push(`${tc.id} ${tc.title}: expected ${tc.expected.policyDecision}, got ${r.decision} [${[...r.hardFailures, ...r.softFailures].join(", ")}]`);
  console.log(
    `${ok ? "ok  " : "FAIL"} ${tc.id}  policy=${r.decision.padEnd(7)} model=${tc.expected.modelGrade} p=${tc.expected.modelBadProbability.toFixed(4)}  ${tc.title}`
  );
}

console.log(`\n${pass}/${files.length} policy expectations matched`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exitCode = 1;
}
