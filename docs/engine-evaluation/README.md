# Rules engine evaluation (task 0.5a)

Date: 17 Sep 2026
Decision it supports: 0.5 — run credit rules in an open-source engine

## Question

Can the 18 cercit credit rules move out of `src/lib/policy-rule-engine.ts` into an open-source engine, give exactly the same answers, and run somewhere we already host?

Candidates:

| Engine | Version | Licence | Cost |
|---|---|---|---|
| GoRules Zen | 2.0.2 | MIT | Free, self-hosted, no per-decision fee |
| json-rules-engine | 7.3.1 | ISC | Free |

GoRules also sells a hosted rule-management product. It is not needed: rule versions, approvals and audit live in our own tables.

## Method

1. `prepare.mts` turns the 40 scenarios in `scripts/test-cases` into inputs with every default made explicit, and records today's engine result for each (decision, hard failures, soft failures, score). The 40 scenarios only ever trigger 16 of the 18 rules, so it also generates 2,000 cases around every threshold, which trigger all 18.
2. `gen-zen.mjs` writes the rules as one Zen decision model (`zen-policy.json`): a decision table with one row per rule, then an expression node that turns failures into the decision and score.
3. `jre-rules.mjs` writes the same rules for json-rules-engine; the decision step is our own code, because that engine only reports which rules fired.
4. Each engine is scored against today's engine on every field.

## Results

| Engine | Runtime | 40 scenarios | 2,000 generated | Time per decision |
|---|---|---|---|---|
| Zen | Node (native) | 40/40 | 2,000/2,000 | 0.15 ms |
| Zen | Node (WebAssembly build) | 40/40 | 2,000/2,000 | 0.40 ms |
| Zen | Python 3.12 | 40/40 | 2,000/2,000 | 0.48 ms |
| Zen | Deno | does not load | — | — |
| json-rules-engine | Node | 40/40 | 2,000/2,000 | 0.19 ms |
| json-rules-engine | Deno | — | 2,000/2,000 | 0.21 ms |

Every run matched today's engine exactly: same decision, same failed rules, same score.

## Where each can run

| | Zen | json-rules-engine |
|---|---|---|
| Supabase Edge Functions (Deno) | **No.** The native build needs native-code permission, and the WebAssembly build does not load in Deno even with all permissions. See [gorules/zen#403](https://github.com/gorules/zen/issues/403) | Yes |
| AWS Lambda, Python 3.12 (our existing Lambdas, `ap-south-1`) | Yes — `zen-engine` 2.0.2 publishes `manylinux_2_28` wheels for x86_64 (10 MB) and arm64 (9.5 MB), which suit Amazon Linux 2023 | Not applicable (JavaScript) |
| AWS Lambda, Node | Yes — Linux binaries for x64 and arm64 (22–26 MB unpacked) | Yes |

## Other factors

| | Zen | json-rules-engine |
|---|---|---|
| Visual editor for the Policy Manager | Yes — `@gorules/jdm-editor` 1.52, MIT, React ≥ 18 (cercit uses React 19) | None; we would build one |
| How rules read | A table: one row per rule, one column per field | Nested JSON; the tenure and on-road LTV rules become three levels deep |
| Decision and score | Inside the model | In our code |
| Same rule file in more than one language | Yes — identical results in Node and Python | JavaScript only |
| Size | 10 MB wheel | 0.1 MB |

## Recommendation

**GoRules Zen, on a Python 3.12 AWS Lambda in `ap-south-1`**, next to the existing document Lambdas.

- Exact parity with today's engine on 2,040 cases
- The visual editor is what makes the Policy Manager role and the admin console practical
- The rule model is plain JSON, so each version can be stored, diffed and approved in our tables
- It fits the existing SAM template and Python stack

Cost of this choice: the engine cannot sit inside Supabase, so the assessment pipeline calls the Lambda over HTTPS (from a Supabase Edge Function, or from Postgres with `pg_net`). That adds a network hop and depends on the Lambdas being deployed, which means the SAM CLI install moves into the foundation stage.

Fallback if the Lambda route stalls: json-rules-engine inside Supabase gives the same answers today, with no editor.

## Re-running

```
cd docs/engine-evaluation
npm init -y && npm install @gorules/zen-engine json-rules-engine
node prepare.mts
node gen-zen.mjs
node run-zen.mjs
node run-jre.mjs
python -m pip install zen-engine==2.0.2 --target pylib
python run_zen.py
```

`run-deno.ts` needs Deno 2.x: `deno run --allow-read --allow-env --node-modules-dir=auto run-deno.ts`.
