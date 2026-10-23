import { useEffect, useRef, useState, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getIdleTimeoutMinutes, markActive, lastActiveAt, noteIdleSignOut } from "@/lib/auth";
import { toast } from "sonner";

// The limit comes from the person's role at sign-in (036): 15 minutes for
// officers and managers, 10 for admin and the policy roles. Warn 2 minutes early.
//
// Idle time is measured against the clock, from the last activity saved in
// localStorage, not by a countdown: a countdown pauses while the laptop sleeps,
// slows down in a background tab and starts again when the tab is reopened, so
// people stayed signed in for hours. Activity in any tab counts for all tabs.
const WARNING_LEAD_MS = 2 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 1000;

export function useSessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const toastIdRef = useRef<string | number | undefined>(undefined);
  const signingOutRef = useRef(false);

  const clearToast = () => {
    if (toastIdRef.current !== undefined) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = undefined;
    }
  };

  const check = useCallback(async () => {
    if (signingOutRef.current) return;
    const limitMs = getIdleTimeoutMinutes() * 60 * 1000;
    const idleMs = Date.now() - lastActiveAt();
    if (idleMs >= limitMs) {
      signingOutRef.current = true;
      setShowWarning(false);
      clearToast();
      noteIdleSignOut();
      const { signOut } = await import("@/lib/auth");
      await signOut();
      window.location.replace(`${import.meta.env.BASE_URL}login`);
      return;
    }
    if (idleMs >= limitMs - WARNING_LEAD_MS) {
      setShowWarning(true);
      if (toastIdRef.current === undefined) {
        toastIdRef.current = toast.warning("Session expiring soon", {
          description: "Move your mouse or press a key to stay signed in.",
          duration: WARNING_LEAD_MS,
        });
      }
    } else {
      setShowWarning(false);
      clearToast();
    }
  }, []);

  const dismissWarning = useCallback(() => {
    markActive(true);
    void check();
  }, [check]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // First look on opening the page: a tab reopened after the limit signs out here.
    void check();
    const events = ["mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    const onActivity = () => {
      if (signingOutRef.current) return;
      markActive();
      if (toastIdRef.current !== undefined) void check();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { capture: true, passive: true }));
    const onWake = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(timer);
      clearToast();
    };
  }, [check]);

  return { showWarning, dismissWarning };
}
