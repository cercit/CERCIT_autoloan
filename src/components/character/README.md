# CarCharacter

`<CarCharacter expression="THINKING" />` accepts one of the twelve stable names exported by `expressions.ts`. It defaults to `IDLE`. Pass `onExpressionChange` to observe temporary pointer responses. The drawing is hidden from assistive technology; a polite live caption provides the same feedback in text.

The SVG parts are independently drawn and animated. Pupils track the pointer within the eyes; a random timer blinks and gently drifts the gaze. When reduced motion is preferred, idle movement and eye tracking stop, while explicit expression changes and blinking remain available. This folder has no router, app state, backend, or external media dependency.

`<CarCharacter3D expression="HAPPY" />` is an optional 3D alternative. The preview uses the original front-facing SVG character, including its visible tyres, in both the stage and bottom corner. The 3D alternative accepts the same expression names and caption interface, with an independently animated face over a locally hosted CC0 Kenney hatchback model. It requires React Three Fiber and Drei. The host can place either version at its bottom-left or bottom-right corner.