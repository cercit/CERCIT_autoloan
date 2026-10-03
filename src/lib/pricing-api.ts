/**
 * Rate grid versions (sql/071, fix list G3): drafts, approval by a second
 * person, a start date, and history. Every call goes through a database
 * function and throws its error so the page can show it.
 */

import { supabase } from "./supabase";

export type GridBand = {
  band_label: string;
  score_band_min: number;
  score_band_max: number;
  rate_pct: number;
  rate_type: string;
  max_ltv_pct: number;
  max_foir_pct: number;
  max_tenure_months: number;
};

export type GridCategory = {
  category_code: "A" | "B" | "C";
  category_label: string;
  description: string;
  rate_loading_pct: number;
  max_ltv_pct: number;
  max_tenure_months: number;
  processing_fee_inr: number;
};

export type GridVersion = {
  id: string;
  product_code: string;
  version_no: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED";
  rationale: string | null;
  authored_by: string | null;
  authored_by_me: boolean;
  approved_by: string | null;
  approved_at: string | null;
  decision_note: string | null;
  effective_from: string | null;
  effective_to: string | null;
  bands: GridBand[];
  categories: GridCategory[];
  problems?: string[];
};

export type GridOverview = {
  product: string;
  products: { code: string; name: string; description: string | null; used_by_engine: boolean }[];
  in_force: GridVersion | null;
  open: GridVersion | null;
  approved_next: GridVersion | null;
  history: Pick<GridVersion, "id" | "version_no" | "status" | "rationale" | "authored_by" | "approved_by" | "effective_from" | "effective_to" | "decision_note">[];
  can_author: boolean;
  can_approve: boolean;
};

const fail = (e: { message?: string } | null, fallback: string) => new Error(e?.message || fallback);

export async function getGridOverview(product: string): Promise<GridOverview> {
  const { data, error } = await supabase.rpc("fn_rate_grid_overview", { p_product: product });
  if (error) throw fail(error, "Could not load the grid versions");
  return data as GridOverview;
}

export async function startDraft(product: string): Promise<void> {
  const { error } = await supabase.rpc("fn_rate_grid_draft_create", { p_product: product, p_rationale: null });
  if (error) throw fail(error, "Could not start a draft");
}

export async function saveDraft(id: string, bands: GridBand[], categories: GridCategory[]): Promise<GridVersion> {
  const { data, error } = await supabase.rpc("fn_rate_grid_draft_save", {
    p_version: id,
    p_bands: bands,
    p_categories: categories,
    p_rationale: null,
  });
  if (error) throw fail(error, "Could not save the draft");
  return data as GridVersion;
}

export async function submitDraft(id: string, effectiveFrom: string, rationale: string): Promise<void> {
  const { error } = await supabase.rpc("fn_rate_grid_submit", { p_version: id, p_effective_from: effectiveFrom, p_rationale: rationale });
  if (error) throw fail(error, "Could not send it for approval");
}

export async function withdrawDraft(id: string, discard: boolean): Promise<void> {
  const { error } = await supabase.rpc("fn_rate_grid_withdraw", { p_version: id, p_discard: discard });
  if (error) throw fail(error, "Could not withdraw it");
}

export async function decideGrid(id: string, approve: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc("fn_rate_grid_decide", { p_version: id, p_approve: approve, p_note: note || null });
  if (error) throw fail(error, "Could not record the decision");
}

export async function addProduct(code: string, name: string, description: string): Promise<void> {
  const { error } = await supabase.rpc("fn_rate_grid_product_create", { p_code: code, p_name: name, p_description: description || null });
  if (error) throw fail(error, "Could not add the product");
}
