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

// Six roles from the access policy, plus two older ones kept until their users
// move. What each role may do lives in the database (role_permissions, 036);
// the database checks it on every call, so the browser keeps only the names.
export type UserRole =
  | "credit_officer" | "credit_manager" | "credit_head" | "policy_manager" | "compliance" | "admin"
  | "reviewer" | "viewer";

export const ROLE_LABELS: Record<UserRole, string> = {
  credit_officer: "Credit Officer",
  credit_manager: "Credit Manager",
  credit_head: "Credit Head",
  policy_manager: "Policy Manager",
  compliance: "Compliance",
  admin: "Admin",
  reviewer: "Reviewer (old role)",
  viewer: "Viewer (old role)",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

/** What the database said at sign-in: whether to let the person in, and their idle limit. */
export interface LoginCheck {
  allowed: boolean;
  reason?: "locked" | "no_access" | undefined;
  lockedUntil?: string | undefined;
  idleTimeoutMinutes?: number | undefined;
}

const IDLE_KEY = "cercit_idle_minutes";

export function getIdleTimeoutMinutes(): number {
  try {
    const n = Number(sessionStorage.getItem(IDLE_KEY));
    return n >= 5 && n <= 60 ? n : 15;
  } catch {
    return 15;
  }
}

/**
 * Runs straight after a successful sign-in. A locked or unknown account is
 * signed out again here; the database would refuse its data anyway (036).
 */
export async function checkLogin(): Promise<LoginCheck> {
  const { data, error } = await supabase.rpc("fn_record_login");
  // Older database without 036: let the sign-in stand, as before.
  if (error || !data) return { allowed: true };
  const r = data as { allowed: boolean; reason?: LoginCheck["reason"]; locked_until?: string; idle_timeout_minutes?: number };
  // "no_access" is a customer, or staff not set up yet: both carry on as before,
  // and the database gives them no staff data either way.
  if (!r.allowed && r.reason === "locked") {
    await supabase.auth.signOut();
    return { allowed: false, reason: r.reason, lockedUntil: r.locked_until };
  }
  if (!r.allowed) return { allowed: true };
  try { sessionStorage.setItem(IDLE_KEY, String(r.idle_timeout_minutes ?? 15)); } catch {}
  return { allowed: true, idleTimeoutMinutes: r.idle_timeout_minutes };
}

/** Counts a wrong password towards the lockout. Silent by design: it never says whether the address exists. */
export async function recordFailedLogin(email: string): Promise<void> {
  try { await supabase.rpc("fn_record_failed_login", { p_email: email.trim().toLowerCase() }); } catch {}
}

export function lockedMessage(lockedUntil?: string): string {
  const until = lockedUntil
    ? new Date(lockedUntil).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;
  return until
    ? `This account is locked after too many wrong passwords. Try again after ${until}, or ask an admin to unlock it.`
    : "This account is locked after too many wrong passwords. Ask an admin to unlock it.";
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
  try { sessionStorage.removeItem("cercit_customer_email"); sessionStorage.removeItem(IDLE_KEY); } catch {}

  if (!isSupabaseConfigured) {
    return { error: null };
  }
  // Ends the session everywhere. If that call fails (offline, server error),
  // still forget it in this browser, so a failed sign-out never leaves you signed in.
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" });
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
