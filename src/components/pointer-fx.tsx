import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

export function HeadlightSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const [pos, setPos] = useState({ x: 0.5, y: 0.45, active: false });

  return (
    <div
      ref={ref}
      className={cn("group/beam relative", className)}
      onPointerMove={(e) => {
        if (!fine) return;
        const r = e.currentTarget.getBoundingClientRect();
        setPos({
          x: (e.clientX - r.left) / r.width,
          y: (e.clientY - r.top) / r.height,
          active: true,
        });
      }}
      onPointerLeave={() => setPos((p) => ({ ...p, active: false }))}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(38rem 26rem at ${pos.x * 100}% ${pos.y * 100}%, oklch(1 0 0 / 0.22), transparent 65%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(12rem 9rem at ${pos.x * 100}% ${pos.y * 100}%, oklch(0.95 0.12 95 / 0.18), transparent 70%)`,
        }}
      />
      <div
        className="relative transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: pos.active
            ? `translate3d(${(pos.x - 0.5) * -14}px, ${(pos.y - 0.5) * -10}px, 0)`
            : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function TiltCard({
  children,
  className,
  intensity = 7,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const fine = useFinePointer();
  const [state, setState] = useState({ rx: 0, ry: 0, x: 50, y: 50, active: false });

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-[transform,box-shadow] duration-200 ease-out will-change-transform",
        state.active && "shadow-[0_18px_40px_-18px_oklch(0.546_0.215_262.9_/_0.45)]",
        className,
      )}
      style={{
        transform: state.active
          ? `perspective(900px) rotateX(${state.rx}deg) rotateY(${state.ry}deg) translateY(-4px)`
          : undefined,
      }}
      onPointerMove={(e) => {
        if (!fine) return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        setState({
          rx: (0.5 - py) * intensity,
          ry: (px - 0.5) * intensity,
          x: px * 100,
          y: py * 100,
          active: true,
        });
      }}
      onPointerLeave={() => setState((s) => ({ ...s, rx: 0, ry: 0, active: false }))}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: state.active ? 1 : 0,
          background: `radial-gradient(16rem 12rem at ${state.x}% ${state.y}%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function SpeedoCluster({ emi, label }: { emi: string; label: string }) {
  const fine = useFinePointer();
  const [t, setT] = useState(0.35);

  useEffect(() => {
    if (!fine) return;
    const onMove = (e: PointerEvent) => setT(e.clientX / window.innerWidth);
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [fine]);

  const angle = -90 + t * 180;
  const cx = 100;
  const cy = 96;
  const rOuter = 88;
  const ticks = Array.from({ length: 25 }, (_, i) => i);
  const polar = (a: number, r: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return {
      x: Number((cx + r * Math.cos(rad)).toFixed(2)),
      y: Number((cy + r * Math.sin(rad)).toFixed(2)),
    };
  };
  const arcPath = (a0: number, a1: number, r: number) => {
    const p0 = polar(a0, r);
    const p1 = polar(a1, r);
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
  };

  return (
    <div className="relative mx-auto w-full max-w-[19rem]">
      <svg
        viewBox="0 0 200 112"
        className="w-full overflow-visible rounded-t-full border border-b-0 border-white/15 bg-white/5 backdrop-blur-sm"
        role="img"
        aria-label={`${label}: ${emi}`}
      >
        <path d={arcPath(-90, 90, rOuter)} fill="none" stroke="oklch(1 0 0 / 0.12)" strokeWidth="10" strokeLinecap="round" />
        <path
          d={arcPath(-90, angle, rOuter)}
          fill="none"
          stroke="oklch(0.72 0.19 25 / 0.55)"
          strokeWidth="10"
          strokeLinecap="round"
          className="transition-all duration-150 ease-out"
        />
        {ticks.map((i) => {
          const a = -90 + (i / 24) * 180;
          const major = i % 6 === 0;
          const p1 = polar(a, major ? 72 : 76);
          const p2 = polar(a, 80);
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={major ? "oklch(1 0 0 / 0.7)" : "oklch(1 0 0 / 0.35)"}
              strokeWidth={major ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "transform 150ms ease-out",
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - 62}
            stroke="oklch(0.72 0.19 25)"
            strokeWidth={3}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px oklch(0.72 0.19 25 / 0.8))" }}
          />
        </g>
        <circle cx={cx} cy={cy} r={7} fill="oklch(1 0 0 / 0.85)" />
        <circle cx={cx} cy={cy} r={3} fill="oklch(0.3 0.05 262)" />
      </svg>

      <div className="border border-t-0 border-white/15 bg-white/5 px-4 pt-1 pb-4 text-center backdrop-blur-sm">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-white/60 uppercase">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-white tabular">{emi}</p>
      </div>
    </div>
  );
}
