import type { CarExpression } from "./expressions";

/**
 * What the customer did → how the car reacts. One place to change behaviour
 * (design brief sections 7–9). The car never reacts to a credit result.
 * `hold` = milliseconds before it returns to its resting expression;
 * 0 = stays until the next event.
 */
export const CHARACTER_EVENTS = {
  FORM_STARTED: { expression: "SEEING", hold: 2500 },
  SECTION_COMPLETED: { expression: "HAPPY", hold: 2200 },
  FIELD_INVALID: { expression: "CONFUSED", hold: 1800 },
  REQUIRED_FIELD_MISSING: { expression: "CONFUSED", hold: 1800 },
  OTP_STARTED: { expression: "THINKING", hold: 1500 },
  OTP_SUCCESS: { expression: "HAPPY", hold: 2000 },
  OTP_FAILED: { expression: "CONFUSED", hold: 1800 },
  CONSENT_GIVEN: { expression: "HAPPY", hold: 1500 },
  DOCUMENT_UPLOAD_STARTED: { expression: "THINKING", hold: 0 },
  DOCUMENT_UPLOAD_DONE: { expression: "HAPPY", hold: 1600 },
  DOCUMENT_REUPLOAD_NEEDED: { expression: "CONFUSED", hold: 2000 },
  CHECKLIST_COMPLETE: { expression: "WOW", hold: 2200 },
  QUOTE_LATER_CHOSEN: { expression: "IDLE", hold: 0 },
  APPLICATION_SUBMITTED: { expression: "WOW", hold: 2500 },
  NAVIGATED_BACK: { expression: "THINKING", hold: 1200 },
  APPLICATION_CANCELLED: { expression: "LOOKING_AWAY", hold: 2000 },
  TECHNICAL_ERROR: { expression: "IRRITATED", hold: 1500 },
  USER_IDLE: { expression: "SLEEPY", hold: 0 },
  // Scroll speed (Sameer, 27 Sep 2026): a quick flick surprises it, a fling shocks it.
  SCROLL_FAST: { expression: "WOW", hold: 900 },
  SCROLL_VERY_FAST: { expression: "SHOCKED", hold: 1100 },
} as const satisfies Record<string, { expression: CarExpression; hold: number }>;

export type CharacterEvent = keyof typeof CHARACTER_EVENTS;

/** After this long with no input the car gets sleepy. */
export const IDLE_AFTER_MS = 60_000;

/** Scroll speed (0…1) above which the scroll events fire. */
export const SCROLL_FAST_AT = 0.55;
export const SCROLL_VERY_FAST_AT = 0.9;
