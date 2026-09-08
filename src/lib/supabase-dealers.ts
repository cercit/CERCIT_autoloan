import { supabase } from "./supabase";

export interface DealerRow {
  id: string;
  name: string;
  oem: string;
  city: string;
  state: string;
  tier: "A" | "B" | "C";
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  active: boolean;
  total_applications: number;
  approval_rate: number;
  address?: string;
  created_at: string;
  updated_at: string;
}

const MOCK_DEALERS: DealerRow[] = [
  { id: "d1", name: "Maruti Arena Mumbai West", oem: "Maruti Suzuki", city: "Mumbai", state: "Maharashtra", tier: "A", contact_name: "Rajesh Patel", contact_phone: "+91 9876543210", active: true, total_applications: 234, approval_rate: 78.5, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d2", name: "Hyundai Motor Plaza", oem: "Hyundai", city: "Delhi", state: "Delhi", tier: "A", contact_name: "Anjali Mehta", contact_phone: "+91 9876543211", active: true, total_applications: 189, approval_rate: 72.3, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d3", name: "Tata Motors Bangalore", oem: "Tata Motors", city: "Bangalore", state: "Karnataka", tier: "B", contact_name: "Kiran Rao", active: true, total_applications: 156, approval_rate: 65.4, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d4", name: "Mahindra First Choice", oem: "Mahindra", city: "Pune", state: "Maharashtra", tier: "B", contact_name: "Suresh Jadhav", active: true, total_applications: 98, approval_rate: 68.0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d5", name: "Kia Motors Chennai", oem: "Kia", city: "Chennai", state: "Tamil Nadu", tier: "A", contact_name: "Priya Venkatesh", contact_email: "contact@kia-chennai.in", active: true, total_applications: 67, approval_rate: 81.2, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d6", name: "Maruti Nexa Delhi", oem: "Maruti Suzuki", city: "Delhi", state: "Delhi", tier: "B", contact_phone: "+91 9876543215", active: true, total_applications: 112, approval_rate: 70.1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d7", name: "Hyundai Elite Hyderabad", oem: "Hyundai", city: "Hyderabad", state: "Telangana", tier: "B", active: false, total_applications: 45, approval_rate: 59.0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d8", name: "Tata Motors Pune", oem: "Tata Motors", city: "Pune", state: "Maharashtra", tier: "C", contact_name: "Vikram Joshi", active: true, total_applications: 34, approval_rate: 62.5, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d9", name: "Mahindra Commercial Chennai", oem: "Mahindra", city: "Chennai", state: "Tamil Nadu", tier: "A", contact_email: "info@mahindra-chennai.in", active: true, total_applications: 78, approval_rate: 74.8, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "d10", name: "Maruti Arena Bangalore", oem: "Maruti Suzuki", city: "Bangalore", state: "Karnataka", tier: "A", contact_phone: "+91 9876543222", active: true, total_applications: 201, approval_rate: 77.3, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

export async function fetchDealers(filters?: { tier?: string; city?: string; state?: string; active?: boolean; limit?: number; offset?: number }): Promise<DealerRow[]> {
  try {
    let query = supabase.from("dealers").select("*");
    if (filters?.tier) query = query.eq("tier", filters.tier);
    if (filters?.city) query = query.eq("city", filters.city);
    if (filters?.state) query = query.eq("state", filters.state);
    if (filters?.active !== undefined) query = query.eq("active", filters.active);
    query = query.order("name");
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DealerRow[];
  } catch (e) {
    return MOCK_DEALERS.filter((d) => {
      if (filters?.tier && d.tier !== filters.tier) return false;
      if (filters?.city && d.city !== filters.city) return false;
      if (filters?.state && d.state !== filters.state) return false;
      if (filters?.active !== undefined && d.active !== filters.active) return false;
      return true;
    }).slice(filters?.offset || 0, (filters?.offset || 0) + (filters?.limit || 10));
  }
}

export async function fetchDealerById(id: string): Promise<DealerRow | null> {
  try {
    const { data, error } = await supabase.from("dealers").select("*").eq("id", id).single();
    if (error) throw error;
    return data as DealerRow;
  } catch (e) {
    return MOCK_DEALERS.find((d) => d.id === id) || null;
  }
}

export async function searchDealers(queryStr: string): Promise<DealerRow[]> {
  const q = queryStr.toLowerCase();
  return MOCK_DEALERS.filter((d) => d.name.toLowerCase().includes(q) || d.oem.toLowerCase().includes(q) || d.city.toLowerCase().includes(q));
}

export async function createDealer(dealer: Partial<DealerRow>): Promise<DealerRow> {
  const { data, error } = await supabase.from("dealers").insert([{ ...dealer, active: true, total_applications: 0, approval_rate: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]).select().single();
  if (error) return { ...MOCK_DEALERS[0], ...dealer, id: `d-new-${Date.now()}`, total_applications: 0, approval_rate: 0, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as DealerRow;
  return data as DealerRow;
}

export async function updateDealer(id: string, updates: Partial<DealerRow>): Promise<DealerRow | null> {
  try {
    const { data, error } = await supabase.from("dealers").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return data as DealerRow;
  } catch (e) {
    return null;
  }
}
