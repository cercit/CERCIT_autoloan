import { useEffect, useId, useRef, useState } from "react";
import { EXPRESSION_CAPTIONS, FACES, type CarExpression } from "./expressions";

let recentDrive = 0;
let recentDriveAt = 0;

export type CarCharacterProps = {
  expression?: CarExpression;
  className?: string;
  onExpressionChange?: (expression: CarExpression) => void;
};

const mouths = {
  neutral: "M 216 186 Q 242 188 268 186",
  smile: "M 210 178 Q 242 210 274 178",
  wide: "M 206 176 Q 242 220 278 176 Q 242 203 206 176 Z",
  frown: "M 213 200 Q 242 165 271 200",
  open: "M 224 175 Q 242 169 260 175 Q 267 207 242 208 Q 217 207 224 175 Z",
  shock: "M 229 177 Q 242 166 255 177 Q 265 212 242 214 Q 219 212 229 177 Z",
  confused: "M 212 193 Q 228 179 242 190 Q 255 201 274 178",
  sleepy: "M 225 190 Q 242 197 259 190",
};

function Eye({ x, y, width, height, pupilX, pupilY, pupilScale, closed, happy, sleepy, clipId }: {
  x: number; y: number; width: number; height: number; pupilX: number; pupilY: number; pupilScale: number; closed: boolean; happy: boolean; sleepy: boolean; clipId: string;
}) {
  return (
    <g>
      <defs><clipPath id={clipId}><ellipse cx={x} cy={y} rx={width} ry={height} /></clipPath></defs>
      <ellipse className="car-eye" cx={x} cy={y} rx={width} ry={height} />
      <g clipPath={`url(#${clipId})`}>
        <g className="car-pupil" transform={`translate(${pupilX} ${pupilY})`}>
          <ellipse className="car-iris" cx={x} cy={y + 3} rx={13 * pupilScale} ry={17 * pupilScale} />
          <ellipse className="car-pupil-core" cx={x} cy={y + 3} rx={7 * pupilScale} ry={12 * pupilScale} />
          <circle className="car-catchlight" cx={x - 5} cy={y - 5} r="4.2" />
          <circle className="car-catchlight-small" cx={x + 5} cy={y + 9} r="2" />
        </g>
      </g>
      {sleepy && !closed && <path className="car-sleepy-lid" d={`M ${x - width + 2} ${y - 3} Q ${x} ${y + 8} ${x + width - 2} ${y - 3}`} />}
      {happy && !closed && <path className="car-happy-eye" d={`M ${x - width + 3} ${y + 2} Q ${x} ${y - 18} ${x + width - 3} ${y + 2}`} />}
      <ellipse className="car-eyelid" cx={x} cy={y} rx={width + 1} ry={height + 1} style={{ opacity: closed ? 1 : 0 }} />
      {closed && <path className="car-lid-line" d={`M ${x - width + 3} ${y} Q ${x} ${y + 4} ${x + width - 3} ${y}`} />}
    </g>
  );
}

