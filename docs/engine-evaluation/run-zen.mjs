// Runs cases.json + fuzz.json through GoRules Zen and compares with the reference engine.
import { readFileSync } from "node:fs";
import { ZenEngine } from "@gorules/zen-engine";

const content = readFileSync("zen-policy.json");
const engine = new ZenEngine();
const decision = engine.createDecision(content);

const sets = { scenarios: JSON.parse(readFileSync("cases.json", "utf8")), generated: JSON.parse(readFileSync("fuzz.json", "utf8")) };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [label, cases] of Object.entries(sets)) {
  let match = 0;
  const diffs = [];
  const t0 = performance.now();
  for (const c of cases) {
    const { result } = await decision.evaluate(c.input);
    const got = { decision: result.decision, hard: [...new Set(result.hard)].sort(), soft: [...new Set(result.soft)].sort(), score: result.score };
    const exp = c.expected;
    if (got.decision === exp.decision && eq(got.hard, exp.hard) && eq(got.soft, exp.soft) && got.score === exp.score) match++;
    else if (diffs.length < 5) diffs.push({ id: c.id, exp, got });
  }
  const ms = performance.now() - t0;
  console.log(`zen/${label}: ${match}/${cases.length} match, ${(ms / cases.length).toFixed(3)} ms per evaluation`);
  for (const d of diffs) console.log("  DIFF", JSON.stringify(d));
}
engine.dispose?.();
