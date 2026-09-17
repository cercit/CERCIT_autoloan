// Checks policy/credit-rules-2026.09.json (Zen) against the hand-written reference,
// and lists every existing scenario whose outcome changes from today.
// Run: node tests/policy/run-unified.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZenEngine } from "@gorules/zen-engine";
import { evaluateUnified, factsFromScenario, RULES_2026_09 } from "./unified-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const model = readFileSync(join(ROOT, "policy", "credit-rules-2026.09.json"));
const engine = new ZenEngine();
const decision = engine.createDecision(model);

const same = (a, b) =>
  a.decision === b.decision && a.score === b.score &&
  JSON.stringify(a.hard) === JSON.stringify(b.hard) && JSON.stringify(a.soft) === JSON.stringify(b.soft);

async function zen(facts) {
  const { result } = await decision.evaluate(facts);
  return { decision: result.decision, hard: [...result.hard].sort(), soft: [...result.soft].sort(), score: result.score };
}

let failures = 0;

// 1. Existing scenarios
const dir = join(ROOT, "scripts", "test-cases");
const scenarios = readdirSync(dir).filter((f) => /^TC-.*\.json$/.test(f)).sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
let matched = 0;
const changed = [];
const fixtures = []; // written for the Lambda test with --write-fixtures
for (const tc of scenarios) {
  const facts = factsFromScenario(tc);
  const ref = evaluateUnified(facts);
  fixtures.push({ id: tc.id, input: facts, expected: ref });
  const got = await zen(facts);
  if (same(ref, got)) matched++;
  else { failures++; console.log(`  MISMATCH ${tc.id}`, JSON.stringify({ ref, got })); }
  if (ref.decision !== tc.expected.policyDecision) {
    changed.push(`${tc.id}  ${tc.expected.policyDecision} → ${ref.decision}  [${[...ref.hard, ...ref.soft].join(", ")}]  ${tc.title}`);
  }
}
console.log(`scenarios: ${matched}/${scenarios.length} Zen matches reference`);
console.log(`scenarios whose outcome changes under 2026.09: ${changed.length}`);
for (const c of changed) console.log(`  ${c}`);

// 2. Generated cases around every threshold, including missing reports
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const coin = (p) => rnd() < p;
const fired = new Map();
let genMatched = 0;
const N = 3000;
for (let i = 0; i < N; i++) {
  const hasBureau = coin(0.85);
  const hasBank = coin(0.85);
  const hasIncome = coin(0.85);
  const facts = {
    age: pick([19, 20, 21, 22, 40, 58]),
    ageAtMaturity: pick([45, 64.9, 65, 65.1, 70]),
    govtEmployee: coin(0.3),
    employmentYears: pick([0.5, 2.9, 3, 3.1, 12]),
    employerVerified: coin(0.8),
    tenureMonths: pick([36, 60, 84, 85, 96, 120, 121]),
    onRoadPrice: pick([600000, 1199999, 1200000, 1800000]),
    hasBureau,
    bureauScore: hasBureau ? pick([600, 649, 650, 699, 700, 780]) : null,
    dpd60Ever: hasBureau ? coin(0.08) : null,
    dpd90OrWriteoff12m: hasBureau ? coin(0.08) : null,
    anyDpd6m: hasBureau ? coin(0.1) : null,
    minorDpdMonths7to12: hasBureau ? coin(0.15) : null,
    writeoffCount5y: hasBureau ? pick([0, 0, 0, 1]) : null,
    settledCount5y: hasBureau ? pick([0, 0, 0, 1]) : null,
    enquiries90d: hasBureau ? pick([0, 2, 3, 4, 7]) : null,
    activeAccounts: hasBureau ? pick([1, 3, 4, 6]) : null,
    ccServicingPattern: hasBureau ? pick([0, 1, 2, 3]) : null,
    foir: pick([20, 39.9, 40, 40.1, 49.9, 50, 50.1, 62]),
    freeIncomeRatio: pick([5, 14.9, 15, 15.1, 40]),
    hasIncome,
    incomeVariancePct: hasIncome ? pick([0, 5, 5.1, 12]) : null,
    nameMatchScore: hasIncome ? pick([90, 97.9, 98, 100]) : null,
    incomeVerified: coin(0.7),
    hasBank,
    bounces6m: hasBank ? pick([0, 0, 1, 2, 4]) : null,
    salaryMonthsRegular: hasBank ? pick([3, 4, 5, 6]) : null,
    ambVsEmiPct: hasBank ? pick([10, 19.9, 20, 60]) : null,
    ltvOnExShowroom: pick([70, 119.9, 120, 120.1, 135]),
    ltvOnRoad: pick([60, 90, 90.1, 99.9, 100, 100.1]),
  };
  const ref = evaluateUnified(facts);
  if (i < 500) fixtures.push({ id: `GEN-${String(i + 1).padStart(4, "0")}`, input: facts, expected: ref });
  let got;
  try {
    got = await zen(facts);
  } catch (e) {
    failures++;
    if (failures < 5) console.log(`  ENGINE ERROR`, e.message, JSON.stringify(facts));
    continue;
  }
  if (same(ref, got)) genMatched++;
  else { failures++; if (failures < 5) console.log(`  MISMATCH generated`, JSON.stringify({ facts, ref, got })); }
  for (const r of [...ref.hard, ...ref.soft]) fired.set(r, (fired.get(r) ?? 0) + 1);
}
const allIds = [...new Set(RULES_2026_09.map((r) => r[0]))];
const unfired = allIds.filter((id) => !fired.has(id));
console.log(`generated: ${genMatched}/${N} Zen matches reference; ${allIds.length - unfired.length}/${allIds.length} rules triggered`);
if (unfired.length) { failures++; console.log(`  rules never triggered: ${unfired.join(", ")}`); }

if (process.argv.includes("--write-fixtures")) {
  writeFileSync(join(ROOT, "tests", "policy", "fixtures-2026.09.json"), JSON.stringify(fixtures) + "\n");
  console.log(`wrote tests/policy/fixtures-2026.09.json: ${fixtures.length} cases`);
}

if (failures) {
  console.log(`\n${failures} policy rule check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nUnified rules 2026.09: Zen and reference agree");
}
