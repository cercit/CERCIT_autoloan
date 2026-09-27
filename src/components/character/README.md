# CarCharacter

`<CarCharacter expression="THINKING" />` accepts one of the twelve stable names exported by `expressions.ts`. It defaults to `IDLE`. Pass `onExpressionChange` to observe temporary pointer responses. The drawing is hidden from assistive technology; a polite live caption provides the same feedback in text.

The SVG parts are independently drawn and animated. Pupils track the pointer within the eyes; a random timer blinks and gently drifts the gaze. When reduced motion is preferred, idle movement and eye tracking stop, while explicit expression changes and blinking remain available. This folder has no router, app state, backend, or external media dependency.

In cercit the car is shown by `companion.tsx`: fixed bottom-right on customer pages, reacting to the events in `events.ts` (privacy gestures, step done, errors, idle, scroll speed). The prototype's optional 3D version was tried and removed on 27 Sep 2026 — the front-facing cartoon car is the chosen look.
