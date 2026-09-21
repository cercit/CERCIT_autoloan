import { useEffect, useRef, useState, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

const TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_MS = 13 * 60 * 1000;

export function useSessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastIdRef = useRef<string | number | undefined>(undefined);

  const resetTimers = useCallback(() => {
    if (!isSupabaseConfigured) return;
    setShowWarning(false);
    if (toastIdRef.current !== undefined) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = undefined;
    }
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);
    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      toastIdRef.current = toast.warning("Session expiring soon", {
        description: "Move your mouse or press a key to stay signed in.",
        duration: 120000,
      });
    }, WARNING_MS);
    timerRef.current = setTimeout(async () => {
      setShowWarning(false);
      if (toastIdRef.current !== undefined) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = undefined;
      }
      const { signOut } = await import("@/lib/auth");
      await signOut();
      window.location.href = "/";
    }, TIMEOUT_MS);
  }, []);

  const dismissWarning = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    const handler = () => resetTimers();
    events.forEach((e) => window.addEventListener(e, handler));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (toastIdRef.current !== undefined) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = undefined;
      }
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
    };
  }, [resetTimers]);

  return { showWarning, dismissWarning };
}