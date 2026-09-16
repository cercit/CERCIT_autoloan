# LinkedIn Post: cercit Week 3 — XGBoost meets policy rules

Shipped Week 3 of cercit: XGBoost model trained on 10K synthetic profiles, runs entirely in the browser via ONNX (no server calls). Paired with an 18-rule policy engine that catches what the model misses.

AUC 0.91 on default prediction. But — and this is why it's interesting — a clean applicant with one weak flag (bureau 640) still comes back grade A from the model. Which makes sense: clean files rarely default, even with a dent. So that's when policy steps in hard: anything under 650 CIBIL gets rejected, full stop.

That division of labor is deliberate. The model proposes (here's the risk), policy disposes (you're approved or not). Officers trust a rule they can read and audit over a number they can't fully explain.

Tested it against 40 scenarios: green files, flagged files, hard declines, and a handful where the model and policy disagree. All 40 pass.

Next: get the AWS Lambdas live for document extraction, wire real bank statements.

#credittech #ai #rbi #nbfc
