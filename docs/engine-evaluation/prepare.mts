// Builds cases.json: the 40 scenarios as fully-defaulted inputs, plus the
// current TypeScript engine's result for each, which is the parity reference.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const { evaluatePolicy, POLICY_RULES } = await import(new URL("../../src/lib/policy-rule-engine.ts", import.meta.url).href);

const dir = join(REPO, "scripts/test-cases");
const files = readdirSync(dir).filter((f) => f.startsWith("TC-") && f.endsWith(".json")).sort();

const nameToId = Object.fromEntries(POLICY_RULES.map((r: any) => [r.name, r.id]));

const cases = files.map((file) => {
  const tc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const f = tc.features;
  // Same mapping as scripts/run-test-cases.ts
  const raw = {
    age: f.age,
    ageAtMaturity: f.age + f.tenureMonths / 12,
    bureauScore: f.bureauScore,
    foir: f.foirPercent,
    ltvOnExShowroom: f.ltvPercent * 1.12,
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
  const ref = evaluatePolicy(raw);

  // Defaults the TS engine applies inline, made explicit so every engine sees identical data.
  const foir = raw.foir ?? 30;
  const input = {
    age: raw.age ?? 99,
    ageAtMaturity: raw.ageAtMaturity ?? 40,
    bureauScore: raw.bureauScore ?? 999,
    foir,
    ltvOnExShowroom: raw.ltvOnExShowroom ?? 70,
    hasSevereDPD: raw.hasSevereDPD === true,
    hasRecentDPD: raw.hasRecentDPD === true,
    bounces: raw.bounces ?? 0,
    salaryMonthsRegular: raw.salaryMonthsRegular ?? 6,
    employerVerified: raw.employerVerified === true,
    govtEmployee: raw.govtEmployee === true,
    employmentYears: raw.employmentYears ?? 0,
    freeIncomeRatio: raw.freeIncomeRatio ?? 100 - foir,
    ccServicingPattern: raw.ccServicingPattern ?? 0,
    tenureMonths: raw.tenureMonths ?? 60,
    onRoadPrice: raw.onRoadPrice ?? 1e12,
    ltvOnRoad: raw.ltvOnRoad ?? 0,
    incomeVerified: raw.incomeVerified === true,
  };

  return {
    id: tc.id,
    title: tc.title,
    input,
    expected: {
      decision: ref.decision,
      hard: ref.hardFailures.map((n: string) => nameToId[n]).sort(),
      soft: ref.softFailures.map((n: string) => nameToId[n]).sort(),
      score: ref.score,
    },
  };
});

writeFileSync("cases.json", JSON.stringify(cases, null, 2));

// Generated cases around every threshold, so all 18 rules are exercised.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const fuzz = Array.from({ length: 2000 }, (_, i) => {
  const input = {
    age: pick([19, 20, 21, 22, 35, 58]),
    ageAtMaturity: pick([40, 64, 65, 65.5, 70]),
    bureauScore: pick([600, 649, 650, 699, 700, 701, 780]),
    foir: pick([20, 39.9, 40, 40.1, 49.9, 50, 50.1, 65]),
    ltvOnExShowroom: pick([70, 100, 119.9, 120, 120.1, 140]),
    hasSevereDPD: rnd() < 0.15,
    hasRecentDPD: rnd() < 0.2,
    bounces: pick([0, 0, 0, 1, 3]),
    salaryMonthsRegular: pick([3, 4, 5, 6]),
    employerVerified: rnd() < 0.8,
    govtEmployee: rnd() < 0.3,
    employmentYears: pick([0.5, 2.9, 3, 3.1, 10]),
    freeIncomeRatio: pick([5, 14.9, 15, 15.1, 40]),
    ccServicingPattern: pick([0, 1, 2, 3]),
    tenureMonths: pick([36, 60, 84, 85, 96, 120, 121]),
    onRoadPrice: pick([600000, 1199999, 1200000, 1500000]),
    ltvOnRoad: pick([0, 80, 90, 90.1, 99.9, 100, 100.1]),
    incomeVerified: rnd() < 0.7,
  };
  const ref = evaluatePolicy(input);
  return {
    id: `FZ-${String(i + 1).padStart(4, "0")}`,
    input,
    expected: {
      decision: ref.decision,
      hard: ref.hardFailures.map((n: string) => nameToId[n]).sort(),
      soft: ref.softFailures.map((n: string) => nameToId[n]).sort(),
      score: ref.score,
    },
  };
});
writeFileSync("fuzz.json", JSON.stringify(fuzz));
const fuzzRules = new Set(fuzz.flatMap((c) => [...c.expected.hard, ...c.expected.soft]));
console.log(`fuzz.json: ${fuzz.length} cases, ${fuzzRules.size}/18 rules exercised`);
const withFails = cases.filter((c) => c.expected.hard.length + c.expected.soft.length > 0).length;
console.log(`cases.json: ${cases.length} cases, ${withFails} with at least one rule failing`);
