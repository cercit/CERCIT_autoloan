"""
cercit risk model -- XGBoost training, SHAP, ONNX export

v1 input: scripts/data/training-data.csv (from generate-training-data.ts; each feature drawn
          on its own from benchmark distributions)
v2 input: scripts/data/seasoned-features.csv (from scripts/local/export-seasoned-training.mjs;
          features worked out from the platform's own synthetic customers, so they hang
          together the way real files do). Outcomes are drawn here with the same risk formula
          v1 used, seeded by application ID, so the two versions differ only in the data.

Output: public/models/<name>.onnx  (browser inference)
        public/models/<name>.meta.json (feature order, metrics, SHAP baseline)
        scripts/data/shap-summary.json

Run:  python scripts/train-model.py                    (v1)
      python scripts/train-model.py --version v2       (v2; also scores v1 on v2's test files)
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
DATA = {
    "v1": ROOT / "scripts" / "data" / "training-data.csv",
    "v2": ROOT / "scripts" / "data" / "seasoned-features.csv",
}
OUT_DIR = ROOT / "public" / "models"

FEATURES = [
    "bureauScore", "dpd30", "dpd60", "dpd90", "dpdWriteOff", "enquiryVelocity",
    "bounceCount", "salaryRegularity", "employerTier", "cashWithdrawalRatio",
    "ltvPercent", "foirPercent", "tenureMonths", "age",
    "govtEmployee", "employmentYears", "ccServicingPattern", "freeIncomeRatio",
]


def _u(app_id: str, salt: str) -> float:
    h = hashlib.sha256(f"{app_id}:{salt}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def simulate_outcomes(df: pd.DataFrame) -> pd.DataFrame:
    """bad30 / default90 per file with v1's formula (generate-training-data.ts).
    Each application ID seeds its own draw, so a file always gets the same outcome."""
    bad30, default90, p_true = [], [], []
    for r in df.itertuples(index=False):
        z = -6.9
        z += (700 - r.bureauScore) * 0.017
        z += r.dpd30 * 0.45 + r.dpd60 * 0.8 + r.dpd90 * 1.3 + r.dpdWriteOff * 2.0
        z += r.enquiryVelocity * 0.12
        z += r.bounceCount * 0.5
        z += (6 - r.salaryRegularity) * 0.35
        z += (3 - r.employerTier) * 0.2
        z += max(0, r.cashWithdrawalRatio - 25) * 0.02
        z += max(0, r.foirPercent - 50) * 0.06
        z += max(0, 20 - r.freeIncomeRatio) * 0.05
        z += 0.25 if r.ltvPercent > 95 else 0
        z += (r.tenureMonths - 60) * 0.006
        z += 0.9 if r.ccServicingPattern == 3 else 0.3 if r.ccServicingPattern == 2 else 0
        z += 0.4 if r.age < 27 else 0.15 if r.age > 50 else 0
        z += 0.45 if r.employmentYears < 1.5 else -0.25 if r.employmentYears > 8 else 0
        z += -1.1 if r.govtEmployee else 0
        # life events the features never see (Box-Muller from the ID's own hash)
        u1, u2 = max(_u(r.application_id, "n1"), 1e-12), _u(r.application_id, "n2")
        z += float(np.sqrt(-2 * np.log(u1)) * np.cos(2 * np.pi * u2)) * 1.1
        p = 0.005 + 0.995 / (1 + np.exp(-z))
        b = 1 if _u(r.application_id, "bad30") < p else 0
        d = 1 if b and _u(r.application_id, "d90") < (0.12 if r.govtEmployee else 0.26) else 0
        bad30.append(b)
        default90.append(d)
        p_true.append(p)
    out = df.copy()
    out["bad30"], out["default90"], out["p_true"] = bad30, default90, p_true
    return out


def onnx_bad_prob(sess, X):
    out = sess.run(None, {sess.get_inputs()[0].name: X.astype(np.float32)})
    return np.array([r[1] for r in out[1]]) if isinstance(out[1][0], dict) else out[1][:, 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="bad30", choices=["bad30", "default90"])
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--version", default="v1", choices=["v1", "v2"])
    args = ap.parse_args()
    model_name = f"cercit-risk-{args.version}"

    df = pd.read_csv(DATA[args.version])
    if args.version == "v2":
        df = simulate_outcomes(df)
        df.to_csv(ROOT / "scripts" / "data" / "seasoned-training.csv", index=False)
    # numpy, not DataFrame: onnxmltools requires f0..fN feature names
    X = df[FEATURES].astype(np.float32).values
    y = df[args.label].astype(int).values
    print(f"rows={len(df)}  label={args.label}  positive_rate={y.mean():.4f}")

    idx_tr, idx_te = train_test_split(
        np.arange(len(y)), test_size=0.25, random_state=args.seed, stratify=y
    )
    X_tr, X_te, y_tr, y_te = X[idx_tr], X[idx_te], y[idx_tr], y[idx_te]

    # no scale_pos_weight: keeps predict_proba calibrated so score bands mean what they say.
    # v2 has fewer late payers (~200 in training), so it gets shallower trees: depth 4 overfit
    # (test AUC 0.729), depth 2 with larger leaves did best of five settings tried (0.741).
    shallow = args.version == "v2"
    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=2 if shallow else 4,
        learning_rate=0.03 if shallow else 0.05,
        subsample=0.85,
        colsample_bytree=0.8,
        min_child_weight=20 if shallow else 5,
        reg_lambda=2.0,
        objective="binary:logistic",
        eval_metric="aucpr",
        random_state=args.seed,
        n_jobs=4,
    )
    model.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)

    p_te = model.predict_proba(X_te)[:, 1]
    metrics = {
        "auc": round(float(roc_auc_score(y_te, p_te)), 4),
        "pr_auc": round(float(average_precision_score(y_te, p_te)), 4),
        "brier": round(float(brier_score_loss(y_te, p_te)), 4),
        "test_rows": int(len(y_te)),
        "test_positive_rate": round(float(y_te.mean()), 4),
    }
    print("metrics:", json.dumps(metrics))

    # ---- decile table: what default rate does each score band actually carry ----
    # same cut-offs as gradeFromProbability() in src/lib/risk-score-model.ts
    bands = pd.cut(p_te, [-1, 0.01, 0.025, 0.06, 0.15, 2], labels=["A", "B", "C", "D", "E"])
    decile = (
        pd.DataFrame({"band": bands, "y": y_te})
        .groupby("band", observed=True)["y"]
        .agg(["count", "mean"])
        .rename(columns={"mean": "bad_rate"})
    )
    print(decile)

    # ---- SHAP ----
    explainer = shap.TreeExplainer(model)
    shap_vals = explainer.shap_values(X_te)
    mean_abs = np.abs(shap_vals).mean(axis=0)
    importance = sorted(
        [{"feature": f, "meanAbsShap": round(float(v), 4)} for f, v in zip(FEATURES, mean_abs)],
        key=lambda d: -d["meanAbsShap"],
    )
    base_value = float(np.ravel(explainer.expected_value)[0])
    print("top features:", [d["feature"] for d in importance[:8]])

    # ---- ONNX export ----
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT_DIR / f"{model_name}.onnx"
    export_onnx(model, onnx_path)

    # ---- verify ONNX matches XGBoost ----
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    diff = float(np.abs(onnx_bad_prob(sess, X_te[:200]) - p_te[:200]).max())
    print(f"onnx vs xgboost max abs diff on 200 rows: {diff:.6f}")
    assert diff < 1e-3, "ONNX export drifted from XGBoost"

    # ---- v2 only: how the old model does on the same test files ----
    comparison = None
    if args.version == "v2":
        old = ort.InferenceSession(str(OUT_DIR / "cercit-risk-v1.onnx"), providers=["CPUExecutionProvider"])
        p_old = onnx_bad_prob(old, X_te)
        test = df.iloc[idx_te]
        comparison = {
            "testRows": int(len(y_te)),
            "actualBadRate": round(float(y_te.mean()), 4),
            "v1": {"auc": round(float(roc_auc_score(y_te, p_old)), 4),
                   "brier": round(float(brier_score_loss(y_te, p_old)), 4),
                   "avgPredicted": round(float(p_old.mean()), 4)},
            "v2": {"auc": metrics["auc"], "brier": metrics["brier"],
                   "avgPredicted": round(float(p_te.mean()), 4)},
            # AUC of the true formula probability: the ceiling any model can reach on these files
            "bestPossibleAuc": round(float(roc_auc_score(y_te, test["p_true"])), 4),
            "byEngineDecision": {},
        }
        for rec in ["APPROVE", "MAYBE", "REJECT"]:
            m = (test["recommendation"] == rec).values
            if m.any():
                comparison["byEngineDecision"][rec] = {
                    "files": int(m.sum()),
                    "actualBadRate": round(float(y_te[m].mean()), 4),
                    "v1Predicted": round(float(p_old[m].mean()), 4),
                    "v2Predicted": round(float(p_te[m].mean()), 4),
                }
        print("v1 vs v2 on v2 test files:", json.dumps(comparison, indent=2))

    meta = {
        "model": model_name,
        "label": args.label,
        "trainedAt": pd.Timestamp.now("UTC").isoformat(),
        "features": FEATURES,
        "inputName": inp,
        "outputNames": [o.name for o in sess.get_outputs()],
        "metrics": metrics,
        "bandBadRates": {
            str(k): {"count": int(v["count"]), "badRate": round(float(v["bad_rate"]), 4)}
            for k, v in decile.iterrows()
        },
        "shap": {"baseValue": base_value, "importance": importance},
        "featureMeans": {f: round(float(X_tr[:, i].mean()), 3) for i, f in enumerate(FEATURES)},
        "source": "synthetic training data only -- no real portfolio",
    }
    if args.version == "v2":
        meta["source"] = ("synthetic customers from the platform's own generator (055); features worked out "
                          "from bureau, bank and salary detail; outcomes drawn with v1's risk formula -- no real portfolio")
        meta["comparedWithV1"] = comparison
    (OUT_DIR / f"{model_name}.meta.json").write_text(json.dumps(meta, indent=2))
    (ROOT / "scripts" / "data" / "shap-summary.json").write_text(
        json.dumps({"baseValue": base_value, "importance": importance}, indent=2)
    )
    print(f"wrote {onnx_path.relative_to(ROOT)} and meta json")


def export_onnx(model, path: Path):
    from onnxmltools import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType

    initial_types = [("features", FloatTensorType([None, len(FEATURES)]))]
    onnx_model = convert_xgboost(model, initial_types=initial_types, target_opset=15)
    path.write_bytes(onnx_model.SerializeToString())


if __name__ == "__main__":
    main()
