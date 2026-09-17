// Deno runner: can each engine load and evaluate under Deno?
import { Engine } from "npm:json-rules-engine@7.3.1";
import { runAll } from "./jre-rules.mjs";

const cases = JSON.parse(await Deno.readTextFile("fuzz.json"));

const r = await runAll(Engine, cases);
console.log(`jre-deno/generated: ${r.match}/${r.total} match, ${r.msPer.toFixed(3)} ms per evaluation`);

try {
  const { ZenEngine } = await import("npm:@gorules/zen-engine@2.0.2");
  const engine = new ZenEngine();
  const decision = engine.createDecision(await Deno.readFile("zen-policy.json"));
  const { result } = await decision.evaluate(cases[0].input);
  console.log(`zen-deno (native addon): loaded, first case decision=${result.decision} expected=${cases[0].expected.decision}`);
} catch (e) {
  console.log(`zen-deno (native addon): FAILED — ${String(e).split("\n")[0]}`);
}
