import { supabase, isSupabaseConfigured } from "./supabase";
import { isDemoMode } from "./auth";
import { users as sampleUsers } from "./mock-data";

/** One row on the Users screen. */
export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  roleIsLegacy: boolean;
  stateCode: string | null;
  stateName: string | null;
  isActive: boolean;
  lockedUntil: string | null;
  maxSanctionAmount: number | null;
  dailyCaseLimit: number | null;
  hasLogin: boolean;
  lastLoginAt: string | null;
  isMe: boolean;
}

export interface StaffList {
  users: StaffUser[];
  canManage: boolean;
  /** Sample rows: demo mode, or no database connection. Nothing can be changed. */
  sample: boolean;
}

export interface RoleOption {
  code: string;
  name: string;
  description: string;
  decides: boolean;
}

export interface StateOption {
  code: string;
  name: string;
}

export interface SaveUserInput {
  id: string | null;
  email: string;
  fullName: string;
  role: string;
  stateCode: string | null;
  maxSanctionAmount: number | null;
  dailyCaseLimit: number | null;
}

const useSample = () => !isSupabaseConfigured || isDemoMode();

function sampleList(): StaffList {
  return {
    canManage: false,
    sample: true,
    users: sampleUsers.map((u, i) => ({
      id: `sample-${i}`,
      email: u.email,
      fullName: u.name,
      role: u.role,
      roleName: u.role,
      roleIsLegacy: false,
      stateCode: null,
      stateName: u.branch,
      isActive: u.status === "Active",
      lockedUntil: null,
      maxSanctionAmount: Number(u.limit.replace(/[^0-9]/g, "")) || null,
      dailyCaseLimit: null,
      hasLogin: true,
      lastLoginAt: null,
      isMe: false,
    })),
  };
}

/** Database messages are written for people; strip the Postgres wrapping. */
function message(error: { message?: string } | null): string {
  return (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
}

/** Row shape returned by fn_admin_list_users (037). */
interface ListRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_name: string | null;
  role_is_legacy: boolean | null;
  state_code: string | null;
  state_name: string | null;
  is_active: boolean;
  locked_until: string | null;
  max_sanction_amount: number | string | null;
  daily_case_limit: number | null;
  has_login: boolean;
  last_login_at: string | null;
  is_me: boolean;
  can_manage: boolean;
}

export async function listStaff(): Promise<StaffList> {
  if (useSample()) return sampleList();
  const { data, error } = await supabase.rpc("fn_admin_list_users");
  if (error) throw new Error(message(error));
  const rows = (data ?? []) as ListRow[];
  return {
    sample: false,
    canManage: rows.some((r) => r.can_manage === true),
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      role: r.role,
      roleName: r.role_name ?? r.role,
      roleIsLegacy: r.role_is_legacy === true,
      stateCode: r.state_code ?? null,
      stateName: r.state_name ?? null,
      isActive: r.is_active === true,
      lockedUntil: r.locked_until ?? null,
      maxSanctionAmount: r.max_sanction_amount == null ? null : Number(r.max_sanction_amount),
      dailyCaseLimit: r.daily_case_limit == null ? null : Number(r.daily_case_limit),
      hasLogin: r.has_login === true,
      lastLoginAt: r.last_login_at ?? null,
      isMe: r.is_me === true,
    })),
  };
}

/** Roles that can be given to someone: active and current. */
export async function listRoleOptions(): Promise<RoleOption[]> {
  const [{ data: roles, error }, { data: grants }] = await Promise.all([
    supabase.from("roles").select("code, name, description").eq("is_active", true).eq("is_legacy", false).order("name"),
    supabase.from("role_permissions").select("role_code").eq("permission_code", "app.decide"),
  ]);
  if (error) throw new Error(message(error));
  const deciders = new Set((grants ?? []).map((g) => g.role_code as string));
  return (roles ?? []).map((r) => ({
    code: r.code as string,
    name: r.name as string,
    description: r.description as string,
    decides: deciders.has(r.code as string),
  }));
}

export async function listStates(): Promise<StateOption[]> {
  const { data, error } = await supabase.from("states").select("code, name").order("name");
  if (error) throw new Error(message(error));
  return (data ?? []) as StateOption[];
}

export async function saveUser(input: SaveUserInput): Promise<string> {
  const { data, error } = await supabase.rpc("fn_admin_save_user", {
    p_user_id: input.id,
    p_email: input.email,
    p_full_name: input.fullName,
    p_role: input.role,
    p_state_code: input.stateCode,
    p_max_sanction_amount: input.maxSanctionAmount,
    p_daily_case_limit: input.dailyCaseLimit,
  });
  if (error) throw new Error(message(error));
  return data as string;
}

export async function setUserActive(id: string, active: boolean, reason: string): Promise<void> {
  const { error } = await supabase.rpc("fn_admin_set_user_active", { p_user_id: id, p_active: active, p_reason: reason });
  if (error) throw new Error(message(error));
}

export async function unlockUser(id: string): Promise<void> {
  const { error } = await supabase.rpc("fn_unlock_user", { p_user_id: id });
  if (error) throw new Error(message(error));
}

/**
 * Emails the person a sign-in code. Supabase creates their login on first use
 * and 034 links it to their row by email. Nothing changes for the admin's own
 * session: the code only works for the person who receives it.
 */
export async function sendSignInEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login` },
  });
  if (error) throw new Error(message(error));
}
