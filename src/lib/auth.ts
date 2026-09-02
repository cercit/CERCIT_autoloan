import { supabase, isSupabaseConfigured } from "./supabase";

export { isSupabaseConfigured } from "./supabase";

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

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) {
    // Demo mode: always succeed after a brief delay (fake async)
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
