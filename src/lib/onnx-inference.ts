/**
 * Browser-side ONNX Runtime wrapper for the cercit XGBoost risk model.
 * Model artifacts live in public/models/ and are produced by scripts/train-model.py.
 */

import type { InferenceSession } from "onnxruntime-web";

/** The approved model whose score officers see. Matches the ACTIVE row in model_versions. */
/** v2 approved 2 Oct 2026 (sql/057); v1 stays in public/models for old decisions. */
export const MODEL_VERSION = "cercit-risk-v2";
/** A retrained model shown beside it until it is signed off (champion / challenger). None now. */
export const CHALLENGER_VERSION: string | null = null;
const ORT_VERSION = "1.20.1";

export interface ModelMeta {
  model: string;
  label: string;
  trainedAt: string;
  features: string[];
  inputName: string;
  outputNames: string[];
  metrics: { auc: number; pr_auc: number; brier: number; test_rows: number };
  bandBadRates: Record<string, { count: number; badRate: number }>;
  shap: { baseValue: number; importance: { feature: string; meanAbsShap: number }[] };
  featureMeans: Record<string, number>;
}

const sessions = new Map<string, Promise<InferenceSession>>();
const metas = new Map<string, Promise<ModelMeta>>();

function modelBase(version: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return `${base.replace(/\/$/, "")}/models/${version}`;
}

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function";
}

export function loadModelMeta(version: string = MODEL_VERSION): Promise<ModelMeta> {
  let p = metas.get(version);
  if (!p) {
    p = fetch(`${modelBase(version)}.meta.json`).then((r) => {
      if (!r.ok) throw new Error(`model meta fetch failed: ${r.status}`);
      return r.json() as Promise<ModelMeta>;
    });
    metas.set(version, p);
    p.catch(() => metas.delete(version));
  }
  return p;
}

function loadSession(version: string): Promise<InferenceSession> {
  let p = sessions.get(version);
  if (!p) {
    p = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(`${modelBase(version)}.onnx`, {
        executionProviders: ["wasm"],
      });
    })();
    sessions.set(version, p);
    p.catch(() => sessions.delete(version));
  }
  return p;
}

// ort-web wasm sessions reject overlapping run() calls, so every inference waits its turn
let queue: Promise<unknown> = Promise.resolve();

/** Returns P(bad) for each row. Rows must follow meta.features order. */
export function predictBadProbability(rows: number[][], version: string = MODEL_VERSION): Promise<number[]> {
  const next = queue.then(() => runInference(rows, version));
  queue = next.catch(() => undefined);
  return next;
}

async function runInference(rows: number[][], version: string): Promise<number[]> {
  if (rows.length === 0) return [];
  const [session, meta, ort] = await Promise.all([
    loadSession(version),
    loadModelMeta(version),
    import("onnxruntime-web"),
  ]);
  const width = meta.features.length;
  const flat = new Float32Array(rows.length * width);
  rows.forEach((row, i) => {
    if (row.length !== width) throw new Error(`expected ${width} features, got ${row.length}`);
    flat.set(row, i * width);
  });
  const input = new ort.Tensor("float32", flat, [rows.length, width]);
  const out = await session.run({ [meta.inputName]: input });
  const tensor = out["probabilities"];
  if (!tensor) throw new Error("model returned no probabilities output");
  const probs = tensor.data as Float32Array;
  const result: number[] = [];
  for (let i = 0; i < rows.length; i++) result.push(probs[i * 2 + 1] ?? 0);
  return result;
}

export function isModelReady(version: string = MODEL_VERSION): boolean {
  return sessions.has(version);
}

export function warmUpModel(version: string = MODEL_VERSION): void {
  if (isBrowser()) void loadSession(version).catch(() => undefined);
}
