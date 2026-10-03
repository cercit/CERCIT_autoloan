/**
 * Live figures for the staff page frame (fix list A1, A2, A6). These replace numbers
 * that used to be typed into app-shell.tsx: the "12" on Applications, the bell's
 * sample notifications, and the always-green "Automated Underwriting: Active".
 * Each returns null when it cannot be read, so the frame shows nothing rather
 * than a guess.
 *
 * Signed-in staff can't read `applications` or `audit_events` directly (privacy
 * rules), so the badge and the bell come from one database function,
 * fn_staff_frame_summary (sql/060), fetched once per page load and shared.
 */

import type { NotificationItem } from "@/components/notification-dropdown";
import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

const sampleMode = () => !isSupabaseConfigured || isDemoMode();

type FrameSummary = {
  waiting: number;
  events: { id: string; event_type: string; created_at: string; application_id: string | null }[];
};

let summary: Promise<FrameSummary | null> | null = null;

function frameSummary(): Promise<FrameSummary | null> {
  if (!summary) {
    summary = Promise.resolve(supabase.rpc("fn_staff_frame_summary")).then(({ data, error }) =>
      error || !data ? null : (data as FrameSummary),
    );
    // the next page asks again, so the badge follows the work
    void summary.finally(() => setTimeout(() => (summary = null), 5000));
  }
  return summary;
}

/**
 * Real cases waiting for a person. Synthetic cases are left out: they are the
 * simulated book, not work anyone has to pick up. The demo login counts no real
 * customers' cases.
 */
export async function getWaitingCount(): Promise<number | null> {
  if (sampleMode()) return null;
  const s = await frameSummary();
  return s ? s.waiting : null;
}

// What each logged event means, said plainly.
const EVENT_TEXT: Record<string, { title: string; type: NotificationItem["type"] }> = {
  APPLICATION_CREATED: { title: "New application started", type: "info" },
  APPLICATION_SUBMITTED: { title: "Application submitted", type: "info" },
  DOCUMENT_UPLOADED: { title: "Document uploaded", type: "info" },
  DETAILS_CONFIRMED: { title: "Customer confirmed their details", type: "info" },
  AUTO_DOC_REQUESTED: { title: "A document was sent back to the customer", type: "warning" },
  FACE_MATCH_CHECKED: { title: "Face match checked", type: "info" },
  APPLICATION_ASSESSED: { title: "Credit checks finished", type: "success" },
  ENGINE_DECISION: { title: "Engine recommendation ready", type: "success" },
  DECISION_GENERATED: { title: "Engine recommendation ready", type: "success" },
  OFFICER_DECISION: { title: "Officer recorded a decision", type: "success" },
  OFFICER_ACCEPT_DOC: { title: "Officer accepted a document", type: "success" },
  LOAN_DISBURSED: { title: "Loan disbursed", type: "success" },
  USER_CREATED: { title: "Staff login added", type: "info" },
  USER_CHANGED: { title: "Staff login changed", type: "info" },
  USER_SUSPENDED: { title: "Staff login suspended", type: "warning" },
};

const SEEN_KEY = "cercit_notifications_seen_at";

function seenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function markNotificationsSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* private window: the count simply stays */
  }
}

/**
 * The latest real events from the audit log (last 14 days, newest first, up to 12).
 * "Read" means older than the last time this browser pressed "Mark all read".
 */
export async function getRecentNotifications(): Promise<NotificationItem[] | null> {
  if (sampleMode()) return null;
  const s = await frameSummary();
  if (!s) return null;
  const seen = seenAt();
  return s.events.map((e) => {
    const text = EVENT_TEXT[e.event_type] ?? { title: e.event_type, type: "info" as const };
    const day = new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return {
      id: e.id,
      type: text.type,
      title: text.title,
      message: e.application_id ? `Application ${e.application_id} · ${day}` : day,
      timestamp: e.created_at,
      read: new Date(e.created_at).getTime() <= seen,
    };
  });
}

/**
 * Whether automatic checking is on (Document checks page: "Check documents
 * automatically" and "Run the credit checks by itself"). null when this login cannot
 * read the settings, so the frame hides the pill instead of claiming either way.
 */
export async function getAutomationStatus(): Promise<{ active: boolean; label: string } | null> {
  if (sampleMode()) return { active: true, label: "Automated Underwriting: Active" };
  const { data, error } = await supabase.rpc("fn_staff_auto_rules");
  if (error || !data) return null;
  const s = (data as { settings?: { enabled?: boolean; auto_credit_checks?: boolean } }).settings;
  if (!s) return null;
  if (s.enabled && s.auto_credit_checks) return { active: true, label: "Automated Underwriting: Active" };
  if (s.enabled) return { active: true, label: "Automatic document checks: On" };
  return { active: false, label: "Automated Underwriting: Off" };
}
