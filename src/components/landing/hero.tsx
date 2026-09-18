import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Menu,
  Percent,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import cockpitImage from "@/assets/cercit-rhd-cockpit.webp";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { emiFor } from "@/lib/format";

import { DotField } from "./dot-field";
import { LOAN_LIMITS, rupee, tenureLabel, type LoanState } from "./loan";

const journey = ["Choose", "Check", "Apply", "Approve", "Drive"] as const;

const navLinks = [
  ["#calculator", "Loan Calculator"],
  ["#vehicles", "Vehicles"],
  ["#why-cercit", "Why cercit"],
  ["#faqs", "FAQs"],
] as const;

const trust = [
  { icon: ShieldCheck, title: "50,000+ customers", body: "Trusted across India" },
  { icon: Clock, title: "Approval in ~47 min", body: "Average decision time" },
  { icon: Percent, title: "Rates from 8.75%", body: "Exact rate shown upfront" },
  { icon: Smartphone, title: "100% digital", body: "No branch visits" },
];

const tenureOptions = [12, 24, 36, 48, 60, 72, 84];

interface LoanProps {
  loan: LoanState;
  onChange: (patch: Partial<LoanState>) => void;
}

/** Cinematic cockpit hero. The dashboard carries the interactive ink artwork. */
export function Hero() {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  }

  const parallax = {
    "--parallax-x": `${pointer.x * -7}px`,
    "--parallax-y": `${pointer.y * -4}px`,
  } as React.CSSProperties;

  return (
    <section className="hero-scroll landing-hero" aria-label="Your vehicle finance journey">
      <div
        className="hero-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      >
        <div className="hero-image-layer" style={parallax}>
          <img
            src={cockpitImage}
            alt="First-person view from the driver's seat of a right-hand-drive car, looking down a city highway at golden hour"
            width={1920}
            height={1080}
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div
          className="dashboard-light"
          aria-hidden="true"
          style={
            {
              "--light-x": `${70 + pointer.x * 5}%`,
              "--light-y": `${68 + pointer.y * 3}%`,
            } as React.CSSProperties
          }
        />

        {/* light caught on the windscreen: dots scatter under the cursor */}
        <DotField />
        <p className="hero-ink-caption" aria-hidden="true">
          Move your cursor across the glass. Click to send a ripple.
        </p>

        <header className="site-header">
          <Link to="/" className="brand" aria-label="cercit home">
            <span className="brand-mark">c</span>
            <span>cercit</span>
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <span className="nav-theme">
              <ThemeToggle />
            </span>
            <Button asChild variant="ghost" className="nav-login">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild variant="outline" className="nav-track">
              <Link to="/application-status">Track Application</Link>
            </Button>
            <Button asChild className="nav-start">
              <Link to="/apply">
                Get Started <ArrowRight />
              </Link>
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </header>

        {menuOpen && (
          <div id="mobile-nav" className="mobile-panel">
            <nav aria-label="Mobile navigation">
              {navLinks.map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="mobile-panel-actions">
              <Button asChild variant="outline" className="nav-track">
                <Link to="/application-status">Track Application</Link>
              </Button>
              <Button asChild className="nav-start">
                <Link to="/apply">
                  Get Started <ArrowRight />
                </Link>
              </Button>
              <Link to="/login" className="mobile-login">
                Employee login
              </Link>
            </div>
          </div>
        )}

        <div id="top" className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Vehicle finance. Simplified.</p>
            <h1>
              Your new car is <span>closer</span> than you think.
            </h1>
            <p className="supporting-copy">
              Choose your vehicle. Apply digitally.
              <br />
              Get approved. Get closer to the road ahead.
            </p>
            <div className="hero-actions">
              <Button asChild size="lg" className="primary-cta">
                <Link to="/apply">
                  Start Your Journey <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="secondary-cta">
                <Link to="/check-eligibility">Check Eligibility</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="trust-strip" aria-label="Why choose cercit">
          {trust.map((item) => (
            <div key={item.title}>
              <item.icon />
              <p>
                <strong>{item.title}</strong>
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <a href="#journey" className="scroll-cue">
          <span />
          <p>Scroll to plan your loan</p>
        </a>
      </div>
    </section>
  );
}

/** "Your journey" dashboard strip: journey steps plus live EMI controls. Sits below the hero. */
export function JourneyHud({ loan, onChange }: LoanProps) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const emi = emiFor(loan.amount, loan.rate, loan.months);
  const tenureChoices = tenureOptions.includes(loan.months)
    ? tenureOptions
    : [...tenureOptions, loan.months].sort((a, b) => a - b);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % journey.length), 2400);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section id="journey" className="hud-strip landing-hero" aria-label="Your journey">
      <div
        className="finance-hud"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="hud-journey">
          <div className="hud-heading">
            <div>
              <p>Your journey</p>
              <span>
                {step === journey.length - 1
                  ? "Approved. Ready to drive."
                  : `Step ${step + 1} of ${journey.length}`}
              </span>
            </div>
            <span className="live-indicator">
              <i /> Live
            </span>
          </div>
          <ol className="journey-steps" aria-label="Application journey">
            {journey.map((label, index) => (
              <li key={label} className={index <= step ? "active" : ""}>
                <button
                  type="button"
                  className="step-dot"
                  aria-current={index === step ? "step" : undefined}
                  aria-label={`${label}, step ${index + 1}`}
                  onClick={() => setStep(index)}
                >
                  {index < step ? <Check /> : index + 1}
                </button>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="hud-finance">
          <div className="finance-grid">
            <label className="amount-control">
              <span>Loan amount</span>
              <strong aria-live="polite">{rupee(loan.amount)}</strong>
              <input
                type="range"
                min={LOAN_LIMITS.amount.min}
                max={LOAN_LIMITS.amount.max}
                step={LOAN_LIMITS.amount.step}
                value={loan.amount}
                onChange={(event) => onChange({ amount: Number(event.target.value) })}
                aria-label="Loan amount"
              />
            </label>
            <label className="rate-control">
              <span>Interest rate</span>
              <strong aria-live="polite">
                {loan.rate.toFixed(2)}% <small>p.a.</small>
              </strong>
              <input
                type="range"
                min={LOAN_LIMITS.rate.min}
                max={LOAN_LIMITS.rate.max}
                step={LOAN_LIMITS.rate.step}
                value={loan.rate}
                onChange={(event) => onChange({ rate: Number(event.target.value) })}
                aria-label="Annual interest rate"
              />
            </label>
            <label className="tenure-control">
              <span>Tenure</span>
              <span className="select-wrap">
                <select
                  value={loan.months}
                  onChange={(event) => onChange({ months: Number(event.target.value) })}
                  aria-label="Loan tenure"
                >
                  {tenureChoices.map((months) => (
                    <option key={months} value={months}>
                      {tenureLabel(months)}
                    </option>
                  ))}
                </select>
                <ChevronDown />
              </span>
            </label>
            <div className="emi-output">
              <span>Estimated EMI</span>
              <strong aria-live="polite">
                {rupee(emi)} <small>/ month</small>
              </strong>
            </div>
          </div>
          <p className="rate-note">
            Illustrative car loan estimate. Your exact rate is confirmed after application.
          </p>
        </div>
      </div>
    </section>
  );
}
