"""
cercit Week 3 / Part B -- XGBoost training, SHAP, ONNX export

Input : scripts/data/training-data.csv   (from generate-training-data.ts)
Output: public/models/cercit-risk-v1.onnx  (browser inference)
        public/models/cercit-risk-v1.meta.json (feature order, metrics, SHAP baseline)
        scripts/data/shap-summary.json

Run:  python scripts/train-model.py [--label bad30|default90]
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "scripts" / "data" / "training-data.csv"
OUT_DIR = ROOT / "public" / "models"
MODEL_NAME = "cercit-risk-v1"

FEATURES = [
    "bureauScore", "dpd30", "dpd60", "dpd90", "dpdWriteOff", "enquiryVelocity",
    "bounceCount", "salaryRegularity", "employerTier", "cashWithdrawalRatio",
    "ltvPercent", "foirPercent", "tenureMonths", "age",
    "govtEmployee", "employmentYears", "ccServicingPattern", "freeIncomeRatio",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="bad30", choices=["bad30", "default90"])
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = pd.read_csv(DATA)
    # numpy, not DataFrame: onnxmltools requires f0..fN feature names
    X = df[FEATURES].astype(np.float32).values
    y = df[args.label].astype(int).values
    print(f"rows={len(df)}  label={args.label}  positive_rate={y.mean():.4f}")

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=args.seed, stratify=y
    )

    # no scale_pos_weight: keeps predict_proba calibrated so score bands mean what they say
    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.8,
        min_child_weight=5,
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
    onnx_path = OUT_DIR / f"{MODEL_NAME}.onnx"
    export_onnx(model, onnx_path)

    # ---- verify ONNX matches XGBoost ----
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    out = sess.run(None, {inp: X_te[:200].astype(np.float32)})
    onnx_prob = np.array([r[1] for r in out[1]]) if isinstance(out[1][0], dict) else out[1][:, 1]
    diff = float(np.abs(onnx_prob - p_te[:200]).max())
    print(f"onnx vs xgboost max abs diff on 200 rows: {diff:.6f}")
    assert diff < 1e-3, "ONNX export drifted from XGBoost"

    meta = {
        "model": MODEL_NAME,
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
    (OUT_DIR / f"{MODEL_NAME}.meta.json").write_text(json.dumps(meta, indent=2))
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
