import { Link } from "@tanstack/react-router";
import { Linkedin, Mail, MessageCircle, Phone, Twitter } from "lucide-react";

import { openAudiencePopup } from "./audience-popup";

const legalLinks = [
  ["grievance", "Grievance redressal"],
  ["privacy", "Privacy policy"],
  ["terms", "Terms of use"],
  ["fair-practices", "Fair practices code"],
  ["lending-partners", "Digital lending partners"],
] as const;

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
          <div>
            <Link to="/" className="inline-flex items-center gap-2" aria-label="cercit home">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                c
              </span>
              <span className="footer-brand-name text-lg font-bold tracking-tight">cercit</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm opacity-80">
              Credit Evaluation and Risk Compliance Intelligence Tool for vehicle finance.
            </p>
          </div>

          <nav aria-label="Product" className="footer-col">
            <h3>Product</h3>
            <Link to="/" hash="journey">
              EMI calculator
            </Link>
            <Link to="/check-eligibility">Check eligibility</Link>
            <Link to="/apply">Apply</Link>
            <Link to="/application-status">Track application</Link>
            <Link to="/login">Login</Link>
            <button type="button" className="footer-link-btn" onClick={() => openAudiencePopup("investor")}>
              For investors
            </button>
            <button type="button" className="footer-link-btn" onClick={() => openAudiencePopup("lender")}>
              For banks &amp; NBFCs
            </button>
          </nav>

          <div className="footer-col">
            <h3>Contact</h3>
            <p>
              <Phone aria-hidden="true" /> 1800 000 0000
            </p>
            <p>
              <Mail aria-hidden="true" /> support@cercit.in
            </p>
            <p>
              <MessageCircle aria-hidden="true" /> WhatsApp on the same number
            </p>
            <p className="footer-note">Demo details. Not monitored.</p>
          </div>

          <nav aria-label="Legal" className="footer-col">
            <h3>Legal</h3>
            {legalLinks.map(([hash, label]) => (
              <Link key={hash} to="/legal" hash={hash}>
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="footer-bottom mt-10 flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs opacity-70">
            cercit is a product demo. Not a licensed financial institution.
          </p>
          <div className="flex gap-2">
            <span className="footer-social flex size-8 items-center justify-center rounded-md opacity-80">
              <Linkedin className="size-4" />
            </span>
            <span className="footer-social flex size-8 items-center justify-center rounded-md opacity-80">
              <Twitter className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
