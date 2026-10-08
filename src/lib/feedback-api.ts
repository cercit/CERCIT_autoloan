import { supabase } from "./supabase";

/** Sign-out feedback (086). Every field is optional; at least one must be given. */
export interface FeedbackInput {
  experience: number | null;
  findability: "YES" | "MOSTLY" | "NO" | null;
  needed: string;
  bugs: string;
  page: string;
}

export interface FeedbackRow {
  id: string;
  created_at: string;
  role_name: string | null;
  experience: number | null;
  findability: string | null;
  needed: string | null;
  bugs: string | null;
  page: string | null;
}

export async function submitFeedback(p: FeedbackInput): Promise<void> {
  const { error } = await supabase.rpc("fn_feedback_submit", { p });
  if (error) throw new Error(error.message);
}

/** Admin only: the newest feedback first. */
export async function listFeedback(limit = 50): Promise<FeedbackRow[]> {
  const { data, error } = await supabase.rpc("fn_feedback_list", { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackRow[];
}
