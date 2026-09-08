import { useState } from "react";
import { cn } from "@/lib/utils";

export interface HelpSupportPanelProps {
  onContactSubmit?: (data: { category: string; subject: string; message: string; appId?: string }) => void;
  defaultAppId?: string;
  className?: string;
}

const FAQ_ITEMS = [
  { q: "How long does approval take?", a: "Most applications receive an automated decision within 48-72 hours. Review cases may take up to 5 business days." },
  { q: "What documents are required?", a: "Salaried applicants need 3 recent salary slips, 6 months bank statement, PAN, Aadhaar, and address proof." },
  { q: "How is the interest rate decided?", a: "Rates depend on bureau score, employer tier, LTV ratio, and selected scheme. Grade A applicants receive the lowest rates." },
  { q: "Can I prepay my loan?", a: "Yes, full or partial prepayment is allowed after 6 EMI payments. A 2% charge applies on the prepaid amount." },
  { q: "What if my application is declined?", a: "You may reapply after 3 months, or contact your relationship manager for a manual review with additional documentation." },
  { q: "How do I track my application?", a: "Visit the Customer Status Tracker page, or check notifications for real-time updates on your pipeline stage." },
  { q: "What is a NACH mandate?", a: "NACH (National Automated Clearing House) allows automatic EMI debits from your bank account on the due date." },
  { q: "How can I contact support?", a: "Use the Contact Us form, call our support line at 1800-123-4567, or email support@cercit.in." },
];

const CATEGORIES = ["Application query", "Document issue", "Payment query", "Technical issue", "Other"];

export function HelpSupportPanel({ onContactSubmit, defaultAppId = "", className }: HelpSupportPanelProps) {
  const [tab, setTab] = useState<"faq" | "contact">("faq");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const [form, setForm] = useState({ category: CATEGORIES[0]!, subject: "", message: "", appId: defaultAppId });

  const toggle = (i: number) => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className={cn("panel", className)}>
      <div className="flex gap-0.5 mb-4 border-b">
        {(["faq", "contact"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2", tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t === "faq" ? "FAQ" : "Contact us"}
          </button>
        ))}
      </div>

      {tab === "faq" && (
        <div className="space-y-1">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="border-b last:border-b-0">
              <button onClick={() => toggle(i)} className="w-full text-left py-2 text-sm font-medium hover:text-muted-foreground transition-colors flex items-center justify-between">
                <span>{item.q}</span>
                <span className="text-xs text-muted-foreground">{expanded[i] ? "−" : "+"}</span>
              </button>
              {expanded[i] && <p className="text-xs text-muted-foreground pb-2 pl-1">{item.a}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "contact" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.message.length < 20) return;
            onContactSubmit?.(form);
          }}
          className="space-y-3"
        >
          <input type="hidden" value={form.appId} />
          <div>
            <label htmlFor="contactCategory" className="text-xs font-medium text-muted-foreground block">Category</label>
            <select id="contactCategory" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full mt-1 rounded-md border px-3 py-2 text-sm bg-background">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="contactSubject" className="text-xs font-medium text-muted-foreground block">Subject</label>
            <input id="contactSubject" type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full mt-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Brief summary of your query" />
          </div>
          <div>
            <label htmlFor="contactMessage" className="text-xs font-medium text-muted-foreground block">Message (min 20 chars)</label>
            <textarea id="contactMessage" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className="w-full mt-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Describe your issue in detail..." />
            <p className={cn("text-[10px] mt-0.5", form.message.length < 20 ? "text-red-600" : "text-green-600")}>{form.message.length} / 20 chars minimum</p>
          </div>
          <button type="submit" disabled={form.message.length < 20 || !form.subject.trim()} className={cn("rounded-md px-5 py-2.5 text-sm font-medium text-white transition-colors", form.message.length >= 20 && form.subject.trim() ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            Send message
          </button>
        </form>
      )}
    </div>
  );
}
