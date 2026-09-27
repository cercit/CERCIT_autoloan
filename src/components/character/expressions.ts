export const EXPRESSIONS = [
  "IDLE", "SEEING", "WOW", "LOOKING_AWAY", "CONFUSED", "IRRITATED",
  "HAPPY", "SAD", "SHOCKED", "THINKING", "SLEEPY", "BLINK",
] as const;

export type CarExpression = (typeof EXPRESSIONS)[number];

export const EXPRESSION_LABELS: Record<CarExpression, string> = {
  IDLE: "Idle", SEEING: "Seeing", WOW: "Wow", LOOKING_AWAY: "Looking away",
  CONFUSED: "Confused", IRRITATED: "Irritated", HAPPY: "Happy", SAD: "Sad",
  SHOCKED: "Shocked", THINKING: "Thinking", SLEEPY: "Sleepy", BLINK: "Blink",
};

export const EXPRESSION_CAPTIONS: Record<CarExpression, string> = {
  IDLE: "Ready when you are.",
  SEEING: "I'm here with you.",
  WOW: "That's a nice step forward.",
  LOOKING_AWAY: "I'll give you some privacy.",
  CONFUSED: "Let's take another look.",
  IRRITATED: "Something didn't go as expected.",
  HAPPY: "Looking good so far.",
  SAD: "We can try again.",
  SHOCKED: "Oh, that was unexpected.",
  THINKING: "Just a moment.",
  SLEEPY: "Take your time.",
  BLINK: "Still here with you.",
};

type Face = {
  eyeHeight: number;
  eyeWidth: number;
  pupilX: number;
  pupilY: number;
  pupilScale: number;
  browLeftY: number;
  browRightY: number;
  browLeftRotate: number;
  browRightRotate: number;
  mouth: "neutral" | "smile" | "wide" | "frown" | "open" | "shock" | "confused" | "sleepy";
  bodyRotate: number;
  bodyY: number;
};

const idle: Face = {
  eyeHeight: 24, eyeWidth: 35, pupilX: 0, pupilY: 0, pupilScale: 1,
  browLeftY: 0, browRightY: 0, browLeftRotate: 0, browRightRotate: 0,
  mouth: "smile", bodyRotate: 0, bodyY: 0,
};

export const FACES: Record<CarExpression, Face> = {
  IDLE: idle,
  SEEING: { ...idle, eyeHeight: 30, eyeWidth: 37, pupilScale: 1.1, browLeftY: -10, browRightY: -10, mouth: "smile", bodyY: -4 },
  WOW: { ...idle, eyeHeight: 37, eyeWidth: 39, pupilScale: 1.13, browLeftY: -18, browRightY: -18, mouth: "open", bodyY: -12, bodyRotate: 3 },
  LOOKING_AWAY: { ...idle, pupilX: -22, pupilY: -2, browLeftY: 0, browRightY: 4, mouth: "neutral", bodyRotate: -6, bodyY: 2 },
  CONFUSED: { ...idle, eyeHeight: 27, browLeftY: -16, browRightY: 7, browLeftRotate: -13, browRightRotate: -13, pupilX: 8, mouth: "confused", bodyRotate: -6, bodyY: 2 },
  IRRITATED: { ...idle, eyeHeight: 13, browLeftY: 8, browRightY: 8, browLeftRotate: 20, browRightRotate: -20, mouth: "frown", bodyY: 5, bodyRotate: 2 },
  HAPPY: { ...idle, eyeHeight: 12, browLeftY: -5, browRightY: -5, mouth: "wide", bodyY: -10, bodyRotate: -3 },
  SAD: { ...idle, eyeHeight: 19, pupilY: 7, browLeftY: 5, browRightY: 5, browLeftRotate: -19, browRightRotate: 19, mouth: "frown", bodyY: 9, bodyRotate: -3 },
  SHOCKED: { ...idle, eyeHeight: 42, eyeWidth: 40, pupilScale: 0.76, browLeftY: -21, browRightY: -21, mouth: "shock", bodyY: -11, bodyRotate: -2 },
  THINKING: { ...idle, pupilX: 12, pupilY: -10, browLeftY: -12, browRightY: 3, mouth: "sleepy", bodyRotate: 5, bodyY: -2 },
  SLEEPY: { ...idle, eyeHeight: 7, pupilY: 5, browLeftY: 8, browRightY: 8, mouth: "sleepy", bodyY: 8, bodyRotate: 2 },
  BLINK: { ...idle, eyeHeight: 2, mouth: "smile" },
};