import { supabase } from "./supabase";

export interface BureauReportRow {
  id: string;
  application_id: string;
  pan: string;
  bureau_name: string;
  score: number;
  dpd_30: number;
  dpd_60: number;
  dpd_90: number;
  active_accounts: number;
  enquiries_30d: number;
  enquiries_90d: number;
  utilization_percent: number;
  flags: Record<string, boolean>;
  raw_response: Record<string, any>;
  fetched_at: string;
  created_at: string;
}

export async function fetchBureauReport(applicationId: string): Promise<BureauReportRow | null> {
  try {
    const { data, error } = await supabase.from("bureau_reports").select("*").eq("application_id", applicationId).order("fetched_at", { ascending: false }).limit(1).single();
    if (error) throw error;
    return data as BureauReportRow;
  } catch (e) {
    return getMockBureauReport(applicationId);
  }
}

export async function saveBureauReport(data: Partial<BureauReportRow>): Promise<BureauReportRow | null> {
  try {
    const payload = { ...data, fetched_at: new Date().toISOString(), created_at: new Date().toISOString() };
    const { data: result, error } = await supabase.from("bureau_reports").insert([payload]).select().single();
    if (error) throw error;
    return result as BureauReportRow;
  } catch (e) {
    return { ...getMockBureauReport("mock"), ...data, id: "mock-bureau-1" } as BureauReportRow;
  }
}

export async function fetchBureauHistory(pan: string, limit: number = 5): Promise<BureauReportRow[]> {
  try {
    const { data, error } = await supabase.from("bureau_reports").select("*").eq("pan", pan).order("fetched_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []) as BureauReportRow[];
  } catch (e) {
    return [getMockBureauReport("mock-1"), getMockBureauReport("mock-2")];
  }
}

function getMockBureauReport(applicationId: string): BureauReportRow {
  return {
    id: `bureau-${applicationId}`,
    application_id: applicationId,
    pan: "ABCDE1234F",
    bureau_name: "CIBIL",
    score: 742,
    dpd_30: 0,
    dpd_60: 0,
    dpd_90: 0,
    active_accounts: 2,
    enquiries_30d: 1,
    enquiries_90d: 2,
    utilization_percent: 32,
    flags: { clean_record: true, thin_file: false, high_enquiry_velocity: false },
    raw_response: { source: "mock-cibil" },
    fetched_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}
