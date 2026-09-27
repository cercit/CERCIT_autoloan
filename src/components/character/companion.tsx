import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CarCharacter } from "./CarCharacter";
import { CHARACTER_EVENTS, IDLE_AFTER_MS, SCROLL_FAST_AT, SCROLL_VERY_FAST_AT, type CharacterEvent } from "./events";
import { EXPRESSION_CAPTIONS, type CarExpression } from "./expressions";
import "./character.css";


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
 * The car in the bottom-right corner: the front-facing cartoon car (Sameer's
 * choice, 27 Sep 2026). It animates its own driving from scroll speed; this
 * component adds the scroll emotions (a quick flick surprises it, a fling shocks it).
 */
function CornerCar({ expression, emit }: { expression: CarExpression; emit: (e: CharacterEvent) => void }) {
  const lastEvent = useRef(0);

  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const now = performance.now();
      const speed = Math.abs(window.scrollY - lastY) / Math.max(16, now - lastT) / 2.5; // ~0…1
      lastY = window.scrollY;
      lastT = now;
      if (now - lastEvent.current < 1500) return;
      if (speed >= SCROLL_VERY_FAST_AT) { lastEvent.current = now; emit("SCROLL_VERY_FAST"); }
      else if (speed >= SCROLL_FAST_AT) { lastEvent.current = now; emit("SCROLL_FAST"); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [emit]);

  return (
    <div className="corner-companion" aria-hidden="true">
      <CarCharacter expression={expression} />
    </div>
  );
}
