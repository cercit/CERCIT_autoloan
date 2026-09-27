import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CarCharacter } from "./CarCharacter";
import { CHARACTER_EVENTS, IDLE_AFTER_MS, SCROLL_FAST_AT, SCROLL_VERY_FAST_AT, type CharacterEvent } from "./events";
import { EXPRESSION_CAPTIONS, type CarExpression } from "./expressions";
import "./character.css";

// The 3D car downloads only on pages that show the companion.
const CarCharacter3D = lazy(() => import("./CarCharacter3D"));

type Ctx = {
  emit: (event: CharacterEvent) => void;
  /** Spread on any private input (OTP, PAN, Aadhaar, passwords): the car looks away while it is focused. */
  privateField: { onFocus: () => void; onBlur: () => void };
  /** Camera open (live photo): the car closes its eyes. */
  setCameraOpen: (open: boolean) => void;
};

const CharacterContext = createContext<Ctx>({
  emit: () => {},
  privateField: { onFocus: () => {}, onBlur: () => {} },
  setCameraOpen: () => {},
});

export const useCharacter = () => useContext(CharacterContext);

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Wraps a customer page: provides `useCharacter()` and shows the car fixed at the
 * bottom-right. Pages keep that corner clear (see `.companion-safe` in character.css).
 */
export function CharacterProvider({ children }: { children: ReactNode }) {
  const [flashExpr, setFlashExpr] = useState<CarExpression | null>(null);
  const [privateFocus, setPrivateFocus] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const emit = useCallback((event: CharacterEvent) => {
    const { expression, hold } = CHARACTER_EVENTS[event];
    clearTimeout(flashTimer.current);
    setFlashExpr(expression);
    if (hold > 0) flashTimer.current = setTimeout(() => setFlashExpr(null), hold);
  }, []);

  // Idle → sleepy; any input wakes it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
    };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    wake();
    return () => {
      clearTimeout(timer);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Priority: camera (eyes shut) > private field (looks away) > event flash > idle > resting.
  const expression: CarExpression = cameraOpen
    ? "BLINK"
    : privateFocus
      ? "LOOKING_AWAY"
      : (flashExpr ?? (idle ? "SLEEPY" : "IDLE"));

  const value = useMemo<Ctx>(
    () => ({
      emit,
      privateField: { onFocus: () => setPrivateFocus(true), onBlur: () => setPrivateFocus(false) },
      setCameraOpen,
    }),
    [emit],
  );

  return (
    <CharacterContext.Provider value={value}>
      {children}
      <CornerCar expression={expression} emit={emit} />
      {/* The same feedback in words, for screen readers (the drawing is hidden from them). */}
      <p className="sr-only" role="status" aria-live="polite">
        {privateFocus ? EXPRESSION_CAPTIONS.LOOKING_AWAY : ""}
      </p>
    </CharacterContext.Provider>
  );
}

/**
 * The car in the bottom-right corner. Owns the scroll-speed state so that
 * per-frame updates re-render only the car, never the page.
 */
function CornerCar({ expression, emit }: { expression: CarExpression; emit: (e: CharacterEvent) => void }) {
  const [drive, setDrive] = useState(0);
  const [use3d, setUse3d] = useState(false);
  const lastScrollEvent = useRef(0);

  // 3D when the device can: WebGL present and no reduced-motion preference.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setUse3d(!reduce && webglAvailable());
  }, []);

  // Scroll speed → drive (0…1), decaying smoothly; fast scrolling also sets an emotion.
  useEffect(() => {
    let frame = 0;
    let target = 0;
    let current = 0;
    let last = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - (last || t)) / 1000, 0.05);
      last = t;
      target *= Math.exp(-3.8 * dt);
      current += (target - current) * (1 - Math.exp(-11 * dt));
      setDrive(current < 0.01 ? 0 : current);
      frame = current > 0.005 || target > 0.005 ? requestAnimationFrame(tick) : 0;
      if (!frame) last = 0;
    };
    const push = (amount: number) => {
      target = Math.max(target, Math.min(1, amount));
      const now = performance.now();
      if (now - lastScrollEvent.current > 1500) {
        if (target >= SCROLL_VERY_FAST_AT) { lastScrollEvent.current = now; emit("SCROLL_VERY_FAST"); }
        else if (target >= SCROLL_FAST_AT) { lastScrollEvent.current = now; emit("SCROLL_FAST"); }
      }
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      const now = performance.now();
      const speed = Math.abs(window.scrollY - lastY) / Math.max(16, now - lastT);
      lastY = window.scrollY;
      lastT = now;
      push(speed / 2.5);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [emit]);

  const flat = <CarCharacter expression={expression} />;
  return (
    <div className="corner-companion" aria-hidden="true">
      {use3d ? (
        <Suspense fallback={flat}>
          <CarCharacter3D expression={expression} drive={drive} />
        </Suspense>
      ) : (
        flat
      )}
    </div>
  );
}
