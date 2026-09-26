import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Lock,
  Smartphone,
  Upload,
} from "lucide-react";
import { useCallback, useState } from "react";

import { AudiencePopup } from "@/components/landing/audience-popup";
import { LandingFooter } from "@/components/landing/footer";
import { Hero, JourneyHud } from "@/components/landing/hero";
import { DEFAULT_LOAN, type LoanState } from "@/components/landing/loan";
import { RatesSection } from "@/components/landing/rates-section";
import { TiltCard } from "@/components/pointer-fx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { carBrands, faqs } from "@/lib/customer-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "cercit | Vehicle Finance, Simplified" },
      {
        name: "description",
        content:
          "Choose your vehicle, apply digitally and get approved in minutes. New car finance from cercit: rates from 8.99%, exact rate shown upfront, no branch visits.",
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

const howItWorks = [
  {
    icon: ClipboardCheck,
    title: "Check eligibility",
    body: "Enter your CIBIL score and salary. See what you qualify for in a minute, with no effect on your score.",
  },
  {
    icon: Upload,
    title: "Apply online",
    body: "Fill one form and upload your documents from your phone. About five minutes.",
  },
  {
    icon: BadgeCheck,
    title: "Get your decision",
    body: "Most salaried applications are decided within an hour, with the exact rate and EMI.",
  },
  {
    icon: CarFront,
    title: "Drive home",
    body: "Sign digitally. We pay the dealer directly and you collect your car.",
  },
];

const trustFacts = [
  "132 partner dealers",
  `${carBrands.length} car brands`,
  "Up to 120% of ex-showroom",
];

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
        <ul className="trust-facts" aria-label="cercit in numbers">
          {trustFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-4 pb-20">
        <p className="section-eyebrow text-center">How it works</p>
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          From showroom to driveway in four steps
        </h2>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorks.map((step, i) => (
            <li key={step.title}>
              <TiltCard className="panel h-full rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="size-5" />
                  </span>
                  <span className="step-number" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </TiltCard>
            </li>
          ))}
        </ol>
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

      <RatesSection />

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
          <p className="section-eyebrow cta-eyebrow">
            Ready when you are
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Start the engine on your application.
          </h2>
          <p className="cta-sub mt-4">It takes about five minutes. No branch visit needed.</p>
          <Button size="lg" className="cta-primary mt-9" asChild>
            <Link to="/apply">
              Apply Now <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="cta-note mt-6 flex items-center justify-center gap-2 text-xs">
            <CheckCircle2 className="size-3.5" /> Salaried, first-time and repeat buyers welcome
          </p>
        </div>
      </section>

      <LandingFooter />
      <AudiencePopup />
    </div>
  );
}
