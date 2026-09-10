import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gauge,
  KeyRound,
  Linkedin,
  Lock,
  Percent,
  Shield,
  Smartphone,
  Twitter,
} from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand";
import { HeadlightSurface, SpeedoCluster, TiltCard } from "@/components/pointer-fx";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { carBrands, faqs } from "@/lib/customer-data";
import { emiFor, inr } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Car Loans Online -- Apply in 5 Minutes | cercit" },
      {
        name: "description",
        content:
          "Apply online for a new car loan with cercit. Rates from 8.75%, decisions in under an hour, e-Sign from your phone. No branch visits, no hidden charges.",
      },
      { property: "og:title", content: "Car Loans Online -- Apply in 5 Minutes | cercit" },
      {
        property: "og:description",
        content:
          "Apply online, get approved in minutes and drive home today. 100% digital car finance.",
      },
    ],
  }),
  component: Landing,
});

const trustItems = [
  { icon: Shield, label: "Trusted by 50,000+ customers" },
  { icon: Clock, label: "Average approval in 47 minutes" },
  { icon: Percent, label: "Rates from 8.75%" },
  { icon: Smartphone, label: "100% digital process" },
];

const steps = [
  {
    icon: FileText,
    title: "Apply in 5 minutes",
    body: "Fill basic details and upload documents straight from your phone.",
  },
  {
    icon: Gauge,
    title: "Get instant decision",
    body: "Our AI checks eligibility in real time. Most decisions in under an hour.",
  },
  {
    icon: KeyRound,
    title: "Drive home",
    body: "e-Sign your agreement, your dealer gets the funds, you get the car.",
  },
];

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

function Calculator() {
  const [amount, setAmount] = useState(800000);
  const [tenure, setTenure] = useState(60);
  const rate = 8.99;
  const emi = emiFor(amount, rate, tenure);
  const totalPayable = emi * tenure;
  const totalInterest = totalPayable - amount;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="loan-amount">
              Loan amount
            </label>
            <span className="text-lg font-semibold">{inr(amount)}</span>
          </div>
          <Slider
            id="loan-amount"
            className="mt-4"
            min={100000}
            max={5000000}
            step={50000}
            value={[amount]}
            onValueChange={([v]) => setAmount(v ?? amount)}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{inr(100000)}</span>
            <span>{inr(5000000)}</span>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="tenure">
              Tenure
            </label>
            <span className="text-lg font-semibold">{tenure} months</span>
          </div>
          <Slider
            id="tenure"
            className="mt-4"
            min={12}
            max={84}
            step={6}
            value={[tenure]}
            onValueChange={([v]) => setTenure(v ?? tenure)}
          />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>12 months</span>
            <span>84 months</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm">
          <span className="font-medium">Interest rate: {rate}% p.a.</span>
          <span className="text-muted-foreground"> -- exact rate confirmed after application</span>
        </div>
      </div>

      <div className="panel flex flex-col justify-center gap-5 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Monthly EMI</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-primary">{inr(emi)}</p>
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <p className="text-xs text-muted-foreground">Total interest</p>
            <p className="text-base font-semibold">{inr(totalInterest)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total payable</p>
            <p className="text-base font-semibold">{inr(totalPayable)}</p>
          </div>
        </div>
        <Button size="lg" className="w-full" asChild>
          <Link to="/apply">Apply for this amount</Link>
        </Button>
      </div>
    </div>
  );
}

function Landing() {
  const heroEmi = inr(emiFor(800000, 8.99, 60));

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#12203a_0%,#1d4ed8_60%,#2563eb_100%)]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]"
        />
        <div
          aria-hidden
          className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(60%_100%_at_50%_100%,oklch(0_0_0_/_0.35),transparent)]"
        />

        <HeadlightSurface>
          <div className="relative mx-auto flex min-h-[min(88vh,720px)] max-w-6xl flex-col px-4 py-6">
            <div className="flex items-center justify-between">
              <BrandLogo />
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <Button
                  variant="ghost"
                  className="text-white hover:bg-white/15 hover:text-white"
                  asChild
                >
                  <Link to="/login">Login</Link>
                </Button>
              </div>
            </div>

            <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-white/85 uppercase">
                  <Gauge className="size-3.5" /> Take the wheel
                </p>
                <h1 className="mt-5 text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Your new car is closer than you think
                </h1>
                <p className="mt-5 text-lg text-white/80 sm:text-xl">
                  Apply online. Get approved in minutes. Drive home today.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    className="h-12 px-8 text-base transition-transform hover:-translate-y-0.5 hover:scale-[1.02]"
                    asChild
                  >
                    <Link to="/apply">
                      Apply Now <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 border-white/40 bg-transparent px-8 text-base text-white transition-transform hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
                    asChild
                  >
                    <Link to="/check-eligibility">Check Eligibility</Link>
                  </Button>
                </div>
              </div>

              <div>
                <SpeedoCluster emi={heroEmi} label="EMI / month" />
                <p className="mt-4 text-center text-xs text-white/60">
                  Illustrative: {inr(800000)} over 60 months at 8.99% p.a.
                </p>
              </div>
            </div>
          </div>
        </HeadlightSurface>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <item.icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Three steps between you and your next car.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <TiltCard key={step.title} className="panel p-6">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="size-6" />
              </span>
              <p className="mt-5 text-xs font-semibold tracking-wide text-primary uppercase">
                Step {i + 1}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </TiltCard>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button size="lg" className="h-12 px-8" asChild>
            <Link to="/apply">
              Apply Now <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What will my EMI be?</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Move the sliders to see how your monthly payment changes.
          </p>
          <div className="mt-10">
            <Calculator />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
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
              className="flex h-20 items-center justify-center rounded-lg border border-border bg-card px-3 text-center text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {brand}
            </TiltCard>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Why cercit</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyCercit.map((item) => (
              <TiltCard key={item.title} className="panel p-6">
                <item.icon className="size-6 text-primary" />
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20">
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

      <section className="bg-[linear-gradient(135deg,#1e3a5f_0%,#2563eb_100%)]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready when you are
          </h2>
          <p className="mt-3 text-white/80">
            Start your application now -- it takes about five minutes.
          </p>
          <Button size="lg" className="mt-8 h-12 px-8 text-base" asChild>
            <Link to="/apply">
              Apply Now <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-white/70">
            <CheckCircle2 className="size-3.5" /> No branch visit needed
          </p>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between">
            <div>
              <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  c
                </span>
                <span className="text-lg font-bold tracking-tight">cercit</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                Credit Evaluation and Risk Compliance Intelligence Tool for vehicle finance.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <Link to="/check-eligibility" className="text-muted-foreground hover:text-foreground">
                Check Eligibility
              </Link>
              <Link to="/apply" className="text-muted-foreground hover:text-foreground">
                Apply
              </Link>
              <Link to="/login" className="text-muted-foreground hover:text-foreground">
                Login
              </Link>
            </nav>
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              cercit is a product demo. Not a licensed financial institution.
            </p>
            <div className="flex gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground">
                <Linkedin className="size-4" />
              </span>
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground">
                <Twitter className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
