import { supabase } from "./supabase";

export interface RoleRow {
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  is_legacy: boolean;
  is_active: boolean;
  mfa_required: boolean;
  idle_timeout_minutes: number;
  permissions: string[];
  active_users: number;
  waivers: { a: string; b: string; reason: string; review_by: string }[];
}

export interface PermissionRow {
  code: string;
  module: string;
  description: string;
}

export interface ConflictRow {
  a: string;
  b: string;
  reason: string;
}

export interface RoleRequest {
  id: string;
  kind: "CREATE" | "CHANGE";
  role_code: string;
  name: string;
  description: string;
  permissions: string[];
  mfa_required: boolean;
  idle_timeout_minutes: number;
  is_active: boolean;
  before: {
    name: string;
    description: string;
    mfa_required: boolean;
    idle_timeout_minutes: number;
    is_active: boolean;
    permissions: string[];
  } | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  requested_by: string | null;
  requested_by_me: boolean;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface RolesOverview {
  can_manage: boolean;
  can_approve: boolean;
  roles: RoleRow[];
  permissions: PermissionRow[];
  conflicts: ConflictRow[];
  requests: RoleRequest[];
}

export interface RoleProposal {
  code: string;
  name: string;
  description: string;
  permissions: string[];
  mfaRequired: boolean;
  idleTimeoutMinutes: number;
  isActive: boolean;
  reason: string;
}

function message(error: { message?: string } | null): string {
  return (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
}

export async function getRolesOverview(): Promise<RolesOverview> {
  const { data, error } = await supabase.rpc("fn_roles_overview");
  if (error) throw new Error(message(error));
  return data as RolesOverview;
}

export async function proposeRoleChange(p: RoleProposal): Promise<void> {
  const { error } = await supabase.rpc("fn_role_request_submit", {
    p_role_code: p.code,
    p_name: p.name,
    p_description: p.description,
    p_permissions: p.permissions,
    p_mfa_required: p.mfaRequired,
    p_idle_timeout_minutes: p.idleTimeoutMinutes,
    p_is_active: p.isActive,
    p_reason: p.reason,
  });
  if (error) throw new Error(message(error));
}

export async function decideRoleChange(id: string, approve: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc("fn_role_request_decide", { p_request_id: id, p_approve: approve, p_note: note });
  if (error) throw new Error(message(error));
}

export async function withdrawRoleChange(id: string): Promise<void> {
  const { error } = await supabase.rpc("fn_role_request_withdraw", { p_request_id: id });
  if (error) throw new Error(message(error));
}

/** The conflicting pairs a set of rights would create on a role, minus the role's waivers. */
export function conflictsIn(perms: string[], conflicts: ConflictRow[], waivers: RoleRow["waivers"] = []): ConflictRow[] {
  const set = new Set(perms);
  return conflicts.filter(
    (c) => set.has(c.a) && set.has(c.b) && !waivers.some((w) => w.a === c.a && w.b === c.b),
  );
}