export function CarCharacter({ expression = "IDLE", className = "", onExpressionChange }: CarCharacterProps) {
  const id = useId().replace(/:/g, "");
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [temporary, setTemporary] = useState<CarExpression | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerAt = useRef(0);
  const driveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let timeout: ReturnType<typeof setTimeout>;
    let closeTimeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        setBlink(true);
        closeTimeout = setTimeout(() => { setBlink(false); schedule(); }, 140);
      }, 3000 + Math.random() * 4200);
    };
    schedule();
    return () => { clearTimeout(timeout); clearTimeout(closeTimeout); };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const move = (event: PointerEvent) => {
      pointerAt.current = Date.now();
      const x = (event.clientX / window.innerWidth - 0.5) * 16;
      const y = (event.clientY / window.innerHeight - 0.5) * 10;
      setGaze({ x: Math.max(-8, Math.min(8, x)), y: Math.max(-5, Math.min(5, y)) });
    };
    window.addEventListener("pointermove", move, { passive: true });
    const drift = window.setInterval(() => {
      if (Date.now() - pointerAt.current > 3500) {
        setGaze({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 3 });
      }
    }, 3300);
    return () => { window.removeEventListener("pointermove", move); window.clearInterval(drift); };
  }, [reducedMotion]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setTemporary(null);
  }, [expression]);

  useEffect(() => {
    const element = driveRef.current;
    if (!element || reducedMotion) {
      element?.style.removeProperty("--drive");
      return;
    }

    let frame = 0;
    let speed = 0;
    let target = 0;
    let lastFrame = 0;
    let lastScroll = window.scrollY;
    let lastScrollTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - (lastFrame || time)) / 1000, 0.05);
      lastFrame = time;
      target *= Math.exp(-3.8 * dt);
      speed += (target - speed) * (1 - Math.exp(-11 * dt));
      element.style.setProperty("--drive", speed.toFixed(3));
      element.classList.toggle("is-driving", speed > 0.08);
      if (speed > 0.005 || target > 0.005) frame = requestAnimationFrame(animate);
      else { frame = 0; element.style.setProperty("--drive", "0"); element.classList.remove("is-driving"); }
    };
    const accelerate = (amount: number) => {
      target = Math.max(target, Math.min(1, amount));
      if (target > recentDrive || performance.now() - recentDriveAt > 100) {
        recentDrive = target;
        recentDriveAt = performance.now();
      }
      if (!frame) { lastFrame = 0; frame = requestAnimationFrame(animate); }
    };
    const onWheel = (event: WheelEvent) => {
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      accelerate(Math.abs(pixels) / 180);
    };
    const onScroll = () => {
      const now = performance.now();
      const delta = Math.abs(window.scrollY - lastScroll);
      const elapsed = Math.max(16, now - lastScrollTime);
      accelerate(delta / elapsed / 2.5);
      lastScroll = window.scrollY;
      lastScrollTime = now;
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    if (performance.now() - recentDriveAt < 800) {
      accelerate(recentDrive * Math.exp(-3.8 * (performance.now() - recentDriveAt) / 1000));
    }
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      element.style.removeProperty("--drive");
      element.classList.remove("is-driving");
    };
  }, [reducedMotion]);

  const flash = (next: CarExpression, duration: number) => {
    if (timer.current) clearTimeout(timer.current);
    setTemporary(next);
    onExpressionChange?.(next);
    timer.current = setTimeout(() => { setTemporary(null); onExpressionChange?.(expression); }, duration);
  };

  const current = temporary ?? expression;
  const face = FACES[current];
  const privateGaze = current === "LOOKING_AWAY";
  const closed = blink || current === "BLINK";
  const intentionalGaze = privateGaze || current === "THINKING" || current === "SAD" || current === "SLEEPY" || current === "SHOCKED" || current === "CONFUSED";
  const pupilX = Math.max(-23, Math.min(23, face.pupilX + (intentionalGaze ? 0 : gaze.x)));
  const pupilY = Math.max(-12, Math.min(12, face.pupilY + (intentionalGaze ? 0 : gaze.y)));

  return (
    <div ref={driveRef} className={`car-character car-expression--${current.toLowerCase().replaceAll("_", "-")} ${className}`}>
      <div
        className="car-interaction"
        onPointerEnter={() => { if (expression === "IDLE" && !temporary) setTemporary("SEEING"); }}
        onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setTemporary(null), 450); }}
        onClick={(event) => { if (event.detail === 1) flash("WOW", 850); }}
        onDoubleClick={() => flash("CONFUSED", 1100)}
        aria-label="Interactive car character"
      >
        <svg className="car-svg" viewBox="0 0 484 350" role="presentation" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" className="car-metal-light"/><stop offset="0.42" className="car-metal-mid"/><stop offset="0.76" className="car-metal-dark"/><stop offset="1" className="car-metal-edge"/></linearGradient>
            <linearGradient id={`${id}-hood`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="car-hood-light"/><stop offset="1" className="car-hood-dark"/></linearGradient>
            <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" className="car-glass-top"/><stop offset="1" className="car-glass-bottom"/></linearGradient>
            <linearGradient id={`${id}-lamp`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="car-lamp-start"/><stop offset="1" className="car-lamp-end"/></linearGradient>
          </defs>
          <g className="car-speed-lines">
            <path d="M 14 190 H 75 M 5 211 H 57 M 8 242 H 45 M 410 190 H 470 M 431 211 H 479 M 439 242 H 476" />
            <path d="M 20 286 H 55 M 429 286 H 464" />
          </g>
          <ellipse className="car-shadow" cx="242" cy="337" rx="181" ry="12" />
          <g className="car-body-motion" style={{ transform: `translateY(${face.bodyY}px) rotate(${face.bodyRotate}deg)` }}>
            <path className="car-wheel" d="M 72 270 L 123 270 L 123 317 Q 121 340 105 340 L 89 340 Q 73 337 72 316 Z" />
            <path className="car-wheel" d="M 361 270 L 412 270 L 412 316 Q 411 337 395 340 L 379 340 Q 363 340 361 317 Z" />
            <path className="car-wheel-shine" d="M 80 307 L 80 321 Q 82 331 91 332 M 404 307 L 404 321 Q 402 331 393 332" />
            <path className="car-side" fill={`url(#${id}-metal)`} d="M 47 212 Q 54 180 89 175 L 102 112 Q 111 59 156 52 Q 239 30 326 52 Q 372 60 382 112 L 396 174 Q 429 181 437 213 L 451 272 Q 451 301 422 308 L 62 308 Q 33 301 33 272 Z" />
            <path className="car-roof-edge" d="M 95 177 L 107 109 Q 117 67 160 59 Q 243 41 325 59 Q 366 67 377 110 L 389 177" />
            <path className="car-windshield" fill={`url(#${id}-glass)`} d="M 109 166 L 124 111 Q 132 83 163 75 Q 240 58 319 75 Q 351 81 360 111 L 375 166 Q 242 184 109 166 Z" />
            <path className="car-glass-highlight" d="M 125 108 Q 139 78 186 76 L 152 163 L 116 163 Z" />
            <path className="car-glass-highlight-two" d="M 285 71 L 310 74 Q 347 79 359 115 L 370 162 L 345 165 Z" />
            <path className="car-windshield-bottom" d="M 108 167 Q 242 185 376 167" />
            <path className="car-hood" fill={`url(#${id}-hood)`} d="M 90 178 Q 242 199 394 178 Q 421 183 430 217 L 439 256 Q 242 285 45 256 L 54 217 Q 62 184 90 178 Z" />
            <path className="car-hood-line" d="M 108 188 Q 242 210 376 188" />
            <path className="car-hood-sheen" d="M 69 221 Q 242 244 415 221" />
            <path className="car-lamp-housing" d="M 56 216 Q 77 203 112 215 L 137 241 Q 96 252 52 238 Z" />
            <path className="car-lamp-housing" d="M 428 216 Q 407 203 372 215 L 347 241 Q 388 252 432 238 Z" />
            <path className="car-headlight" fill={`url(#${id}-lamp)`} d="M 60 220 Q 82 210 109 220 L 125 236 Q 89 243 57 233 Z" />
            <path className="car-headlight" fill={`url(#${id}-lamp)`} d="M 424 220 Q 402 210 375 220 L 359 236 Q 395 243 427 233 Z" />
            <path className="car-headlight-core" d="M 63 225 Q 85 218 105 225" />
            <path className="car-headlight-core" d="M 421 225 Q 399 218 379 225" />
            <path className="car-bumper" fill={`url(#${id}-metal)`} d="M 40 253 Q 242 282 444 253 L 451 272 Q 451 301 422 308 L 62 308 Q 33 301 33 272 Z" />
            <path className="car-bumper-edge" d="M 43 263 Q 242 288 441 263" />
            <path className="car-grille" d="M 143 271 Q 242 282 341 271 L 328 296 Q 242 307 156 296 Z" />
            <path className="car-grille-line" d="M 161 279 Q 242 288 323 279 M 167 287 Q 242 295 317 287" />
            <path className="car-lower-trim" d="M 67 301 Q 242 315 417 301" />
            <g className="car-face">
              <g className="car-brow" style={{ transform: `translateY(${face.browLeftY}px) rotate(${face.browLeftRotate}deg)`, transformOrigin: "180px 110px" }}><path d="M 151 110 Q 179 99 208 109" /></g>
              <g className="car-brow" style={{ transform: `translateY(${face.browRightY}px) rotate(${face.browRightRotate}deg)`, transformOrigin: "304px 110px" }}><path d="M 276 109 Q 305 99 333 110" /></g>
              <Eye clipId={`${id}-left-eye`} x={181} y={139} width={face.eyeWidth} height={face.eyeHeight} pupilX={pupilX + (current === "CONFUSED" ? -4 : 0)} pupilY={pupilY} pupilScale={face.pupilScale} closed={closed} happy={current === "HAPPY"} sleepy={current === "SLEEPY"} />
              <Eye clipId={`${id}-right-eye`} x={303} y={139} width={face.eyeWidth} height={current === "CONFUSED" ? 12 : face.eyeHeight} pupilX={pupilX + (current === "CONFUSED" ? 5 : 0)} pupilY={pupilY} pupilScale={face.pupilScale} closed={closed} happy={current === "HAPPY"} sleepy={current === "SLEEPY"} />
              <path className={`car-mouth car-mouth--${face.mouth}`} d={mouths[face.mouth]} />
              {(face.mouth === "wide" || face.mouth === "open") && <path className="car-tongue" d="M 230 198 Q 242 187 254 198" />}
              {current === "HAPPY" && <g className="car-cheeks"><path d="M 124 182 l -9 -7 M 130 177 l -4 -10 M 354 182 l 9 -7 M 348 177 l 4 -10" /></g>}
              {current === "SAD" && <g className="car-tears"><path d="M 155 163 Q 146 183 155 187 Q 165 184 155 163 Z" /><path d="M 328 163 Q 320 183 329 187 Q 339 184 328 163 Z" /></g>}
              {current === "CONFUSED" && <g className="car-confusion"><path d="M 380 107 Q 391 95 383 88 Q 374 81 367 90 M 382 119 l 0 2" /></g>}
              {current === "IRRITATED" && <g className="car-frustration"><path d="M 105 118 l -12 -10 M 101 131 l -17 -1 M 379 118 l 12 -10 M 383 131 l 17 -1" /></g>}
              {current === "SHOCKED" && <g className="car-shock-lines"><path d="M 119 82 l -13 -15 M 135 73 l -5 -19 M 365 82 l 13 -15 M 349 73 l 5 -19" /></g>}
              {current === "WOW" && <g className="car-wow-stars"><path d="M 90 109 l 0 -13 M 83 102 l 14 0 M 396 105 l 0 -13 M 389 98 l 14 0" /></g>}
              {current === "THINKING" && <g className="car-thought"><circle cx="371" cy="185" r="3" /><circle cx="385" cy="175" r="4.5" /><circle cx="404" cy="158" r="6" /></g>}
              {current === "SLEEPY" && <g className="car-snooze"><path d="M 377 114 h 15 l -15 16 h 15 M 399 86 h 18 l -18 19 h 18" /></g>}
            </g>
          </g>
        </svg>
      </div>
      <p className="car-caption" role="status" aria-live="polite" aria-atomic="true">{EXPRESSION_CAPTIONS[current]}</p>
    </div>
  );
}