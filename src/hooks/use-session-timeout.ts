import { useEffect, useRef, useState, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

const TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_MS = 13 * 60 * 1000;

export function useSessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetTimers = useCallback(() => {
    if (!isSupabaseConfigured) return;
    setShowWarning(false);
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);
    warningRef.current = setTimeout(() => setShowWarning(true), WARNING_MS);
    timerRef.current = setTimeout(async () => {
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
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
    };
  }, [resetTimers]);

  return { showWarning, dismissWarning };
}