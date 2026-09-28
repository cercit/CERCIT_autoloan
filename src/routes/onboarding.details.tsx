import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, FileSearch, Loader2, Pencil, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useCharacter } from "@/components/character/companion";
import { OnboardingShell, StepBlock } from "@/components/onboarding/shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getExtractions, isAwsConfigured, type ExtractionResult } from "@/lib/aws-doc-api";
import {
  getConsentText,
  getCustomerState,
  getDetails,
  saveDetails,
  sendCustomerEmailCode,
  submitApplication,
  verifyCustomerEmailCode,
  type AddressInput,
  type ConsentText,
  type CustomerState,
  type DetailGroup,
  type DetailsState,
} from "@/lib/customer-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding/details")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    (typeof s["app"] === "string" || typeof s["app"] === "number") && String(s["app"])
      ? { app: String(s["app"]) }
      : {},
  head: () => ({ meta: [{ title: "Your details — cercit" }] }),
  component: DetailsStep,
});

type Values = Record<string, string>;
type Source = Record<string, string>; // field -> "PAN" / "Aadhaar" / "salary slip" / "Form 16"
const EMAIL_CODE_LENGTH = 8;

const EMPLOYER_CATEGORIES: [string, string][] = [
  ["PRIVATE_LTD", "Private limited company"],
  ["PUBLIC_LTD", "Public limited company"],
  ["MNC", "Multinational (MNC)"],
  ["GOVERNMENT", "Central or state government"],
  ["PSU", "Public sector (PSU)"],
  ["PARTNERSHIP", "Partnership firm"],
  ["PROPRIETORSHIP", "Proprietorship"],
  ["OTHER", "Other"],
];

// ---------------------------------------------------------------------------
// Reading what the document readers found
// ---------------------------------------------------------------------------

function val(x: ExtractionResult["extractions"], doc: string, field: string): string {
  const v = x[doc]?.[field]?.value;
  return v === undefined || v === null ? "" : String(v).trim();
}

/** 02/06/1991, 02-06-1991 or 1991-06-02 → 1991-06-02 */
function isoDate(s: string): string {
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : "";
}

function amount(s: string): string {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
}

/** The person an Aadhaar address is addressed through: "S/O: <name>, ..." or "C/O: <name>, ..." */
const RELATION = /^\s*(?:address\s*:?\s*)?(s|d|c|w)\s*\/\s*[o0]\s*[:.]?\s*([^,]+),?/i;

function relationName(text: string): string {
  const m = text.match(RELATION);
  return m && m[1]!.toLowerCase() !== "w" ? m[2]!.trim() : "";
}

function readAddress(text: string, states: DetailsState["states"]): AddressInput | null {
  if (!text) return null;
  const clean = text
    // an Aadhaar number, full or masked, is never part of the address
    .replace(/\b(?:[\dXx]{4}[\s-]?[\dXx]{4}[\s-]?\d{4}|[Xx]{4}[\s-]?[Xx]{4})\b/g, " ")
    .replace(RELATION, "")
    .replace(/^\s*address\s*:?\s*/i, "");
  const pinMatch = clean.match(/\b([1-9]\d{2})\s?(\d{3})\b/);
  const pin = pinMatch ? pinMatch[1]! + pinMatch[2]! : "";
  const state = states.find((s) => new RegExp(`\\b${s.name}\\b`, "i").test(clean));
  const rest = clean
    .replace(pinMatch?.[0] ?? /$^/, "")
    .replace(state ? new RegExp(`\\b${state.name}\\b`, "i") : /$^/, "")
    .split(",")
    .map((x) =>
      x
        .replace(/^[\s\-–]+|[\s\-–]+$/g, "")
        .replace(/^(dist(rict)?|vtc|po|sub district)\s*:\s*/i, ""),
    )
    .filter((x) => x && /[a-z0-9]/i.test(x));
  // Aadhaar addresses end "..., City, State PIN": the last part left is the city.
  const city = rest.length > 2 ? titleCase(rest.pop()!) : "";
  return {
    line1: rest.join(", ").slice(0, 300),
    city,
    state_code: state?.code ?? "",
    pincode: pin,
  };
}

