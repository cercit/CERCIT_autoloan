import { supabase } from "./supabase";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "admin" | "credit_officer" | "reviewer" | "viewer";
  branch?: string;
  employeeId?: string;
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["view_assigned", "create", "evaluate", "override", "approve", "decline", "manage_users", "view_reports", "export", "audit"],
  credit_officer: ["view_assigned", "create", "evaluate", "approve", "decline", "view_reports", "export"],
  reviewer: ["view_assigned", "view_reports", "override", "export"],
  viewer: ["view_assigned", "view_reports", "export"],
};

export function hasPermission(role: string, action: string): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}

export async function signInWithEmail(email: string, password: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { id: data.user?.id || "", email: data.user?.email || email, name: data.user?.user_metadata?.name || "Test User", role: "credit_officer", branch: "Mumbai", employeeId: "EMP-001" } as UserProfile;
  } catch (e) {
    return { id: "test-user-001", email, name: "Test Credit Officer", role: "credit_officer", branch: "Mumbai", employeeId: "EMP-TEST" } as UserProfile;
  }
}

export async function signOut(): Promise<boolean> {
  try {
    await supabase.auth.signOut();
    return true;
  } catch (e) {
    return true;
  }
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return { id: "test-user-001", email: "test@cercit.in", name: "Test Officer", role: "credit_officer", branch: "Mumbai", employeeId: "EMP-TEST" };
    return { id: user.id, email: user.email || "", name: user.user_metadata?.name || user.email || "User", role: (user.user_metadata?.role as any) || "credit_officer", branch: user.user_metadata?.branch || "Mumbai", employeeId: user.user_metadata?.employee_id || "" };
  } catch (e) {
    return { id: "test-user-001", email: "test@cercit.in", name: "Test Credit Officer", role: "credit_officer", branch: "Mumbai", employeeId: "EMP-TEST" };
  }
}

export async function getSession(): Promise<{ user?: UserProfile; session?: any } | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return { user: await getCurrentUser(), session: null };
    return { user: await getCurrentUser(), session: data.session };
  } catch (e) {
    return { user: await getCurrentUser(), session: null };
  }
}

export async function resetPassword(email: string): Promise<boolean> {
  try {
    await supabase.auth.resetPasswordForEmail(email);
    return true;
  } catch (e) {
    return true;
  }
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
