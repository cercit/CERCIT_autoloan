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

import cockpitDark from "@/assets/cercit-cockpit-day-dark.webp";
import cockpitLight from "@/assets/cercit-cockpit-day-light.webp";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emiFor } from "@/lib/format";

import { DotField } from "./dot-field";
import { LOAN_LIMITS, rupee, tenureLabel, type LoanState } from "./loan";

const navLinks = [
  ["#how-it-works", "How it works"],
  ["#why-cercit", "Why cercit"],
  ["#rates", "Rates"],
  ["#faqs", "FAQs"],
] as const;

const trust = [
  { icon: ShieldCheck, title: "50,000+ customers", body: "Trusted across India" },
  { icon: Clock, title: "Approval in ~47 min", body: "Average decision time" },
  { icon: Percent, title: "Rates from 8.99%", body: "Exact rate shown upfront" },
  { icon: Smartphone, title: "100% digital", body: "No branch visits" },
];

const tenureOptions = Array.from(
  { length: (LOAN_LIMITS.months.max - LOAN_LIMITS.months.min) / LOAN_LIMITS.months.step + 1 },
  (_, i) => LOAN_LIMITS.months.min + i * LOAN_LIMITS.months.step,
);

interface LoanProps {
  loan: LoanState;
  onChange: (patch: Partial<LoanState>) => void;
}

/** Cinematic cockpit hero. The dashboard carries the interactive ink artwork. */
export function Hero() {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) > 6) {
          setHeaderHidden(y > last && y > 120);
          last = y;
        }
        setScrolled(y > 8);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        className={[
          "header-shell",
          headerHidden && !menuOpen ? "is-hidden" : "",
          scrolled ? "is-scrolled" : "",
        ].join(" ")}
        onFocusCapture={() => setHeaderHidden(false)}
      >
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="nav-login">
                  Login <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild>
                  <Link to="/login" search={{ as: "customer" }} className="login-choice">
                    <span className="font-medium">Customer</span>
                    <span className="text-xs text-muted-foreground">Track your loan application</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/login" search={{ as: "official" }} className="login-choice">
                    <span className="font-medium">Official</span>
                    <span className="text-xs text-muted-foreground">Credit officers, managers and admins</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <Link to="/login" search={{ as: "customer" }} className="mobile-login">
                Customer login
              </Link>
              <Link to="/login" search={{ as: "official" }} className="mobile-login">
                Official login
              </Link>
            </div>
          </div>
        )}
      </div>

      <div
        className="hero-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPointer({ x: 0, y: 0 })}
      >
        <div className="hero-image-layer" style={parallax}>
          <img
            src={cockpitLight}
            alt="First-person view from the driver's seat of a right-hand-drive car with a beige interior, looking down a city expressway on a sunny day"
            width={1672}
            height={941}
            fetchPriority="high"
            className="hero-img-light h-full w-full object-cover"
          />
          <img
            src={cockpitDark}
            alt="First-person view from the driver's seat of a right-hand-drive car with a dark interior, looking down a city expressway on a sunny day"
            width={1671}
            height={941}
            className="hero-img-dark h-full w-full object-cover"
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

/** EMI calculator strip directly below the hero. */
export function JourneyHud({ loan, onChange }: LoanProps) {
  const emi = emiFor(loan.amount, loan.rate, loan.months);
  const tenureChoices = tenureOptions.includes(loan.months)
    ? tenureOptions
    : [...tenureOptions, loan.months].sort((a, b) => a - b);

  return (
    <section id="journey" className="hud-strip landing-hero" aria-label="EMI calculator">
      <div className="finance-hud">
        <div className="hud-heading">
          <div>
            <p>EMI calculator</p>
            <span>Move the sliders to see your monthly payment</span>
          </div>
          <span className="live-indicator">
            <i /> Live
          </span>
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
            <div className="tenure-control">
              <span id="tenure-label">Tenure</span>
              <Select
                value={String(loan.months)}
                onValueChange={(value) => onChange({ months: Number(value) })}
              >
                <SelectTrigger className="hud-select" aria-labelledby="tenure-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="hud-select-menu">
                  {tenureChoices.map((months) => (
                    <SelectItem key={months} value={String(months)}>
                      {tenureLabel(months)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
