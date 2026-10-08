import { supabase } from "./supabase";

export type Findability = "YES" | "MOSTLY" | "NO";
export type Profile = "LENDING" | "PRODUCT" | "STUDENT" | "HIRING" | "OTHER";

/** Sign-out feedback (086, 087). Every field is optional; at least one answer must be given. */
export interface FeedbackInput {
  profile: Profile | null;
  experience: number | null;
  findability: Findability | null;
  lost_where: string;
  needed: string;
  bugs: string;
  name: string;
  /** Email or LinkedIn link; only with contact_ok. */
  contact: string;
  contact_ok: boolean;
  page: string;
}

export interface FeedbackRow {
  id: string;
  created_at: string;
  role_name: string | null;
  experience: number | null;
  findability: string | null;
  lost_where: string | null;
  needed: string | null;
  bugs: string | null;
  page: string | null;
  profile: string | null;
  name: string | null;
  contact: string | null;
}

export const PROFILE_LABEL: Record<Profile, string> = {
  LENDING: "I work in lending or credit",
  PRODUCT: "I work in product or tech",
  STUDENT: "I'm a student",
  HIRING: "I hire or recruit",
  OTHER: "Something else",
};

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
