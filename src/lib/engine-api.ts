/**
 * The rules engine on AWS, for one application (backlog FD4.5).
 *
 * The engine runs the policy version in force and records its answer against
 * the case. While the `server_engine` switch is off the answer is only recorded,
 * so the two engines can be compared; with the switch on it becomes the
 * application's decision. The database decides that, not this file.
 */
import { isDemoMode } from "./auth";
import { isFeatureEnabled } from "./feature-flags";
import { isSupabaseConfigured, supabase } from "./supabase";

const API_BASE = String(import.meta.env["VITE_AWS_API_URL"] ?? "").replace(/\/$/, "");

export type EngineDecision = {
  decision: "approve" | "review" | "decline";
  versionCode: string | null;
  score: number | null;
  hardFailed: string[];
  softFailed: string[];
  /** Facts nobody recorded. The rules that read them never fired. */
  factsNotKnown: string[];
  /** True when this answer was used as the application's decision. */
  applied: boolean;
  decidedAt: string;
  /** What the case says now, so a difference is visible while the switch is off. */
  storedDecision: string | null;
};

/** Asks the engine to decide one application. The engine records the answer itself. */
export async function assessOnServer(
  applicationUuid: string
): Promise<{ ok: true; applied: boolean; decision: string } | { ok: false; error: string }> {
  if (!isSupabaseConfigured || isDemoMode() || !API_BASE) {
    return { ok: false, error: "The rules engine is not connected" };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sign in again" };
  try {
    const res = await fetch(`${API_BASE}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: applicationUuid }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; applied?: boolean; decision?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `The rules engine answered ${res.status}` };
    return { ok: true, applied: body.applied === true, decision: String(body.decision ?? "") };
  } catch {
    return { ok: false, error: "Could not reach the rules engine" };
  }
}

/**
 * Runs after a submission, when the switch is on. The application already has a
 * decision from the database pipeline; this replaces it with the engine's.
 * A failure here leaves that first decision in place, which is why it only warns.
 */
export async function assessIfServerEngineOn(applicationUuid: string | null | undefined): Promise<void> {
  if (!applicationUuid) return;
  if (!(await isFeatureEnabled("server_engine"))) return;
  const result = await assessOnServer(applicationUuid);
  if (!result.ok) console.warn("Rules engine did not decide this application:", result.error);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Screens hold the reference an officer reads (APP-2026-00123); the engine works in ids. */
async function toUuid(idOrRef: string): Promise<string | null> {
  if (UUID.test(idOrRef)) return idOrRef;
  const { data } = await supabase.from("applications").select("id").eq("application_id", idOrRef).limit(1);
  const row = (data as { id?: string }[] | null)?.[0];
  return row?.id ?? null;
}

/** The engine's latest answer on a case, or null if it has not seen it. */
export async function getEngineDecision(applicationIdOrRef: string): Promise<EngineDecision | null> {
  if (!isSupabaseConfigured || isDemoMode()) return null;
  const uuid = await toUuid(applicationIdOrRef);
  if (!uuid) return null;
  const { data, error } = await supabase.rpc("fn_engine_decision", { p_application_id: uuid });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    decision: String(row["decision"]) as EngineDecision["decision"],
    versionCode: (row["version_code"] as string | null) ?? null,
    score: row["score"] === null || row["score"] === undefined ? null : Number(row["score"]),
    hardFailed: list(row["hard_failed"]),
    softFailed: list(row["soft_failed"]),
    factsNotKnown: list(row["facts_not_known"]),
    applied: row["applied"] === true,
    decidedAt: String(row["decided_at"]),
    storedDecision: (row["stored_decision"] as string | null) ?? null,
  };
}
