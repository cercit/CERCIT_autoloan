# B5 — ML Model + SHAP Explainability Skeleton

Status: INTERRUPTED in subagent B5; produced manually in hermes2.

## Source evidence
- `PRD.md` — mentions ML risk model, SHAP explainability, synthetic data, XGBoost, ONNX export.
- `docs/build-roadmap-v2.md` — ML model phase (future, after Phase 1).
- `docs/supabase_integration_guide.md` — DB schema includes `engine_decisions`, `applications`, `audit_trail`; no dedicated ML feature table.
- `docs/current_state_workflow.md` — decision engine is deterministic (policy rules); ML model is future enhancement.

## Skeleton design

### Synthetic data generation
Generate synthetic applications (~5,000 rows) with:
- Features: `cibil_score`, `income`, `employer_category`, `loan_amount`, `ltv_pct`, `foir_pct`, `tenure_months`, `vehicle_make_risk_tier`.
- Target: `default` (0/1) or `approval_decision` (APPROVE/MAYBE/REJECT).
- Distribution: 70% APPROVE, 20% MAYBE, 10% REJECT (approximate real-world mix per PRD.md).

### XGBoost model
- Train XGBoost classifier (`xgb.XGBClassifier`) on synthetic features.
- Hyperparameters: `max_depth = 4`, `learning_rate = 0.05`, `n_estimators = 100`.
- Evaluate with cross-validation (`StratifiedKFold`).
- Export to ONNX: `skl2onnx.convert_xgboost()` → `.onnx` file.

### SHAP explainability
- Use `shap` library (`TreeExplainer`) on XGBoost model.
- Generate SHAP summary plot (`shap.summary_plot`) and force plot per application.
- Integrate SHAP values into `engine_decisions` (new column: `shap_features` or `explanation_json`).
- UI: add SHAP bar chart (`recharts`) showing feature contributions (positive/negative) next to decision screen.

### Lambda / server integration (future)
- Load ONNX model in Lambda (`onnxruntime`) for inference.
- Call `POST /assess` with application UUID; Lambda reads features from `applications` + `engine_decisions`, runs ONNX inference, writes `decision`, `score`, `shap_values` back to DB.

## Assumptions (`.meta.json`)
- Synthetic data must match schema columns (no real SFL/customer data per `CLAUDE.md` rules).
- XGBoost requires `pip install xgboost shap scikit-learn` (not currently in `package.json`); add to dev dependencies.
- SHAP integration requires new `recharts` chart component (already installed).
- ONNX Lambda requires `onnxruntime` in Lambda package (`requirements.txt` addition).
- No production deployment until Phase 2 (future); skeleton only.
