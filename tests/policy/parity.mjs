// Parity check (backlog FD4.4): every saved scenario through today's browser
// engine (src/lib/policy-rule-engine.ts, the 2026.08 rule set the site runs on)
// and through the new engine (policy/credit-rules-2026.09.json, the Zen document
// the Lambda loads), with every difference listed.
//
// Differences are expected: 2026.09 carries decisions D1-D7. The point is that
// nobody switches the engine on without seeing, case by case, what changes.
//
// Run: node tests/policy/parity.mjs           (prints the report)
//      node tests/policy/parity.mjs --write   (also writes docs/parity-2026-09.md)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZenEngine } from "@gorules/zen-engine";

import { evaluatePolicy, POLICY_RULES } from "../../src/lib/policy-rule-engine.ts";
import { factsFromScenario } from "./unified-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engine = new ZenEngine();
const decision = engine.createDecision(readFileSync(join(ROOT, "policy", "credit-rules-2026.09.json")));

// The browser engine takes a narrower set of facts than the new one, and reads
// some of them differently. This is the same mapping the screens use today.
function browserInput(facts) {
  return {
    age: facts.age,
    ageAtMaturity: facts.ageAtMaturity,
    bureauScore: facts.bureauScore,
    foir: facts.foir,
    ltvOnExShowroom: facts.ltvOnExShowroom,
    ltvOnRoad: facts.ltvOnRoad,
    hasSevereDPD: facts.dpd90OrWriteoff12m,
    hasRecentDPD: facts.anyDpd6m,
    bounces: facts.bounces6m,
    salaryMonthsRegular: facts.salaryMonthsRegular,
    employerVerified: facts.employerVerified,
    govtEmployee: facts.govtEmployee,
    employmentYears: facts.employmentYears,
    freeIncomeRatio: facts.freeIncomeRatio,
    ccServicingPattern: facts.ccServicingPattern,
    tenureMonths: facts.tenureMonths,
    onRoadPrice: facts.onRoadPrice,
    incomeVerified: facts.incomeVerified,
  };
}

const sorted = (xs) => [...(xs ?? [])].sort();
const shape = (r) => ({ decision: r.decision, hard: sorted(r.hard), soft: sorted(r.soft), score: r.score });

async function newEngine(facts) {
  const { result } = await decision.evaluate(facts);
  return shape(result);
}

// Today's engine reports a rule by its name, the new one by its id. Same rules,
// so they are compared by id.
const idByName = new Map(POLICY_RULES.map((r) => [r.name, r.id]));

// Rules 2026.09 renamed, and the two bureau rules it merged into one (D5: a
// single under-700 rule). Without this, a rename would read as a policy change.
const RENAMED = {
  NO_SEVERE_DPD: "DPD_SEVERE",
  LOW_BOUNCES: "BOUNCES",
  GOVT_EMPLOYEE_CHECK: "GOVT_SERVICE_MIN",
  LTV_100_SALARIED: "LTV_ON_ROAD",
  BUREAU_GOOD: "BUREAU_BAND_700",
  BUREAU_RECALIBRATED: "BUREAU_BAND_700",
};
const asIds = (xs) => [...new Set((xs ?? []).map((x) => {
  const id = idByName.get(x) ?? x;
  return RENAMED[id] ?? id;
}))];

function todaysEngine(facts) {
  const r = evaluatePolicy(browserInput(facts));
  // The browser engine says approve / review / decline in its own words.
  const map = { APPROVE: "approve", REVIEW: "review", DECLINE: "decline" };
  const d = map[String(r.decision).toUpperCase()] ?? String(r.decision).toLowerCase();
  return shape({ decision: d, hard: asIds(r.hardFailures), soft: asIds(r.softFailures), score: r.score });
}

const dir = join(ROOT, "scripts", "test-cases");
const files = readdirSync(dir).filter((f) => /^TC-.*\.json$/.test(f)).sort();

