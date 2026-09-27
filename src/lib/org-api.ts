import { useEffect, useState } from "react";

import { supabase, isSupabaseConfigured } from "./supabase";

/** What the footer and legal page show. Anyone may read it (041). */
export interface PublicOrgInfo {
  company_name: string;
  legal_name: string | null;
  cin: string | null;
  rbi_registration_no: string | null;
  gstin: string | null;
  registered_address: string | null;
  support_email: string | null;
  support_phone: string | null;
  grievance_officer_name: string | null;
  grievance_officer_email: string | null;
  grievance_officer_phone: string | null;
  grievance_reply_days: number;
}

export interface OrgSettings extends PublicOrgInfo {
  staff_email_domains: string[];
  restrict_staff_domains: boolean;
  updated_at: string | null;
  updated_by: string | null;
  can_manage: boolean;
}

/** Shown when there is no database, or before 041 has run: today's published details. */
export const DEFAULT_ORG_INFO: PublicOrgInfo = {
  company_name: "cercit",
  legal_name: null,
  cin: null,
  rbi_registration_no: null,
  gstin: null,
  registered_address: null,
  support_email: "support@cercit.in",
  support_phone: "1800 000 0000",
  grievance_officer_name: null,
  grievance_officer_email: "gro@cercit.in",
  grievance_officer_phone: null,
  grievance_reply_days: 7,
};

function message(error: { message?: string } | null): string {
  return (error?.message ?? "Something went wrong").replace(/^.*?ERROR:\s*/, "");
}

let publicInfo: Promise<PublicOrgInfo> | null = null;

export function getPublicOrgInfo(): Promise<PublicOrgInfo> {
  if (!isSupabaseConfigured) return Promise.resolve(DEFAULT_ORG_INFO);
  publicInfo ??= Promise.resolve(supabase.rpc("fn_public_org_info")).then(({ data, error }) =>
    error || !data ? DEFAULT_ORG_INFO : { ...DEFAULT_ORG_INFO, ...(data as PublicOrgInfo) },
  );
  return publicInfo;
}

/** Public details for display; starts with the defaults so nothing jumps in empty. */
export function usePublicOrgInfo(): PublicOrgInfo {
  const [info, setInfo] = useState(DEFAULT_ORG_INFO);
  useEffect(() => {
    let live = true;
    void getPublicOrgInfo().then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, []);
  return info;
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const { data, error } = await supabase.rpc("fn_org_settings");
  if (error) throw new Error(message(error));
  return data as OrgSettings;
}

export async function saveOrgSettings(s: Omit<OrgSettings, "updated_at" | "updated_by" | "can_manage">): Promise<void> {
  const { error } = await supabase.rpc("fn_org_settings_save", { p: s });
  if (error) throw new Error(message(error));
  publicInfo = null;
}
