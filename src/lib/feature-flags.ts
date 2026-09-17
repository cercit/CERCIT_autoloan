import { useQuery } from "@tanstack/react-query";

import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Module switches (sql/015). A new module stays hidden until its switch is on.
 * Anything missing — no table yet, no row, a network error — counts as off,
 * so the current screens keep working until a switch is deliberately turned on.
 */
export const FEATURE_FLAGS = [
  "server_engine",
  "versioned_policy",
  "admin_users",
  "credit_control",
  "kyc_module",
  "underwriting_data",
  "server_model_score",
  "sanction_documents",
  "compliance_view",
  "admin_console",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlagMap = Partial<Record<FeatureFlag, boolean>>;

export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

const OVERRIDE_KEY = "cercit_flags";

export function isFeatureFlag(value: string): value is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(value);
}

/**
 * Developer-only overrides, e.g. localStorage.cercit_flags = '{"kyc_module":true}'.
 * Ignored in production builds so a browser cannot switch a module on.
 */
function devOverrides(): FeatureFlagMap {
  if (!import.meta.env.DEV || typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(OVERRIDE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const flags: FeatureFlagMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isFeatureFlag(key)) flags[key] = value === true;
    }
    return flags;
  } catch {
    return {};
  }
}

export async function fetchFeatureFlags(): Promise<FeatureFlagMap> {
  if (!isSupabaseConfigured || isDemoMode()) return devOverrides();

  const { data, error } = await supabase
    .from("feature_flags")
    .select("flag_key, enabled")
    .eq("tenant_id", DEFAULT_TENANT_ID);

  if (error || !data) return devOverrides();

  const flags: FeatureFlagMap = {};
  for (const row of data as { flag_key: string; enabled: boolean }[]) {
    if (isFeatureFlag(row.flag_key)) flags[row.flag_key] = row.enabled === true;
  }
  return { ...flags, ...devOverrides() };
}

export const featureFlagsQueryKey = ["feature-flags"] as const;

export function useFeatureFlags(): FeatureFlagMap {
  const { data } = useQuery({
    queryKey: featureFlagsQueryKey,
    queryFn: fetchFeatureFlags,
    staleTime: 60_000,
  });
  return data ?? {};
}

/** True only when the switch is explicitly on. */
export function useFeature(flag: FeatureFlag): boolean {
  return useFeatureFlags()[flag] === true;
}

export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  const flags = await fetchFeatureFlags();
  return flags[flag] === true;
}
