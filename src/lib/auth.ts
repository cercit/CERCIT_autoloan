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

const DEMO_USER: AppUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "demo@cercit.in",
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
  if (!isSupabaseConfigured) return true;
  const session = await getSession();
  return !!session;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured) return DEMO_USER;

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

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ error: null }), 600);
    });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    return { error: null };
  }
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}
