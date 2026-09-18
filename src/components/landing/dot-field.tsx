import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/*
 * Interactive dot field for the hero.
 *
 * A dense grid of tiny dots is drawn on a canvas over the cockpit photo. Dots
 * sit brighter and denser toward the dashboard and road, and fade out into the
 * sky, so the field reads as light caught on the windscreen glass. The cursor
 * pushes nearby dots outward and lights them up; a click sends a ripple ring
 * through the field. Everything settles back and the loop stops when idle.
 */

interface Dot {
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** baseline brightness from the depth gradient plus a little noise */
  base: number;
}

interface Ripple {
  x: number;
  y: number;
  /** seconds since the click */
  t: number;
}

const SPACING = 11; // px between dots
const PUSH_RADIUS = 130;
const PUSH_STRENGTH = 26;
const RIPPLE_SPEED = 620; // px per second
const RIPPLE_LIFE = 1.5; // seconds
const RIPPLE_WIDTH = 46;
const RIPPLE_PUSH = 20;
const ALPHA_BUCKETS = 7;

export function DotField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let ripples: Ripple[] = [];
    let pointerX = -9999;
    let pointerY = -9999;
    let pointerOn = false;
    let raf = 0;
    let running = false;
    let lastTime = 0;
    let disposed = false;

    function build() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        // depth: faint in the sky, strongest across the dashboard and road
        const v = y / height;
        const depth = v < 0.28 ? 0.3 + (v / 0.28) * 0.24 : 0.54 + ((v - 0.28) / 0.72) * 0.46;
        for (let x = SPACING / 2; x < width; x += SPACING) {
          // soften the left edge where the headline sits
          const edge = Math.min(1, 0.34 + (x / (width * 0.42)) * 0.66);
          const jitter = 0.72 + ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.28;
          dots.push({
            ox: x,
            oy: y,
            x,
            y,
            vx: 0,
            vy: 0,
            base: depth * edge * jitter,
          });
        }
      }
      draw();
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      // bucket dots by brightness so we only switch fillStyle a handful of times
      const buckets: Dot[][] = Array.from({ length: ALPHA_BUCKETS }, () => []);
      const lit: Dot[] = [];

      for (const dot of dots) {
        let intensity = dot.base;
        if (pointerOn) {
          const dx = dot.x - pointerX;
          const dy = dot.y - pointerY;
          const dist = Math.hypot(dx, dy);
          if (dist < PUSH_RADIUS) {
            const falloff = 1 - dist / PUSH_RADIUS;
            intensity += falloff * falloff * 1.25;
          }
        }
        if (intensity > 0.92) {
          lit.push(dot);
          continue;
        }
        const index = Math.max(
          0,
          Math.min(ALPHA_BUCKETS - 1, Math.floor(intensity * ALPHA_BUCKETS)),
        );
        buckets[index]!.push(dot);
      }

      for (let i = 1; i < ALPHA_BUCKETS; i++) {
        const bucket = buckets[i]!;
        if (!bucket.length) continue;
        const alpha = (i / ALPHA_BUCKETS) * 0.78;
        ctx.fillStyle = `rgba(120, 178, 255, ${alpha.toFixed(3)})`;
        for (const dot of bucket) ctx.fillRect(dot.x - 0.7, dot.y - 0.7, 1.4, 1.4);
      }

      if (lit.length) {
        ctx.fillStyle = "rgba(186, 220, 255, 0.92)";
        ctx.shadowColor = "rgba(90, 165, 255, 0.85)";
        ctx.shadowBlur = 6;
        for (const dot of lit) ctx.fillRect(dot.x - 1.1, dot.y - 1.1, 2.2, 2.2);
        ctx.shadowBlur = 0;
      }
    }

    function step(now: number) {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
      lastTime = now;

      for (const ripple of ripples) ripple.t += dt;
      ripples = ripples.filter((r) => r.t < RIPPLE_LIFE);

      let moving = false;
      for (const dot of dots) {
        let targetX = dot.ox;
        let targetY = dot.oy;

        if (pointerOn) {
          const dx = dot.ox - pointerX;
          const dy = dot.oy - pointerY;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < PUSH_RADIUS) {
            const falloff = 1 - dist / PUSH_RADIUS;
            const push = falloff * falloff * PUSH_STRENGTH;
            targetX += (dx / dist) * push;
            targetY += (dy / dist) * push;
          }
        }

        for (const ripple of ripples) {
          const dx = dot.ox - ripple.x;
          const dy = dot.oy - ripple.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ring = ripple.t * RIPPLE_SPEED;
          const offset = Math.abs(dist - ring);
          if (offset < RIPPLE_WIDTH) {
            const shape = 1 - offset / RIPPLE_WIDTH;
            const fade = 1 - ripple.t / RIPPLE_LIFE;
            const push = shape * shape * fade * RIPPLE_PUSH;
            targetX += (dx / dist) * push;
            targetY += (dy / dist) * push;
          }
        }

        // critically damped-ish spring back to the target
        dot.vx = (dot.vx + (targetX - dot.x) * 0.26) * 0.72;
        dot.vy = (dot.vy + (targetY - dot.y) * 0.26) * 0.72;
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (Math.abs(dot.vx) > 0.02 || Math.abs(dot.vy) > 0.02) moving = true;
      }

      draw();

      if (moving || pointerOn || ripples.length) {
        raf = requestAnimationFrame(step);
      } else {
        running = false;
      }
    }

    function kick() {
      if (reduceMotion || running || disposed) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(step);
    }

    function toLocal(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      toLocal(event);
      pointerOn = true;
      kick();
    };
    const onLeave = () => {
      pointerOn = false;
      kick();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      toLocal(event);
      ripples.push({ x: pointerX, y: pointerY, t: 0 });
      kick();
    };

    build();
    const host = canvas.parentElement ?? canvas;
    if (finePointer && !reduceMotion) {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
      host.addEventListener("pointerdown", onDown);
    }
    const observer = new ResizeObserver(() => build());
    observer.observe(canvas);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn("dot-field", className)} aria-hidden="true" />;
}