const rows = [];
for (const file of files) {
  const tc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const facts = factsFromScenario(tc);
  const before = todaysEngine(facts);
  const after = await newEngine(facts);
  const gained = after.hard.concat(after.soft).filter((x) => !before.hard.includes(x) && !before.soft.includes(x));
  const dropped = before.hard.concat(before.soft).filter((x) => !after.hard.includes(x) && !after.soft.includes(x));
  rows.push({ id: tc.id, title: tc.title, before, after, gained, dropped });
}

const flipped = rows.filter((r) => r.before.decision !== r.after.decision);
const sameCall = rows.filter((r) => r.before.decision === r.after.decision);
const sameCallDifferentReasons = sameCall.filter((r) => r.gained.length || r.dropped.length);

const dir3 = (a, b) => `${a} → ${b}`;
const counts = {};
for (const r of flipped) counts[dir3(r.before.decision, r.after.decision)] = (counts[dir3(r.before.decision, r.after.decision)] ?? 0) + 1;

console.log(`Parity: ${rows.length} saved scenarios through today's engine and the new one\n`);
console.log(`  same decision:      ${sameCall.length}`);
console.log(`  different decision: ${flipped.length}`);
for (const [k, n] of Object.entries(counts).sort()) console.log(`     ${k}: ${n}`);
console.log(`  same decision, different reasons: ${sameCallDifferentReasons.length}\n`);

for (const r of flipped) {
  console.log(`  ${r.id}  ${dir3(r.before.decision, r.after.decision)}  ${r.title}`);
  if (r.gained.length) console.log(`      now fails: ${r.gained.join(", ")}`);
  if (r.dropped.length) console.log(`      no longer fails: ${r.dropped.join(", ")}`);
}

if (sameCallDifferentReasons.length) {
  console.log("");
  console.log("  Same decision, different reasons:");
  for (const r of sameCallDifferentReasons) {
    console.log(`  ${r.id}  ${r.before.decision}  ${r.title}`);
    if (r.gained.length) console.log(`      now fails: ${r.gained.join(", ")}`);
    if (r.dropped.length) console.log(`      no longer fails: ${r.dropped.join(", ")}`);
  }
}

// Nothing here can fail: a difference is the answer, not an error. A scenario
// that cannot be read at all is a real failure.
const broken = rows.filter((r) => !r.before.decision || !r.after.decision);
if (broken.length) {
  console.log(`\n${broken.length} scenario(s) could not be evaluated: ${broken.map((r) => r.id).join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--write")) {
  const when = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const table = (list) => [
    "| Case | Today | Under 2026.09 | What changed |",
    "|---|---|---|---|",
    ...list.map((r) => `| ${r.id} — ${r.title} | ${r.before.decision} | ${r.after.decision} | ${
      [r.gained.length ? `now fails ${r.gained.join(", ")}` : "", r.dropped.length ? `no longer fails ${r.dropped.join(", ")}` : ""]
        .filter(Boolean).join("; ") || "same rules, different band"
    } |`),
  ].join("\n");

  const md = `# Parity check — today's engine against 2026.09 (FD4.4)

Written by \`node tests/policy/parity.mjs --write\` on ${when}.

Every saved scenario in \`scripts/test-cases/\` is run through the engine the site
uses today (\`src/lib/policy-rule-engine.ts\`, the 2026.08 rules) and through the
rules document the Lambda loads (\`policy/credit-rules-2026.09.json\`). Differences
are expected: 2026.09 carries decisions D1–D7. This is the record of what they do.

- Scenarios: **${rows.length}**
- Same decision: **${sameCall.length}**
- Different decision: **${flipped.length}**${Object.entries(counts).sort().map(([k, n]) => `\n  - ${k}: ${n}`).join("")}
- Same decision, different reasons: **${sameCallDifferentReasons.length}**

## Decisions that change

${flipped.length ? table(flipped) : "None."}

## Same decision, different reasons

${sameCallDifferentReasons.length ? table(sameCallDifferentReasons) : "None."}
`;
  writeFileSync(join(ROOT, "docs", "parity-2026-09.md"), md);
  console.log("\nWritten: docs/parity-2026-09.md");
}
