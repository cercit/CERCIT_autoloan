import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { LandingFooter } from "@/components/landing/footer";
import { usePublicOrgInfo } from "@/lib/org-api";
import { BrandLogo } from "@/components/brand";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal and grievance | cercit" },
      {
        name: "description",
        content:
          "Grievance redressal, privacy policy, terms of use, fair practices code and digital lending partners for the cercit demo.",
      },
    ],
  }),
  component: LegalPage,
});

type Section = { id: string; title: string; body: ReactNode };

/** Contacts and registration from the organisation settings (041), so the page matches what admins set. */
function GrievanceContacts() {
  const org = usePublicOrgInfo();
  const reach = [org.support_email && `write to ${org.support_email}`, org.support_phone && `call ${org.support_phone}`]
    .filter(Boolean)
    .join(" or ");
  const officer = [org.grievance_officer_name, org.grievance_officer_email, org.grievance_officer_phone].filter(Boolean);
  const registration = [
    org.legal_name,
    org.cin && `CIN ${org.cin}`,
    org.rbi_registration_no && `RBI registration ${org.rbi_registration_no}`,
    org.registered_address,
  ].filter(Boolean);
  return (
    <>
      {reach && (
        <p>
          If you have a complaint, {reach}. We aim to reply within {org.grievance_reply_days} working days.
        </p>
      )}
      {officer.length > 0 && (
        <p>If you are not happy with the answer, escalate it to our Grievance Redressal Officer: {officer.join(", ")}.</p>
      )}
      {registration.length > 0 && <p>Lender: {registration.join(" · ")}.</p>}
    </>
  );
}

const sections: Section[] = [
  {
    id: "grievance",
    title: "Grievance redressal",
    body: (
      <>
        <GrievanceContacts />
        <p>
          If your complaint is still not resolved within 30 days, you can take it to the Reserve
          Bank of India under the Reserve Bank - Integrated Ombudsman Scheme, 2021, at{" "}
          <a href="https://cms.rbi.org.in" target="_blank" rel="noreferrer">
            cms.rbi.org.in
          </a>
          .
        </p>
        <p className="legal-note">
          cercit is a portfolio demo. Complaints sent here are not monitored, and no real loan
          service is provided.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy policy",
    body: (
      <>
        <p>
          A car loan application asks for your PAN, Aadhaar, income documents, bank statements and a
          credit bureau report. These are used only to check who you are and whether you can repay
          the loan.
        </p>
        <p>
          We collect this only with your consent, under India's Digital Personal Data Protection
          Act, 2023. Your data stays in India and is never sold. It is shared only with the credit
          bureau and the lending partner needed to process your loan.
        </p>
        <p>You can ask us at any time to show, correct or delete your details.</p>
        <p className="legal-note">This is a demo. Enter only made-up details.</p>
      </>
    ),
  },
  {
    id: "terms",
    title: "Terms of use",
    body: (
      <>
        <p>This site is a product demo. Nothing on it is an offer of credit or a real loan.</p>
        <p>
          All rates, charges and decisions shown are for illustration only, so please do not make
          financial decisions based on them. cercit is not a licensed lender and takes no
          responsibility for decisions made using this site.
        </p>
      </>
    ),
  },
  {
    id: "fair-practices",
    title: "Fair practices code",
    body: (
      <>
        <p>A fair lender commits to the following:</p>
        <ul>
          <li>Clear loan terms and the full all-in cost in a Key Fact Statement before you sign</li>
          <li>A clear reason if your application is rejected</li>
          <li>No hidden charges</li>
          <li>Notice before any change to your loan terms</li>
          <li>Respectful recovery, with no harassment</li>
          <li>No discrimination of any kind</li>
        </ul>
        <p className="legal-note">
          cercit is a demo, not a lender. These are the standards a real deployment would follow.
        </p>
      </>
    ),
  },
  {
    id: "lending-partners",
    title: "Digital lending partners",
    body: (
      <>
        <p>
          RBI rules on digital lending require a lender to name every app and service provider it
          works with.
        </p>
        <p>
          cercit has no lending partners, because it is a demo. A real deployment would list each
          partner here with its name and role, for example the bank that lends the money or the
          service that collects your documents.
        </p>
      </>
    ),
  },
];

function LegalPage() {
  return (
    <div className="landing min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <BrandLogo height={30} />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14">
        <p className="section-eyebrow">Legal</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your rights and our rules</h1>
        <nav aria-label="On this page" className="legal-toc">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
        </nav>

        {sections.map((s) => (
          <section key={s.id} id={s.id} className="legal-section">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
      </main>

      <LandingFooter />
    </div>
  );
}
