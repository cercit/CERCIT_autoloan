import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Linkedin,
  Lock,
  Smartphone,
  Twitter,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Hero, JourneyHud } from "@/components/landing/hero";
import { DEFAULT_LOAN, LOAN_LIMITS, rupee, type LoanState } from "@/components/landing/loan";
import { TiltCard } from "@/components/pointer-fx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { carBrands, faqs } from "@/lib/customer-data";
import { emiFor } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "cercit | Vehicle Finance, Simplified" },
      {
        name: "description",
        content:
          "Choose your vehicle, apply digitally and get approved in minutes. New car finance from cercit: rates from 8.75%, exact rate shown upfront, no branch visits.",
      },
      { property: "og:title", content: "cercit | Your new car is closer than you think" },
      {
        property: "og:description",
        content:
          "A simpler digital journey from choosing your vehicle to driving it home. Apply in five minutes, decisions in under an hour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const whyCercit = [
  {
    icon: Smartphone,
    title: "No branch visits",
    body: "Apply, track and sign everything from your phone or laptop.",
  },
  {
    icon: Eye,
    title: "Transparent pricing",
    body: "See your exact rate upfront. No hidden charges, no last-minute surprises.",
  },
  {
    icon: Clock,
    title: "Real-time tracking",
    body: "Know exactly where your application stands, every step of the way.",
  },
  {
    icon: Lock,
    title: "Secure & private",
    body: "Bank-grade encryption. Your documents stay safe with us.",
  },
];

interface CalculatorProps {
  loan: LoanState;
  onChange: (patch: Partial<LoanState>) => void;
}

function Calculator({ loan, onChange }: CalculatorProps) {
  const emi = emiFor(loan.amount, loan.rate, loan.months);
  const totalPayable = emi * loan.months;
  const totalInterest = totalPayable - loan.amount;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="loan-amount">
              Loan amount
            </label>
            <span className="text-lg font-semibold tabular">{rupee(loan.amount)}</span>
          </div>
          <Slider
            id="loan-amount"
            className="mt-4"
            min={LOAN_LIMITS.amount.min}
            max={LOAN_LIMITS.amount.max}
            step={LOAN_LIMITS.amount.step}
            value={[loan.amount]}
            onValueChange={([v]) => onChange({ amount: v ?? loan.amount })}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{rupee(LOAN_LIMITS.amount.min)}</span>
            <span>{rupee(LOAN_LIMITS.amount.max)}</span>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="tenure">
              Tenure
            </label>
            <span className="text-lg font-semibold tabular">{loan.months} months</span>
          </div>
          <Slider
            id="tenure"
            className="mt-4"
            min={LOAN_LIMITS.months.min}
            max={LOAN_LIMITS.months.max}
            step={LOAN_LIMITS.months.step}
            value={[loan.months]}
            onValueChange={([v]) => onChange({ months: v ?? loan.months })}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{LOAN_LIMITS.months.min} months</span>
            <span>{LOAN_LIMITS.months.max} months</span>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="rate">
              Interest rate
            </label>
            <span className="text-lg font-semibold tabular">{loan.rate.toFixed(2)}% p.a.</span>
          </div>
          <Slider
            id="rate"
            className="mt-4"
            min={LOAN_LIMITS.rate.min}
            max={LOAN_LIMITS.rate.max}
            step={LOAN_LIMITS.rate.step}
            value={[loan.rate]}
            onValueChange={([v]) => onChange({ rate: v ?? loan.rate })}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{LOAN_LIMITS.rate.min}%</span>
            <span>{LOAN_LIMITS.rate.max}%</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm">
          <span className="font-medium">Rates start at 8.75% p.a.</span>
          <span className="text-muted-foreground">
            {" "}
            Your exact rate depends on your credit profile and is confirmed after application.
          </span>
        </div>
      </div>

      <div className="panel flex flex-col justify-center gap-5 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Monthly EMI</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-primary tabular">
            {rupee(emi)}
          </p>
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <p className="text-xs text-muted-foreground">Total interest</p>
            <p className="text-base font-semibold tabular">{rupee(totalInterest)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total payable</p>
            <p className="text-base font-semibold tabular">{rupee(totalPayable)}</p>
          </div>
        </div>
        <Button size="lg" className="h-12 w-full rounded-full text-base font-semibold" asChild>
          <Link to="/apply">
            Apply for this amount <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Landing() {
  const [loan, setLoan] = useState<LoanState>(DEFAULT_LOAN);
  const update = useCallback(
    (patch: Partial<LoanState>) => setLoan((prev) => ({ ...prev, ...patch })),
    [],
  );

  return (
    <div className="landing min-h-screen bg-background">
      <Hero />
      <JourneyHud loan={loan} onChange={update} />

      <section id="calculator" className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="section-eyebrow">Loan calculator</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What will my EMI be?</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Move the sliders to see how your monthly payment changes. The dashboard at the top
            follows along.
          </p>
          <div className="mt-10">
            <Calculator loan={loan} onChange={update} />
          </div>
        </div>
      </section>

      <section id="vehicles" className="mx-auto max-w-6xl px-4 py-20">
        <p className="section-eyebrow text-center">Vehicles</p>
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Finance for every new car
        </h2>
        <p className="mt-3 text-center text-muted-foreground">
          Finance available for all new cars from authorized dealers.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {carBrands.map((brand) => (
            <TiltCard
              key={brand}
              intensity={10}
              className="brand-tile flex h-20 items-center justify-center rounded-xl border border-border bg-card px-3 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {brand}
            </TiltCard>
          ))}
        </div>
      </section>

      <section id="why-cercit" className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="section-eyebrow text-center">Why cercit</p>
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Built for people who would rather be driving.
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyCercit.map((item) => (
              <TiltCard key={item.title} className="panel rounded-xl p-6">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      <section id="faqs" className="mx-auto max-w-3xl px-4 py-20">
        <p className="section-eyebrow text-center">FAQs</p>
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((faq) => (
            <AccordionItem key={faq.q} value={faq.q}>
              <AccordionTrigger className="text-left text-base">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="cta-band">
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center">
          <p className="section-eyebrow" style={{ color: "oklch(0.7 0.2 246)" }}>
            Ready when you are
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Start the engine on your application.
          </h2>
          <p className="mt-4 text-white/75">It takes about five minutes. No branch visit needed.</p>
          <Button size="lg" className="cta-primary mt-9" asChild>
            <Link to="/apply">
              Apply Now <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-white/60">
            <CheckCircle2 className="size-3.5" /> Salaried, first-time and repeat buyers welcome
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between">
            <div>
              <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                  c
                </span>
                <span className="text-lg font-bold tracking-tight text-white">cercit</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm opacity-80">
                Credit Evaluation and Risk Compliance Intelligence Tool for vehicle finance.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm" aria-label="Footer">
              <a href="#calculator">Loan Calculator</a>
              <Link to="/check-eligibility">Check Eligibility</Link>
              <Link to="/apply">Apply</Link>
              <Link to="/application-status">Track Application</Link>
              <Link to="/login">Login</Link>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs opacity-70">
              cercit is a product demo. Not a licensed financial institution.
            </p>
            <div className="flex gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border border-white/15 opacity-80">
                <Linkedin className="size-4" />
              </span>
              <span className="flex size-8 items-center justify-center rounded-md border border-white/15 opacity-80">
                <Twitter className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
