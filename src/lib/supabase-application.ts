import { supabase } from "./supabase";

export interface ApplicationRow {
  id: string;
  application_id: string;
  applicant_name: string;
  applicant_age: number;
  pan: string;
  aadhaar_masked: string;
  employer_name: string;
  employer_tier: number;
  gross_income: number;
  net_income: number;
  existing_emi_total: number;
  proposed_emi: number;
  foir_percent: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_segment: string;
  ex_showroom: number;
  on_road: number;
  loan_amount: number;
  tenure_months: number;
  rate_percent: number;
  bureau_score: number;
  bureau_name: string;
  ltv_percent: number;
  policy_decision: "approve" | "review" | "decline";
  policy_score: number;
  risk_grade: string;
  risk_score: number;
  recommendation: string;
  status: "pending" | "approved" | "declined" | "review";
  created_at: string;
  updated_at: string;
}

export async function fetchApplications(filters?: { status?: string; limit?: number; offset?: number }): Promise<ApplicationRow[]> {
  try {
    let query = supabase.from("applications").select("*");
    if (filters?.status) query = query.eq("status", filters.status);
    query = query.order("created_at", { ascending: false });
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ApplicationRow[];
  } catch (e) {
    return getMockApplications(filters);
  }
}

export async function fetchApplicationById(id: string): Promise<ApplicationRow | null> {
  try {
    const { data, error } = await supabase.from("applications").select("*").eq("id", id).single();
    if (error) throw error;
    return data as ApplicationRow;
  } catch (e) {
    const mock = getMockApplications();
    return mock.find((a) => a.id === id) || null;
  }
}

export async function createApplication(app: Partial<ApplicationRow>): Promise<ApplicationRow> {
  try {
    const { data, error } = await supabase.from("applications").insert([{
      ...app,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: app.status || "pending",
    }]).select().single();
    if (error) throw error;
    return data as ApplicationRow;
  } catch (e) {
    return getMockApplication(app);
  }
}

export async function updateApplication(id: string, updates: Partial<ApplicationRow>): Promise<ApplicationRow | null> {
  try {
    const { data, error } = await supabase.from("applications").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return data as ApplicationRow;
  } catch (e) {
    return null;
  }
}

export async function updateApplicationStatus(id: string, status: string): Promise<ApplicationRow | null> {
  return updateApplication(id, { status: status as any });
}

function getMockApplications(filters?: { status?: string; limit?: number; offset?: number }): ApplicationRow[] {
  const mockNames = [
    { name: "Sameer Mittimani", pan: "ABCDE1234F", aadhaar: "XXXX XXXX 5678" },
    { name: "Rajeev Menon", pan: "ABCDF5678G", aadhaar: "XXXX XXXX 9012" },
    { name: "Priya Sharma", pan: "ABCPS1234H", aadhaar: "XXXX XXXX 3456" },
    { name: "Arun Kumar", pan: "ABCDK7890J", aadhaar: "XXXX XXXX 7890" },
    { name: "Deepa Iyer", pan: "ABCDE5678K", aadhaar: "XXXX XXXX 2345" },
  ];

  const results: ApplicationRow[] = mockNames.map((m, i) => ({
    id: `mock-${i + 1}`,
    application_id: `APP-20260907-${String(i + 1).padStart(4, "0")}`,
    applicant_name: m.name,
    applicant_age: 30 + i * 5,
    pan: m.pan,
    aadhaar_masked: m.aadhaar,
    employer_name: i % 3 === 0 ? "Sundaram Finance" : i % 2 === 0 ? "HDFC Bank" : "SBI",
    employer_tier: i % 2 === 0 ? 3 : 2,
    gross_income: 65000 + i * 15000,
    net_income: 45500 + i * 10500,
    existing_emi_total: 12000 + i * 3000,
    proposed_emi: 8500 + i * 1500,
    foir_percent: 42 + i * 3,
    vehicle_make: i % 2 === 0 ? "Maruti Suzuki" : "Hyundai",
    vehicle_model: i % 2 === 0 ? "Swift" : "Creta",
    vehicle_segment: i % 3 === 0 ? "car" : i % 3 === 1 ? "suv" : "lcv",
    ex_showroom: 750000 + i * 120000,
    on_road: 860000 + i * 135000,
    loan_amount: 680000 + i * 95000,
    tenure_months: 60,
    rate_percent: 9.5 + i * 0.25,
    bureau_score: 720 + (i % 3 === 1 ? -80 : 0),
    bureau_name: "CIBIL",
    ltv_percent: 78 + i * 3,
    policy_decision: i % 4 === 0 ? "decline" : i % 3 === 0 ? "review" : "approve",
    policy_score: i % 4 === 0 ? 35 : i % 3 === 0 ? 55 : 92,
    risk_grade: i % 4 === 0 ? "E" : i % 3 === 0 ? "C" : "B",
    risk_score: 780 - i * 40,
    recommendation: i % 4 === 0 ? "Declined due to high FOIR and low bureau score" : i % 3 === 0 ? "Requires manual review — policy flags present" : "Approved — all checks passed",
    status: i % 4 === 0 ? "declined" : i % 3 === 0 ? "review" : "approved",
    created_at: new Date(2026, 7, 1 + i).toISOString(),
    updated_at: new Date(2026, 7, 5 + i).toISOString(),
  }));

  let filtered = results;
  if (filters?.status) filtered = filtered.filter((a) => a.status === filters.status);
  if (filters?.limit) filtered = filtered.slice(filters.offset || 0, (filters.offset || 0) + filters.limit);
  else if (filters?.offset) filtered = filtered.slice(filters.offset, filters.offset + 20);
  return filtered;
}

function getMockApplication(app: Partial<ApplicationRow>): ApplicationRow {
  const base = getMockApplications()[0];
  return { ...base, ...app, id: app.id || `mock-${Date.now()}`, updated_at: new Date().toISOString() };
}
