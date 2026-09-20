import { supabase, isSupabaseConfigured } from "./supabase";

export { isSupabaseConfigured } from "./supabase";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  stateCode: string | null;
  isActive: boolean;
  maxSanctionAmount: number | null;
  dailyCaseLimit: number | null;
}

export type UserRole = "admin" | "credit_officer" | "reviewer" | "viewer";

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["view_assigned", "create", "evaluate", "override", "approve", "decline", "manage_users", "view_reports", "export", "audit"],
  credit_officer: ["view_assigned", "create", "evaluate", "approve", "decline", "view_reports", "export"],
  reviewer: ["view_assigned", "view_reports", "override", "export"],
  viewer: ["view_assigned", "view_reports", "export"],
};

export function hasPermission(role: string, action: string): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}

const EMPLOYEE_DOMAINS = ["cercit.in", "cercit.com"];

export function isEmployeeEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return EMPLOYEE_DOMAINS.includes(domain);
}

export function setCustomerEmail(email: string) {
  try { sessionStorage.setItem("cercit_customer_email", email); } catch {}
}

export function getCustomerEmail(): string | null {
  try { return sessionStorage.getItem("cercit_customer_email"); } catch { return null; }
}

export const DEMO_EMAIL = "demo@cercit.in";

let demoMode = false;

export function enableDemoMode() { demoMode = true; try { sessionStorage.setItem("cercit_demo", "1"); } catch {} }
export function disableDemoMode() { demoMode = false; try { sessionStorage.removeItem("cercit_demo"); } catch {} }
export function isDemoMode() {
  if (demoMode) return true;
  try { demoMode = sessionStorage.getItem("cercit_demo") === "1"; } catch {}
  return demoMode;
}

const DEMO_USER: AppUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: DEMO_EMAIL,
  fullName: "Demo Officer",
  role: "credit_officer",
  stateCode: "KA",
  isActive: true,
  maxSanctionAmount: 2500000,
  dailyCaseLimit: 40,
};

export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function requireAuth(): Promise<boolean> {
  if (!isSupabaseConfigured || isDemoMode()) return true;
  const session = await getSession();
  return !!session;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured || isDemoMode()) return DEMO_USER;

  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, state_code, is_active, max_sanction_amount, daily_case_limit")
    .eq("auth_user_id", session.user.id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    stateCode: data.state_code,
    isActive: data.is_active,
    maxSanctionAmount: data.max_sanction_amount,
    dailyCaseLimit: data.daily_case_limit,
  };
}

/**
 * Real credential check. Never falls back to demo mode — a failed sign-in is a
 * failed sign-in. Demo access goes through enableDemoMode() explicitly.
 */
export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: "Sign-in is unavailable — this deployment has no Supabase connection." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  disableDemoMode();
  return { error: null };
}

/**
 * Sends a six-digit sign-in code to the address. Used by accounts that hold
 * every right, where a password alone is too little: the code proves the person
 * also has the inbox. Supabase creates the login on first use if it does not
 * exist yet; without a row in `users` it still cannot do anything (018).
 */
export async function sendLoginCode(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: "Sign-in is unavailable — this deployment has no Supabase connection." };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  return { error: error?.message ?? null };
}

/** Completes a code sign-in. The code is typed by the person, never stored. */
export async function verifyLoginCode(email: string, code: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: "Sign-in is unavailable — this deployment has no Supabase connection." };
  }
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) return { error: error.message };
  disableDemoMode();
  return { error: null };
}

export async function signOut(): Promise<{ error: string | null }> {
  disableDemoMode();
  try { sessionStorage.removeItem("cercit_customer_email"); } catch {}

  if (!isSupabaseConfigured) {
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return { unsubscribe: data.subscription.unsubscribe };
}
