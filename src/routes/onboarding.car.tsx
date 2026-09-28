import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText, Keyboard, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useCharacter } from "@/components/character/companion";
import { OnboardingShell, StepBlock } from "@/components/onboarding/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { makes } from "@/lib/customer-data";
import { getCustomerState, saveVehicle, type DraftVehicle } from "@/lib/customer-api";
import { emiFor, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding/car")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    (typeof s["app"] === "string" || typeof s["app"] === "number") && String(s["app"])
      ? { app: String(s["app"]) }
      : {},
  head: () => ({ meta: [{ title: "Car details — cercit" }] }),
  component: CarStep,
});

const TENURES = [24, 36, 48, 60, 72, 84];
const FUELS = [
  ["PETROL", "Petrol"],
  ["DIESEL", "Diesel"],
  ["CNG", "CNG"],
  ["EV", "Electric"],
  ["HYBRID", "Hybrid"],
] as const;
const INDICATIVE_RATE = 8.99; // "rates from" on the site; the real rate comes from the decision

type Source = "QUOTATION" | "MANUAL";

function CarStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<DraftVehicle | null>(null);
  const [progress, setProgress] = useState(0);

  // Only for a signed-in customer's own draft; otherwise back to the start.
  useEffect(() => {
    void getCustomerState()
      .then((s) => {
        if (!s.draft || (app && s.draft.application_id !== app)) {
          navigate({ to: "/login", search: { as: "customer" } });
          return;
        }
        setInitial(s.draft.vehicle);
        setReady(true);
      })
      .catch(() => navigate({ to: "/login", search: { as: "customer" } }));
  }, [app, navigate]);

  return (
    <OnboardingShell
      step={2}
      progress={progress}
      applicationId={app}
      title="Which car are you buying?"
      lead="Use the quotation from the dealer if you have one. If not, type what you know; we'll ask for the quotation before final approval."
    >
      {ready && app ? (
        <CarForm app={app} initial={initial} onProgress={setProgress} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </OnboardingShell>
  );
}

function num(v: string) {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function CarForm({
  app,
  initial,
  onProgress,
}: {
  app: string;
  initial: DraftVehicle | null;
  onProgress: (p: number) => void;
}) {
  const navigate = useNavigate();
  const { emit } = useCharacter();
  const [source, setSource] = useState<Source | null>(initial?.source ?? null);
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [variant, setVariant] = useState(initial?.variant ?? "");
  const [fuel, setFuel] = useState(initial?.fuel_type ?? "");
  const [colour, setColour] = useState(initial?.colour ?? "");
  const [dealer, setDealer] = useState(initial?.dealer_name ?? "");
  const [officer, setOfficer] = useState(initial?.sales_officer_name ?? "");
  const [officerMobile, setOfficerMobile] = useState(initial?.sales_officer_mobile ?? "");
  const [quoteDate, setQuoteDate] = useState(initial?.quote_date ?? "");
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? "");
  const [exShowroom, setExShowroom] = useState(initial ? String(initial.ex_showroom) : "");
  const [roadTax, setRoadTax] = useState(initial?.road_tax ? String(initial.road_tax) : "");
  const [insurance, setInsurance] = useState(initial?.insurance ? String(initial.insurance) : "");
  const [loan, setLoan] = useState(initial ? String(initial.loan_amount_requested) : "");
  const [tenure, setTenure] = useState(String(initial?.tenure_months ?? 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The fields that must be filled, for the progress bar.
  useEffect(() => {
    const parts = [!!source, !!make, !!model, num(exShowroom) > 0, num(loan) > 0, num(tenure) > 0];
    onProgress(parts.filter(Boolean).length / parts.length);
  }, [source, make, model, exShowroom, loan, tenure, onProgress]);

  const models = makes[make] ?? [];
  const onRoad = num(exShowroom) + num(roadTax) + num(insurance);
  const emi = num(loan) ? emiFor(num(loan), INDICATIVE_RATE, Number(tenure)) : 0;
  const share = useMemo(
    () => (num(exShowroom) && num(loan) ? Math.round((num(loan) / num(exShowroom)) * 100) : null),
    [exShowroom, loan],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!source) {
      setError("Choose how you'll give the car details.");
      emit("REQUIRED_FIELD_MISSING");
      return;
    }
    setBusy(true);
    try {
      await saveVehicle(app, {
        source,
        make,
        model,
        variant,
        colour,
        fuel_type: fuel,
        ex_showroom: num(exShowroom),
        road_tax: num(roadTax) || undefined,
        insurance: num(insurance) || undefined,
        loan_amount: num(loan),
        tenure_months: Number(tenure),
        ...(source === "QUOTATION"
          ? {
              dealer_name: dealer,
              sales_officer_name: officer,
              sales_officer_mobile: officerMobile,
              quote_date: quoteDate,
              valid_until: validUntil || undefined,
            }
          : {}),
      } as Parameters<typeof saveVehicle>[1]);
      emit("SECTION_COMPLETED");
      navigate({ to: "/onboarding/documents", search: { app } });
    } catch (err) {
      setError((err as Error).message);
      emit("FIELD_INVALID");
    } finally {
      setBusy(false);
    }
  }

  const choice = (value: Source, Icon: typeof FileText, title: string, text: string) => (
    <button
      type="button"
      onClick={() => {
        setSource(value);
        if (value === "MANUAL") emit("QUOTE_LATER_CHOSEN");
      }}
      aria-pressed={source === value}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        source === value ? "border-primary bg-accent" : "border-border hover:border-primary/50",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StepBlock n="1" title="Where are the details from?" done={!!source}>
        <div className="grid gap-3 sm:grid-cols-2">
          {choice(
            "QUOTATION",
            FileText,
            "I have the dealer's quotation",
            "Copy the figures from it. You'll upload the quotation itself with your documents.",
          )}
          {choice(
            "MANUAL",
            Keyboard,
            "I'll type what I know",
            "No quotation yet? Fine — you'll get an in-principle answer, and we'll ask for the quotation before final approval.",
          )}
        </div>
      </StepBlock>

      <StepBlock n="2" title="The car" done={!!(make && model)} disabled={!source}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="make">Make</Label>
            <Select
              value={make}
              onValueChange={(v) => {
                setMake(v);
                setModel("");
              }}
            >
              <SelectTrigger id="make">
                <SelectValue placeholder="Choose the brand" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(makes).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel} disabled={!make}>
              <SelectTrigger id="model">
                <SelectValue placeholder={make ? "Choose the model" : "Choose the make first"} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variant">
              Variant <span className="font-normal text-muted-foreground">(e.g. SX(O) Turbo)</span>
            </Label>
            <Input id="variant" value={variant} onChange={(e) => setVariant(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fuel">Fuel</Label>
              <Select value={fuel} onValueChange={setFuel}>
                <SelectTrigger id="fuel">
                  <SelectValue placeholder="Fuel" />
                </SelectTrigger>
                <SelectContent>
                  {FUELS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="colour">Colour</Label>
              <Input id="colour" value={colour} onChange={(e) => setColour(e.target.value)} />
            </div>
          </div>
        </div>
      </StepBlock>

      {source === "QUOTATION" && (
        <StepBlock n="3" title="From the quotation" done={!!(dealer && quoteDate)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dealer">Dealer name</Label>
              <Input id="dealer" value={dealer} onChange={(e) => setDealer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="officer">Sales officer's name</Label>
              <Input id="officer" value={officer} onChange={(e) => setOfficer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="officer-mobile">Sales officer's mobile</Label>
              <Input
                id="officer-mobile"
                inputMode="numeric"
                value={officerMobile}
                onChange={(e) => setOfficerMobile(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-date">Quotation date</Label>
              <Input
                id="quote-date"
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid-until">
                Valid until <span className="font-normal text-muted-foreground">(if shown)</span>
              </Label>
              <Input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>
        </StepBlock>
      )}

      <StepBlock
        n={source === "QUOTATION" ? "4" : "3"}
        title="Price and loan"
        done={!!(num(exShowroom) && num(loan))}
        disabled={!source}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-showroom">Ex-showroom price (₹)</Label>
            <Input
              id="ex-showroom"
              inputMode="numeric"
              value={exShowroom}
              onChange={(e) => setExShowroom(e.target.value)}
              placeholder="e.g. 1500000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="road-tax">Road tax (₹)</Label>
            <Input
              id="road-tax"
              inputMode="numeric"
              value={roadTax}
              onChange={(e) => setRoadTax(e.target.value)}
              placeholder={source === "MANUAL" ? "If you know it" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insurance">Insurance (₹)</Label>
            <Input
              id="insurance"
              inputMode="numeric"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
              placeholder={source === "MANUAL" ? "If you know it" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan">Loan you need (₹)</Label>
            <Input
              id="loan"
              inputMode="numeric"
              value={loan}
              onChange={(e) => setLoan(e.target.value)}
              placeholder="e.g. 1200000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenure">Repay over</Label>
            <Select value={tenure} onValueChange={setTenure}>
              <SelectTrigger id="tenure">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENURES.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {t / 12} years
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {(onRoad > 0 || emi > 0) && (
          <dl className="mt-5 grid gap-3 rounded-lg bg-surface-subtle p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">On-road price</dt>
              <dd className="font-semibold tabular-nums">{onRoad ? inr(onRoad) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Loan as share of ex-showroom</dt>
              <dd className="font-semibold tabular-nums">{share !== null ? `${share}%` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                EMI at {INDICATIVE_RATE}% (indicative)
              </dt>
              <dd className="font-semibold tabular-nums text-primary">
                {emi ? `${inr(emi)}/month` : "—"}
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Your actual rate and loan amount are confirmed after we check your documents.
        </p>
      </StepBlock>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            emit("NAVIGATED_BACK");
            navigate({ to: "/login", search: { as: "customer" } });
          }}
        >
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button type="submit" size="lg" disabled={busy || !source}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save and continue <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}
