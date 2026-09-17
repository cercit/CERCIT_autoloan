// Node runner for json-rules-engine.
import { readFileSync } from "node:fs";
import { Engine } from "json-rules-engine";
import { runAll } from "./jre-rules.mjs";

for (const [label, file] of [["scenarios", "cases.json"], ["generated", "fuzz.json"]]) {
  const r = await runAll(Engine, JSON.parse(readFileSync(file, "utf8")));
  console.log(`jre-node/${label}: ${r.match}/${r.total} match, ${r.msPer.toFixed(3)} ms per evaluation`);
  for (const d of r.diffs) console.log("  DIFF", JSON.stringify(d));
}
