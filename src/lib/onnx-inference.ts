/**
 * Browser-side ONNX Runtime wrapper for the cercit XGBoost risk model.
 * Model artifacts live in public/models/ and are produced by scripts/train-model.py.
 */

import type { InferenceSession } from "onnxruntime-web";

export const MODEL_VERSION = "cercit-risk-v1";
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

let sessionPromise: Promise<InferenceSession> | null = null;
let metaPromise: Promise<ModelMeta> | null = null;

function modelBase(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return `${base.replace(/\/$/, "")}/models/${MODEL_VERSION}`;
}

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function";
}

export function loadModelMeta(): Promise<ModelMeta> {
  if (!metaPromise) {
    metaPromise = fetch(`${modelBase()}.meta.json`).then((r) => {
      if (!r.ok) throw new Error(`model meta fetch failed: ${r.status}`);
      return r.json() as Promise<ModelMeta>;
    });
  }
  return metaPromise;
}

async function loadSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(`${modelBase()}.onnx`, {
        executionProviders: ["wasm"],
      });
    })();
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

// ort-web wasm sessions reject overlapping run() calls, so every inference waits its turn
let queue: Promise<unknown> = Promise.resolve();

/** Returns P(bad) for each row. Rows must follow meta.features order. */
export function predictBadProbability(rows: number[][]): Promise<number[]> {
  const next = queue.then(() => runInference(rows));
  queue = next.catch(() => undefined);
  return next;
}

async function runInference(rows: number[][]): Promise<number[]> {
  if (rows.length === 0) return [];
  const [session, meta, ort] = await Promise.all([
    loadSession(),
    loadModelMeta(),
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

export function isModelReady(): boolean {
  return sessionPromise !== null;
}

export function warmUpModel(): void {
  if (isBrowser()) void loadSession().catch(() => undefined);
}
