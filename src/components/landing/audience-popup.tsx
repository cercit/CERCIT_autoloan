import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type Audience = "customer" | "investor" | "lender";

const STORAGE_KEY = "cercit_audience";
const OPEN_EVENT = "cercit:audience";

/** Open the popup from anywhere (footer links etc.), optionally straight to one audience. */
export function openAudiencePopup(audience?: Audience) {
  window.dispatchEvent(new CustomEvent<Audience | undefined>(OPEN_EVENT, { detail: audience }));
}

type Cta = { label: string; to?: string; href?: string };

type Panel = {
  icon: LucideIcon;
  label: string;
  tagline: string;
  headline: string;
  intro: string;
  points: string[];
  primary: Cta;
  secondary: Cta;
};

const PANELS: Record<Audience, Panel> = {
  customer: {
    icon: CarFront,
    label: "Customer",
    tagline: "I want a car loan",
    headline: "Your new car, decided in under an hour",
    intro: "Salaried and buying a new car? Check what you qualify for, apply from your phone and see the exact rate before you sign.",
    points: [
      "Rates from 8.99%, shown upfront with the EMI",
      "Up to 120% of ex-showroom price, tenure up to 7 years",
      "Eligibility check does not touch your CIBIL score",
      "Upload documents from your phone, no branch visit",
    ],
    primary: { label: "Check eligibility", to: "/check-eligibility" },
    secondary: { label: "Apply now", to: "/apply" },
  },
  investor: {
    icon: LineChart,
    label: "Investor",
    tagline: "I want to back cercit",
    headline: "Underwriting is the slowest step in vehicle finance",
    intro: "A credit officer still builds each appraisal memo by hand, 25 to 40 a day. cercit writes the memo, runs policy and scores risk, so the officer only signs off.",
    points: [
      "AI assists, policy decides: every approval is traced to a versioned rule",
      "Risk model runs in the browser; bureau, income and LTV checks in one pass",
      "Customer journey and lender console built on one stack",
      "Starts with salaried new-car loans, then CV, 3W and co-applicants",
    ],
    primary: { label: "Request the deck", href: "mailto:support@cercit.in?subject=cercit%20investor%20deck" },
    secondary: { label: "See the lender console", to: "/login" },
  },
  lender: {
    icon: Building2,
    label: "Bank / NBFC",
    tagline: "I want to use cercit",
    headline: "Auto-generate the CAM. Keep the decision with your policy.",
    intro: "Plug cercit into your LOS to pre-fill the Credit Appraisal Memo, check it against your own rules and route only exceptions to an underwriter.",
    points: [
      "Your rate grid, FOIR, LTV and bureau bands as editable, versioned rules",
      "Approve / Maybe / Reject with reasons your auditors can read",
      "Full audit trail; PAN and mobile encrypted at rest",
      "Built around RBI Digital Lending Guidelines and the DPDP Act",
    ],
    primary: { label: "Book a demo", href: "mailto:support@cercit.in?subject=cercit%20lender%20demo" },
    secondary: { label: "Open demo console", to: "/login" },
  },
};

const ORDER: Audience[] = ["customer", "investor", "lender"];

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode: popup simply shows again next visit */
  }
}

function CtaButton({ cta, variant }: { cta: Cta; variant: "default" | "outline" }) {
  const cls = variant === "default" ? "audience-cta" : "audience-cta-secondary";
  return (
    <Button asChild size="lg" variant={variant} className={cls}>
      {cta.to ? (
        <Link to={cta.to}>
          {cta.label} {variant === "default" && <ArrowRight className="size-4" />}
        </Link>
      ) : (
        <a href={cta.href}>
          {cta.label} {variant === "default" && <ArrowRight className="size-4" />}
        </a>
      )}
    </Button>
  );
}

export function AudiencePopup() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Audience | null>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  // First visit only: ask once, a moment after the hero has painted.
  useEffect(() => {
    if (readStored()) return;
    const t = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      window.clearTimeout(resetTimer.current);
      setActive((e as CustomEvent<Audience | undefined>).detail ?? null);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const choose = (a: Audience) => {
    setActive(a);
    store(a);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      if (!readStored()) store("dismissed");
      // reset after the close animation so the panel does not flash back to the chooser
      resetTimer.current = window.setTimeout(() => setActive(null), 200);
    }
  };

  const panel = active ? PANELS[active] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audience-dialog max-w-2xl gap-0 overflow-hidden p-0">
        {!panel ? (
          <div className="p-6 sm:p-8">
            <p className="audience-eyebrow">Welcome to cercit</p>
            <DialogTitle className="text-2xl font-bold tracking-tight sm:text-3xl">
              What brings you here?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-muted-foreground">
              Pick one and we will show you what matters to you.
            </DialogDescription>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {ORDER.map((key) => {
                const p = PANELS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => choose(key)}
                    className="audience-card group"
                  >
                    <span className="audience-icon">
                      <p.icon className="size-5" />
                    </span>
                    <span className="mt-4 block text-base font-semibold">{p.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{p.tagline}</span>
                    <ArrowRight className="audience-arrow size-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <button type="button" className="audience-skip" onClick={() => onOpenChange(false)}>
              Just browsing
            </button>
          </div>
        ) : (
          <div>
            <div className="audience-panel-head px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
              <button type="button" className="audience-back" onClick={() => setActive(null)}>
                <ArrowLeft className="size-3.5" /> Change
              </button>
              <div className="mt-4 flex items-center gap-3">
                <span className="audience-icon">
                  <panel.icon className="size-5" />
                </span>
                <span className="audience-eyebrow mb-0">For {panel.label === "Bank / NBFC" ? "banks & NBFCs" : `${panel.label.toLowerCase()}s`}</span>
              </div>
              <DialogTitle className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {panel.headline}
              </DialogTitle>
              <DialogDescription className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {panel.intro}
              </DialogDescription>
            </div>
            <div className="px-6 py-5 sm:px-8">
              <ul className="grid gap-3 sm:grid-cols-2">
                {panel.points.map((pt) => (
                  <li key={pt} className="flex gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <CtaButton cta={panel.primary} variant="default" />
                <CtaButton cta={panel.secondary} variant="outline" />
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                cercit is a product demo, not a licensed lender.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