/** RAMESH RAO → Ramesh Rao (documents print names in capitals). */
function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;
}

function prefillFrom(x: ExtractionResult["extractions"], states: DetailsState["states"]) {
  const personal: Values = {};
  const personalSrc: Source = {};
  const put = (target: Values, src: Source, field: string, value: string, from: string) => {
    if (value && !target[field]) {
      target[field] = value;
      src[field] = from;
    }
  };
  put(personal, personalSrc, "dob", isoDate(val(x, "pan_card", "dob")), "PAN");
  put(personal, personalSrc, "dob", isoDate(val(x, "aadhaar_card", "dob")), "Aadhaar");
  put(personal, personalSrc, "father_name", titleCase(val(x, "pan_card", "father_name")), "PAN");
  put(
    personal,
    personalSrc,
    "father_name",
    titleCase(
      val(x, "aadhaar_card", "father_name") || relationName(val(x, "aadhaar_card", "address")),
    ),
    "Aadhaar",
  );
  put(personal, personalSrc, "pan", val(x, "pan_card", "pan_number").toUpperCase(), "PAN");
  const g = val(x, "aadhaar_card", "gender").toUpperCase();
  put(
    personal,
    personalSrc,
    "gender",
    g.startsWith("F") ? "FEMALE" : g.startsWith("M") ? "MALE" : "",
    "Aadhaar",
  );

  const work: Values = {};
  const workSrc: Source = {};
  put(work, workSrc, "employer_name", val(x, "salary_slip", "employer_name"), "salary slip");
  put(work, workSrc, "employer_name", val(x, "form16", "employer_name"), "Form 16");
  put(
    work,
    workSrc,
    "net_monthly_salary",
    amount(val(x, "salary_slip", "net_salary")),
    "salary slip",
  );

  return {
    personal,
    personalSrc,
    work,
    workSrc,
    permanent: readAddress(val(x, "aadhaar_card", "address"), states),
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function DetailsStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const { emit } = useCharacter();
  const [state, setState] = useState<CustomerState | null>(null);
  const [details, setDetails] = useState<DetailsState | null>(null);
  const [extracted, setExtracted] = useState<ExtractionResult["extractions"]>({});

  const load = useCallback(async () => {
    const s = await getCustomerState();
    if (!s.draft || (app && s.draft.application_id !== app)) {
      navigate({ to: "/application-status" });
      return;
    }
    setState(s);
    setDetails(await getDetails(s.draft.application_id));
  }, [app, navigate]);

  useEffect(() => {
    emit("FORM_STARTED");
    void load().catch(() => navigate({ to: "/login", search: { as: "customer" } }));
  }, [emit, load, navigate]);

  const appId = state?.draft?.application_id ?? "";
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [fillNonce, setFillNonce] = useState(0);

  const fetchReads = useCallback(async () => {
    setReading(true);
    setReadError("");
    try {
      const r = await getExtractions(appId);
      setExtracted(r.extractions ?? {});
      return Object.keys(r.extractions ?? {}).length;
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "We couldn't reach the document reader.");
      return -1;
    } finally {
      setReading(false);
    }
  }, [appId]);

  // Documents are read in the background and can take up to a minute after upload,
  // so keep looking for a while instead of checking once.
  useEffect(() => {
    if (!appId || !isAwsConfigured()) return;
    let stop = false;
    void (async () => {
      for (let i = 0; i < 8 && !stop; i++) {
        const n = await fetchReads();
        if (n !== 0) return;
        await new Promise((r) => setTimeout(r, 8000));
      }
    })();
    return () => {
      stop = true;
    };
  }, [appId, fetchReads]);

  const fillFromDocuments = async () => {
    if ((await fetchReads()) >= 0) setFillNonce((n) => n + 1);
  };

  const pre = useMemo(
    () => prefillFrom(extracted, details?.states ?? []),
    [extracted, details?.states],
  );
  const filledCount =
    Object.keys(pre.personal).length +
    Object.keys(pre.work).length +
    (pre.permanent?.line1 ? 1 : 0);
  const notRead = [
    !pre.personal["dob"] && "date of birth",
    !pre.personal["father_name"] && "father's name",
    !pre.personal["gender"] && "gender",
    !pre.permanent?.line1 && "address",
    !pre.work["employer_name"] && "employer",
    !pre.work["net_monthly_salary"] && "take-home pay",
  ].filter(Boolean) as string[];
  const confirmed = (g: DetailGroup) => !!details?.groups[g];
  const allConfirmed = confirmed("PERSONAL") && confirmed("ADDRESS") && confirmed("EMPLOYMENT");
  const readSomething = Object.keys(extracted).length > 0;

  return (
    <OnboardingShell
      step={4}
      progress={
        details
          ? (["PERSONAL", "ADDRESS", "EMPLOYMENT"] as const).filter((g) => details.groups[g])
              .length / 3.4
          : 0
      }
      applicationId={app}
      title="Check your details"
      lead={
        readSomething
          ? "We've filled in what we could read from your documents. Check each part, correct anything that's wrong, and confirm."
          : "Fill in each part and confirm. It takes about 3 minutes."
      }
    >
      {!state || !details ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {isAwsConfigured() && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <FileSearch className="size-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1" aria-live="polite">
                {readError ? (
                  <span className="text-destructive">{readError}</span>
                ) : reading && !readSomething ? (
                  "Reading your documents…"
                ) : filledCount > 0 ? (
                  <>
                    Filled {filledCount} {filledCount === 1 ? "detail" : "details"} from your
                    documents.
                    {notRead.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        Not found on them, so please type: {notRead.join(", ")}.
                      </span>
                    )}
                  </>
                ) : (
                  "Nothing read from your documents yet. They can take up to a minute after upload."
                )}
              </p>
              <Button
                id="fill-from-documents"
                size="sm"
                variant="outline"
                disabled={reading}
                onClick={() => void fillFromDocuments()}
              >
                {reading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Fill from my documents
              </Button>
            </div>
          )}
          <PersonalGroup
            app={appId}
            details={details}
            prefill={pre.personal}
            source={pre.personalSrc}
            fillNonce={fillNonce}
            onSaved={load}
          />
          <AddressGroup
            app={appId}
            details={details}
            prefill={pre.permanent}
            fillNonce={fillNonce}
            onSaved={load}
          />
          <WorkGroup
            app={appId}
            details={details}
            prefill={pre.work}
            source={pre.workSrc}
            fillNonce={fillNonce}
            onSaved={load}
          />
          <SubmitBlock app={appId} state={state} ready={allConfirmed} />
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/onboarding/documents", search: app ? { app } : {} })}
          >
            <ArrowLeft className="size-4" /> Back to documents
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function GroupShell({
  n,
  title,
  done,
  editing,
  onEdit,
  summary,
  children,
}: {
  n: string;
  title: string;
  done: boolean;
  editing: boolean;
  onEdit: () => void;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <StepBlock n={n} title={title} done={done && !editing}>
      {done && !editing ? (
        <div className="mt-3 flex items-start justify-between gap-3">
          <dl className="grid flex-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">{summary}</dl>
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">{children}</div>
      )}
    </StepBlock>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value || "—"}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  from,
  hint,
  children,
}: {
  id: string;
  label: string;
  from?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex flex-wrap items-center gap-2">
        {label}
        {from && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-normal text-accent-foreground">
            <FileSearch className="size-3" aria-hidden="true" /> From your {from}
          </span>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Choice({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "Fill from my documents" on a part the customer already confirmed: puts what was read
 *  into the fields they left empty (never over something typed or saved) and reopens it.
 *  A part not yet confirmed already shows what was read, so there is nothing to do. */
function useFillEmpty(
  fillNonce: number,
  prefill: Values,
  saved: Record<string, unknown> | undefined,
  typed: Values,
  setV: (f: (p: Values) => Values) => void,
  setEditing: (b: boolean) => void,
) {
  useEffect(() => {
    if (fillNonce === 0 || !saved) return;
    const add = Object.fromEntries(
      Object.entries(prefill).filter(([k, x]) => x && !(k in typed) && !str(saved[k]).trim()),
    );
    if (Object.keys(add).length === 0) return;
    setV((p) => ({ ...p, ...add }));
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per button press
  }, [fillNonce]);
}

function useGroupSave(app: string, group: DetailGroup, onSaved: () => Promise<void>) {
  const { emit } = useCharacter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (values: Record<string, unknown>, shown: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await saveDetails(app, group, values, shown);
      emit("SECTION_COMPLETED");
      await onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      emit("FIELD_INVALID");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}

function SaveBar({
  busy,
  error,
  label = "Looks right, save",
}: {
  busy: boolean;
  error: string | null;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {label}
      </Button>
    </div>
  );
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const fmtDate = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

// ---------------------------------------------------------------------------
// 1. Personal
// ---------------------------------------------------------------------------

function PersonalGroup({
  app,
  details,
  prefill,
  source,
  fillNonce,
  onSaved,
}: {
  app: string;
  details: DetailsState;
  prefill: Values;
  source: Source;
  fillNonce: number;
  onSaved: () => Promise<void>;
}) {
  const saved = details.groups.PERSONAL?.values;
  const [editing, setEditing] = useState(!saved);
  const [v, setV] = useState<Values>({});
  const { privateField } = useCharacter();
  const { busy, error, save } = useGroupSave(app, "PERSONAL", onSaved);

  // Saved values first, then what we read; the customer's own typing wins over both.
  const base: Values = {
    dob: str(saved?.["dob"]) || prefill["dob"] || "",
    father_name: str(saved?.["father_name"]) || prefill["father_name"] || "",
    gender: str(saved?.["gender"]) || prefill["gender"] || "",
    marital_status: str(saved?.["marital_status"]),
    pan: str(saved?.["pan"]) || prefill["pan"] || "",
  };
  const cur = { ...base, ...v };
  useFillEmpty(fillNonce, prefill, saved, v, setV, setEditing);
  const set = (k: string) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  const from = (k: string) => (!saved && !(k in v) && prefill[k] ? source[k] : undefined);

  return (
    <GroupShell
      n="1"
      title="About you"
      done={!!saved}
      editing={editing}
      onEdit={() => setEditing(true)}
      summary={
        <>
          <Row label="Name" value={details.customer?.full_name} />
          <Row label="Date of birth" value={fmtDate(str(saved?.["dob"]))} />
          <Row label="Father's name" value={str(saved?.["father_name"])} />
          <Row label="PAN" value={str(saved?.["pan"])} />
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(cur, saved ? {} : prefill).then((ok) => ok && (setEditing(false), setV({})));
        }}
      >
        <p className="text-sm">
          Name: <span className="font-medium">{details.customer?.full_name}</span>
          <span className="text-muted-foreground"> (as you entered it at the start)</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="dob" label="Date of birth" from={from("dob")}>
            <Input
              id="dob"
              type="date"
              value={cur["dob"]}
              onChange={(e) => set("dob")(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field id="pan" label="PAN" from={from("pan")} hint="10 characters, as on your card">
            <Input
              id="pan"
              value={cur["pan"]}
              onChange={(e) => set("pan")(e.target.value.toUpperCase())}
              onFocus={(e) => {
                privateField.onFocus();
                if (/^X{6}/.test(e.target.value)) set("pan")("");
              }}
              onBlur={privateField.onBlur}
              maxLength={10}
              autoComplete="off"
              className="font-mono uppercase tracking-wider"
            />
          </Field>
          <Field id="father" label="Father's name" from={from("father_name")}>
            <Input
              id="father"
              value={cur["father_name"]}
              onChange={(e) => set("father_name")(e.target.value)}
            />
          </Field>
          <Field id="gender" label="Gender" from={from("gender")}>
            <Choice
              id="gender"
              value={cur["gender"] ?? ""}
              onChange={set("gender")}
              placeholder="Choose"
              options={[
                ["FEMALE", "Female"],
                ["MALE", "Male"],
                ["OTHER", "Other"],
              ]}
            />
          </Field>
          <Field id="marital" label="Marital status">
            <Choice
              id="marital"
              value={cur["marital_status"] ?? ""}
              onChange={set("marital_status")}
              placeholder="Choose"
              options={[
                ["SINGLE", "Single"],
                ["MARRIED", "Married"],
                ["OTHER", "Other"],
              ]}
            />
          </Field>
        </div>
        <SaveBar busy={busy} error={error} />
      </form>
    </GroupShell>
  );
}

// ---------------------------------------------------------------------------
// 2. Address
// ---------------------------------------------------------------------------

const EMPTY_ADDRESS: AddressInput = { line1: "", line2: "", city: "", state_code: "", pincode: "" };

function AddressFields({
  prefix,
  value,
  onChange,
  states,
  from,
}: {
  prefix: string;
  value: AddressInput;
  onChange: (a: AddressInput) => void;
  states: DetailsState["states"];
  from?: string | undefined;
}) {
  const set = (k: keyof AddressInput) => (x: string) => onChange({ ...value, [k]: x });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id={`${prefix}-line1`} label="House number, building, street" from={from}>
          <Input
            id={`${prefix}-line1`}
            value={value.line1}
            onChange={(e) => set("line1")(e.target.value)}
            autoComplete="address-line1"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id={`${prefix}-line2`} label="Area, landmark (optional)">
          <Input
            id={`${prefix}-line2`}
            value={value.line2 ?? ""}
            onChange={(e) => set("line2")(e.target.value)}
            autoComplete="address-line2"
          />
        </Field>
      </div>
      <Field id={`${prefix}-city`} label="City or town">
        <Input
          id={`${prefix}-city`}
          value={value.city}
          onChange={(e) => set("city")(e.target.value)}
          autoComplete="address-level2"
        />
      </Field>
      <Field id={`${prefix}-pin`} label="PIN code">
        <Input
          id={`${prefix}-pin`}
          value={value.pincode}
          onChange={(e) => set("pincode")(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field id={`${prefix}-state`} label="State">
          <Choice
            id={`${prefix}-state`}
            value={value.state_code}
            onChange={set("state_code")}
            placeholder="Choose the state"
            options={states.map((s) => [s.code, s.name])}
          />
        </Field>
      </div>
    </div>
  );
}

function addressLine(a: unknown, states: DetailsState["states"]): string {
  if (!a || typeof a !== "object") return "";
  const x = a as AddressInput;
  return [x.line1, x.line2, x.city, states.find((s) => s.code === x.state_code)?.name, x.pincode]
    .filter(Boolean)
    .join(", ");
}

function AddressGroup({
  app,
  details,
  prefill,
  fillNonce,
  onSaved,
}: {
  app: string;
  details: DetailsState;
  prefill: AddressInput | null;
  fillNonce: number;
  onSaved: () => Promise<void>;
}) {
  const saved = details.groups.ADDRESS?.values as Record<string, unknown> | undefined;
  const [editing, setEditing] = useState(!saved);
  const { privateField } = useCharacter();
  const { busy, error, save } = useGroupSave(app, "ADDRESS", onSaved);
  const [permanent, setPermanent] = useState<AddressInput | null>(null);
  const [current, setCurrent] = useState<AddressInput | null>(null);
  const [same, setSame] = useState<boolean | null>(null);
  const [residence, setResidence] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerMobile, setOwnerMobile] = useState<string | null>(null);
  const [years, setYears] = useState<string | null>(null);

  const perm =
    permanent ?? (saved?.["permanent"] as AddressInput | undefined) ?? prefill ?? EMPTY_ADDRESS;
  const cur = current ?? (saved?.["current"] as AddressInput | undefined) ?? EMPTY_ADDRESS;
  const isSame = same ?? (saved ? Boolean(saved["current_same"]) : true);
  const res = residence ?? str(saved?.["residence"]);
  const ownerName = owner ?? str(saved?.["owner_name"]);
  const ownerMob = ownerMobile ?? str(saved?.["owner_mobile"]);
  const yrs = years ?? str(saved?.["years_at_current"]);
  const fromAadhaar = !saved && permanent === null && prefill?.line1 ? "Aadhaar" : undefined;

  // "Fill from my documents": only an empty permanent address is replaced.
  useEffect(() => {
    if (fillNonce > 0 && prefill?.line1 && !(perm.line1 ?? "").trim()) {
      setPermanent(prefill);
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per button press
  }, [fillNonce]);

  return (
    <GroupShell
      n="2"
      title="Where you live"
      done={!!saved}
      editing={editing}
      onEdit={() => setEditing(true)}
      summary={
        <>
          <Row
            label="Permanent address"
            value={addressLine(saved?.["permanent"], details.states)}
          />
          <Row
            label="Current address"
            value={
              saved?.["current_same"]
                ? "Same as permanent"
                : addressLine(saved?.["current"], details.states)
            }
          />
          <Row
            label="Home"
            value={
              {
                OWNED: "Owned",
                RENTED: `Rented from ${str(saved?.["owner_name"])}`,
                FAMILY: "Family-owned",
                COMPANY: "Company-provided",
              }[str(saved?.["residence"])]
            }
          />
          <Row label="Years at current address" value={str(saved?.["years_at_current"])} />
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const values = {
            permanent: perm,
            current_same: isSame,
            current: isSame ? null : cur,
            residence: res,
            owner_name: res === "RENTED" ? ownerName : null,
            owner_mobile: res === "RENTED" ? ownerMob : null,
            years_at_current: yrs,
          };
          void save(values, !saved && prefill?.line1 ? { permanent: prefill } : {}).then(
            (ok) => ok && setEditing(false),
          );
        }}
      >
        <div>
          <p className="mb-2 text-sm font-medium">
            Permanent address {fromAadhaar ? "(as on your Aadhaar)" : ""}
          </p>
          <AddressFields
            prefix="perm"
            value={perm}
            onChange={setPermanent}
            states={details.states}
            from={fromAadhaar}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Do you live at this address now?</legend>
          <div className="flex gap-4 text-sm">
            {[true, false].map((b) => (
              <label key={String(b)} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="current-same"
                  checked={isSame === b}
                  onChange={() => setSame(b)}
                />{" "}
                {b ? "Yes" : "No, I live somewhere else"}
              </label>
            ))}
          </div>
        </fieldset>

        {!isSame && (
          <div>
            <p className="mb-2 text-sm font-medium">Current address</p>
            <AddressFields prefix="cur" value={cur} onChange={setCurrent} states={details.states} />
            <p className="mt-2 text-xs text-muted-foreground">
              We'll need an electricity bill for this address (last 3 months). You can add it on the
              documents page.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="residence" label="Your current home is">
            <Choice
              id="residence"
              value={res}
              onChange={setResidence}
              placeholder="Choose"
              options={[
                ["OWNED", "Owned by me or my spouse"],
                ["RENTED", "Rented"],
                ["FAMILY", "Owned by my parents or family"],
                ["COMPANY", "Given by my company"],
              ]}
            />
          </Field>
          <Field id="years" label="Years at your current address">
            <Input
              id="years"
              value={yrs}
              onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
            />
          </Field>
          {res === "RENTED" && (
            <>
              <Field id="owner" label="House owner's name">
                <Input id="owner" value={ownerName} onChange={(e) => setOwner(e.target.value)} />
              </Field>
              <Field
                id="owner-mobile"
                label="House owner's mobile"
                hint="Only used to confirm the address, if needed."
              >
                <Input
                  id="owner-mobile"
                  value={ownerMob}
                  onChange={(e) =>
                    setOwnerMobile(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))
                  }
                  inputMode="tel"
                  onFocus={privateField.onFocus}
                  onBlur={privateField.onBlur}
                />
              </Field>
            </>
          )}
        </div>
        <SaveBar busy={busy} error={error} />
      </form>
    </GroupShell>
  );
}

// ---------------------------------------------------------------------------
// 3. Work
// ---------------------------------------------------------------------------

function WorkGroup({
  app,
  details,
  prefill,
  source,
  fillNonce,
  onSaved,
}: {
  app: string;
  details: DetailsState;
  prefill: Values;
  source: Source;
  fillNonce: number;
  onSaved: () => Promise<void>;
}) {
  const saved = details.groups.EMPLOYMENT?.values;
  const [editing, setEditing] = useState(!saved);
  const [v, setV] = useState<Values>({});
  const { busy, error, save } = useGroupSave(app, "EMPLOYMENT", onSaved);
  const base: Values = {
    employer_name: str(saved?.["employer_name"]) || prefill["employer_name"] || "",
    employer_category: str(saved?.["employer_category"]),
    designation: str(saved?.["designation"]),
    date_of_joining: str(saved?.["date_of_joining"]),
    net_monthly_salary: str(saved?.["net_monthly_salary"]) || prefill["net_monthly_salary"] || "",
    existing_emis: str(saved?.["existing_emis"]),
  };
  const cur = { ...base, ...v };
  useFillEmpty(fillNonce, prefill, saved, v, setV, setEditing);
  const set = (k: string) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  const from = (k: string) => (!saved && !(k in v) && prefill[k] ? source[k] : undefined);
  const inr = (s: string) => (s ? `₹${Number(s).toLocaleString("en-IN")}` : "");

  return (
    <GroupShell
      n="3"
      title="Your work"
      done={!!saved}
      editing={editing}
      onEdit={() => setEditing(true)}
      summary={
        <>
          <Row label="Employer" value={str(saved?.["employer_name"])} />
          <Row label="Designation" value={str(saved?.["designation"])} />
          <Row label="Joined" value={fmtDate(str(saved?.["date_of_joining"]))} />
          <Row label="Monthly take-home" value={inr(str(saved?.["net_monthly_salary"]))} />
          <Row
            label="EMIs you pay now"
            value={
              str(saved?.["existing_emis"]) === "0" ? "None" : inr(str(saved?.["existing_emis"]))
            }
          />
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            {
              ...cur,
              net_monthly_salary: Number(cur["net_monthly_salary"] || 0),
              existing_emis: cur["existing_emis"] === "" ? "" : Number(cur["existing_emis"]),
            },
            saved
              ? {}
              : {
                  ...prefill,
                  ...(prefill["net_monthly_salary"]
                    ? { net_monthly_salary: Number(prefill["net_monthly_salary"]) }
                    : {}),
                },
          ).then((ok) => ok && (setEditing(false), setV({})));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="employer"
              label="Employer"
              from={from("employer_name")}
              hint="The company name as on your salary slip"
            >
              <Input
                id="employer"
                value={cur["employer_name"]}
                onChange={(e) => set("employer_name")(e.target.value)}
                autoComplete="organization"
              />
            </Field>
          </div>
          <Field id="category" label="Kind of company">
            <Choice
              id="category"
              value={cur["employer_category"] ?? ""}
              onChange={set("employer_category")}
              placeholder="Choose"
              options={EMPLOYER_CATEGORIES}
            />
          </Field>
          <Field id="designation" label="Designation">
            <Input
              id="designation"
              value={cur["designation"]}
              onChange={(e) => set("designation")(e.target.value)}
              autoComplete="organization-title"
            />
          </Field>
          <Field id="doj" label="Date you joined">
            <Input
              id="doj"
              type="date"
              value={cur["date_of_joining"]}
              onChange={(e) => set("date_of_joining")(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field
            id="salary"
            label="Monthly take-home pay (₹)"
            from={from("net_monthly_salary")}
            hint="Net pay on your latest salary slip"
          >
            <Input
              id="salary"
              value={cur["net_monthly_salary"]}
              onChange={(e) =>
                set("net_monthly_salary")(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>
          <Field
            id="emis"
            label="Loan EMIs you pay now (₹ a month)"
            hint="Home, car, personal loans and card EMIs added up. Enter 0 if none."
          >
            <Input
              id="emis"
              value={cur["existing_emis"]}
              onChange={(e) => set("existing_emis")(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              className="tabular-nums"
            />
          </Field>
        </div>
        <SaveBar busy={busy} error={error} />
      </form>
    </GroupShell>
  );
}

// ---------------------------------------------------------------------------
// 4. Submit: needed documents, bureau consent, email code
// ---------------------------------------------------------------------------

function SubmitBlock({ app, state, ready }: { app: string; state: CustomerState; ready: boolean }) {
  const navigate = useNavigate();
  const { emit, privateField } = useCharacter();
  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const email = state.customer?.email ?? "";
  const missing = (state.draft?.documents ?? []).filter(
    (d) => d.required === "ALWAYS" && !["RECEIVED", "ACCEPTED", "WAIVED"].includes(d.status),
  );

  useEffect(() => {
    void getConsentText("BUREAU_PULL").then(setConsent);
  }, []);

  async function send() {
    setBusy("send");
    setError(null);
    try {
      await sendCustomerEmailCode(email);
      setSent(true);
      emit("OTP_STARTED");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirm(v: string) {
    setCode(v);
    if (v.length < EMAIL_CODE_LENGTH || !consent) return;
    setBusy("submit");
    setError(null);
    try {
      await verifyCustomerEmailCode(email, v);
      emit("OTP_SUCCESS");
      await submitApplication(app, consent.version);
      emit("APPLICATION_SUBMITTED");
      navigate({ to: "/application-status" });
    } catch (e) {
      setError((e as Error).message);
      emit("OTP_FAILED");
      setCode("");
    } finally {
      setBusy(null);
    }
  }

  return (
    <StepBlock n="4" title="Submit your application" disabled={!ready}>
      <div className="mt-4 space-y-4 text-sm">
        {!ready && <p className="text-muted-foreground">Confirm the three parts above first.</p>}
        {ready && missing.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
            <p className="font-medium">Still needed before you can submit:</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {missing.map((d) => (
                <li key={d.doc_type}>{d.name}</li>
              ))}
            </ul>
            <Link
              to="/onboarding/documents"
              search={{ app }}
              className="mt-2 inline-block text-primary underline underline-offset-2"
            >
              Go to documents
            </Link>
          </div>
        )}
        {ready && missing.length === 0 && (
          <>
            {consent && (
              <label className="flex items-start gap-3">
                <Checkbox
                  id="bureau-consent"
                  checked={agreed}
                  onCheckedChange={(c) => (
                    setAgreed(c === true),
                    c === true && emit("CONSENT_GIVEN")
                  )}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">{consent.body}</span>
              </label>
            )}
            {!sent ? (
              <Button type="button" disabled={!agreed || busy !== null} onClick={() => void send()}>
                {busy === "send" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}{" "}
                Email me a code to confirm
              </Button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="submit-code">
                  Enter the {EMAIL_CODE_LENGTH}-digit code we sent to {email}
                </Label>
                <InputOTP
                  id="submit-code"
                  maxLength={EMAIL_CODE_LENGTH}
                  value={code}
                  onChange={(v) => void confirm(v)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={busy === "submit"}
                  {...privateField}
                >
                  <InputOTPGroup>
                    {Array.from({ length: EMAIL_CODE_LENGTH }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p
                  className={cn(
                    "text-xs text-muted-foreground",
                    busy === "submit" && "animate-pulse",
                  )}
                >
                  {busy === "submit"
                    ? "Submitting…"
                    : "Entering the code submits your application."}{" "}
                  {busy === null && (
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => void send()}
                    >
                      Send a new code
                    </button>
                  )}
                </p>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </StepBlock>
  );
}
