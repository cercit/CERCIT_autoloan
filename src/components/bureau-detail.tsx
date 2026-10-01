import { Check, Info, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { inr } from "@/lib/format";
import type {
  BureauAccount,
  BureauDetail,
  BureauDifference,
  BureauEnquiry,
  BureauFlag,
  BureauRules,
  BureauSummary,
} from "@/lib/staff-customer-api";
import { cn } from "@/lib/utils";

// The officer's view of a two-bureau pull (sql/053): both bureaus and the
// combined figures side by side, every account with its 24-month late-payment
// grid, the enquiries, and where the bureaus disagree. Older cases (no 053 pull)
// render nothing, so the case page works before 053 runs.

type Tone = "success" | "warning" | "destructive" | "info" | "primary" | "muted";

const NAME: Record<string, string> = {
  CIBIL: "CIBIL",
  EXPERIAN: "Experian",
  CRIF: "CRIF",
  EQUIFAX: "Equifax",
  COMBINED: "Combined",
};
const bureauName = (code: string) => NAME[code] ?? code;

/** Server text names bureaus in capitals ("EQUIFAX has no record…"); read them as names. */
const tidy = (text: string) =>
  text.replace(/\b(CIBIL|EXPERIAN|CRIF|EQUIFAX)\b/g, (m) => bureauName(m));
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const PRODUCT: Record<string, string> = {
  AUTO: "Car loan",
  HOME: "Home loan",
  PROPERTY: "Loan against property",
  PERSONAL: "Personal loan",
  CONSUMER: "Consumer loan",
  EDUCATION: "Education loan",
  TWO_WHEELER: "Two-wheeler loan",
  GOLD: "Gold loan",
  CARD: "Credit card",
  CORP_CARD: "Corporate card",
  OVERDRAFT: "Overdraft",
  OTHER: "Other",
};
const productName = (p: string) => PRODUCT[p] ?? "Other";

const HELD_AS: Record<BureauAccount["ownership"], string> = {
  INDIVIDUAL: "Own name",
  JOINT: "Joint",
  GUARANTOR: "Guarantor",
  AUTHORISED: "Authorised user",
};

const STATUS: Record<BureauAccount["status"], [string, Tone]> = {
  ACTIVE: ["Active", "primary"],
  CLOSED: ["Closed", "muted"],
  WRITTEN_OFF: ["Written off", "destructive"],
  SETTLED: ["Settled", "destructive"],
};

const ASSET_CLASS: Partial<Record<BureauAccount["asset_class"], [string, Tone]>> = {
  SMA0: ["SMA-0", "warning"],
  SMA1: ["SMA-1", "warning"],
  SMA2: ["SMA-2", "warning"],
  SUB: ["Sub-standard", "destructive"],
  DBT: ["Doubtful", "destructive"],
  LSS: ["Loss", "destructive"],
};

const FREQUENCY: Record<string, string> = {
  B: "every 2 months",
  Q: "a quarter",
  H: "every 6 months",
  Y: "a year",
  F: "a fortnight",
  W: "a week",
};

const FLAG_TONE: Record<BureauFlag["code"], Tone> = {
  NO_HIT_BOTH: "destructive",
  SCORE_FROM_SECOND_BUREAU: "info",
  LICENCE_CANCELLED_LENDER: "warning",
  RESTRUCTURED: "warning",
  OVERDUE: "destructive",
  AUTO_ENQUIRY_30D: "warning",
  CREDIT_HUNGRY: "warning",
  THIN_FILE: "info",
  EMI_NOT_REPORTED: "warning",
};
const FLAG_TEXT: Partial<Record<BureauFlag["code"], string>> = {
  NO_HIT_BOTH:
    "Neither bureau has a record for this customer, so the engine sends the case to a person. The automatic reject for this (R11) is waiting for policy approval.",
  EMI_NOT_REPORTED:
    "An open loan has no EMI reported on either bureau, so it adds nothing to the monthly obligation. Check the instalment with the customer.",
};

// --- formatting ---------------------------------------------------------------

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'YYYY-MM-DD' (or a timestamp, read in IST) as "1 Oct 2026". */
function day(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d =
    iso.length > 10 ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : iso;
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const dd = Number(d.slice(8, 10));
  return y && m && dd ? `${dd} ${MONTH[m - 1]} ${y}` : "—";
}
/** Months since year 0, so two dates subtract to a month count. */
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthLabel = (index: number) => `${MONTH[index % 12]} ${Math.floor(index / 12)}`;

const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : inr(Number(v));
const count = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const age = (months: number | null) =>
  months === null
    ? "—"
    : months < 12
      ? `${months} m`
      : `${Math.floor(months / 12)} y ${months % 12} m`;

const WARN = "text-warning-foreground dark:text-warning";
/** Days late as a text colour: a little late reads amber, 60 days or more red. */
const lateTone = (days: number | null | undefined) =>
  !days || days <= 0 ? undefined : days >= 60 ? "text-destructive" : WARN;

// --- 24-month grid ------------------------------------------------------------

const LEGEND: [string, string][] = [
  ["bg-success/75", "On time"],
  ["bg-warning/50", "1–30 days late"],
  ["bg-warning", "31–60"],
  ["bg-destructive/55", "61–90"],
  ["bg-destructive", "90+"],
  ["bg-muted ring-1 ring-inset ring-border", "Not reported"],
];
function cellClass(v: number | null): string {
  const i = v === null || v < 0 ? 5 : v === 0 ? 0 : v <= 30 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : 4;
  return LEGEND[i]?.[0] ?? "";
}

/**
 * Lines a bureau's grid up with the newest month on the report, the way the
 * engine does: a bureau that reports a month later starts with an empty month.
 */
function aligned(a: BureauAccount, top: number): (number | null)[] {
  const shift = Math.max(0, top - monthIndex(a.grid_month));
  const dpd = Array.isArray(a.dpd) ? a.dpd : [];
  return Array.from({ length: 24 }, (_, i) => (i < shift ? null : (dpd[i - shift] ?? null)));
}

function DpdGrid({ cells, top }: { cells: (number | null)[]; top: number }) {
  const late = cells.flatMap((v, i) =>
    v !== null && v > 0 ? [`${monthLabel(top - i)}, ${v} days`] : [],
  );
  return (
    <div
      role="img"
      aria-label={
        late.length ? `Late payments: ${late.join("; ")}` : "No late payments in the last 24 months"
      }
      className="flex shrink-0 items-center"
    >
      {cells.map((v, i) => (
        <span
          key={i}
          title={`${monthLabel(top - i)}: ${v === null || v < 0 ? "not reported" : v === 0 ? "on time" : `${v} days late`}`}
          className={cn(
            "size-3 rounded-[2px]",
            cellClass(v),
            i > 0 && (i % 6 === 0 ? "ml-1.5" : "ml-0.5"),
          )}
        />
      ))}
    </div>
  );
}

// --- the card -----------------------------------------------------------------

export function BureauDetailCard({ data }: { data: BureauDetail | null }) {
  if (!data?.detail || !Array.isArray(data.summaries)) return null;
  const combined = data.summaries.find((s) => s.bureau === "COMBINED");
  if (!combined) return null;
  const bureaus = data.summaries
    .filter((s) => s.bureau !== "COMBINED")
    .sort((x, y) => Number(x.bureau !== "CIBIL") - Number(y.bureau !== "CIBIL"));
  const cols = [...bureaus, combined];
  const names = bureaus.map((s) => bureauName(s.bureau));
  const bothHit = bureaus.filter((s) => !s.no_hit).length >= 2;
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const enquiries = Array.isArray(data.enquiries) ? data.enquiries : [];
  const pulled = data.engine?.score_date ?? combined.pulled_at;

  return (
    <SectionCard
      title="Credit bureau"
      description={`${names.join(" and ")}, pulled ${day(pulled)}. The combined column is what the engine uses: each loan counted once, and the worse bureau for late payments and bad marks.`}
      action={
        data.engine?.bureau_name?.endsWith("SIMULATED") ? (
          <Pill tone="warning">Simulated (demo)</Pill>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {combined.no_hit ? (
          <p className="text-sm font-medium text-destructive">
            Neither {names.join(" nor ")} has a record for this customer.
          </p>
        ) : (
          <SideBySide cols={cols} rules={data.rules} />
        )}

        <ThingsToCheck
          differences={Array.isArray(data.differences) ? data.differences : []}
          flags={Array.isArray(data.flags) ? data.flags : []}
          bureaus={bureaus}
        />

        {!combined.no_hit && (
          <Accounts accounts={accounts} bothHit={bothHit} rate={data.rules?.revolving_rate} />
        )}

        {!combined.no_hit && (
          <Enquiries
            enquiries={enquiries}
            combined={combined}
            asOf={data.engine?.score_date ?? null}
          />
        )}

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Report numbers:{" "}
          {bureaus.map((s) => `${bureauName(s.bureau)} ${s.report_ref ?? "—"}`).join(" · ")}. Valid
          until {day(combined.valid_until ?? data.engine?.valid_until)}.
        </p>
      </div>
    </SectionCard>
  );
}

// --- both bureaus and the combined row -------------------------------------------

interface Cell {
  v: ReactNode;
  sub?: ReactNode;
  cls?: string | undefined;
}
interface Line {
  label: string;
  cell: (s: BureauSummary) => Cell;
  strong?: boolean;
}

function SideBySide({ cols, rules }: { cols: BureauSummary[]; rules: BureauRules | undefined }) {
  const pct = `${Math.round((rules?.revolving_rate ?? 0.05) * 100)}%`;
  const inFoir = rules?.revolving_in_foir ?? true;
  const days = (n: number | null): Cell =>
    n === null ? { v: "—" } : n <= 0 ? { v: "None" } : { v: `${n} days`, cls: lateTone(n) };
  const any = (f: (s: BureauSummary) => number | null) => cols.some((s) => (f(s) ?? 0) > 0);

  const groups: { title: string; lines: Line[] }[] = [
    {
      title: "Score",
      lines: [
        {
          label: "Score",
          cell: (s) => {
            if (s.no_hit) return { v: "No record", cls: "font-normal text-muted-foreground" };
            if (s.bureau !== "COMBINED") return { v: count(s.score) };
            return {
              v: count(s.score),
              sub: (
                <>
                  {s.score_source && `from ${bureauName(s.score_source)}`}
                  {s.score_gap !== null && (
                    <span className={cn(s.score_gap_flag && WARN)}> · {s.score_gap} apart</span>
                  )}
                </>
              ),
            };
          },
        },
      ],
    },
    {
      title: "Accounts and monthly obligation",
      lines: [
        {
          label: "Active accounts",
          cell: (s) => ({
            v: count(s.active_accounts),
            sub: [
              s.active_loans ? plural(s.active_loans, "loan") : null,
              s.active_cards ? plural(s.active_cards, "card") : null,
              s.active_overdrafts ? plural(s.active_overdrafts, "overdraft") : null,
            ]
              .filter(Boolean)
              .join(", "),
          }),
        },
        { label: "Loan EMIs", cell: (s) => ({ v: money(s.instalment_emi) }) },
        {
          label: `${pct} of card and overdraft balances`,
          cell: (s) => ({
            v: money(s.revolving_obligation),
            sub: !inFoir && s.revolving_obligation ? "not counted" : undefined,
          }),
        },
        {
          label: "Monthly obligation",
          strong: true,
          cell: (s) => ({
            v: money(s.monthly_obligation),
            sub: s.emi_ending_3m ? `${money(s.emi_ending_3m)} ends within 3 months` : undefined,
          }),
        },
        { label: "Balance outstanding", cell: (s) => ({ v: money(s.total_outstanding) }) },
        {
          label: "Card use",
          cell: (s) => ({
            v:
              s.credit_utilization_pct !== null
                ? `${Number(s.credit_utilization_pct)}%`
                : s.no_hit
                  ? "—"
                  : "No card",
          }),
        },
        {
          label: "Overdue now",
          cell: (s) => ({
            v: money(s.overdue_amount),
            cls: (s.overdue_amount ?? 0) > 0 ? "text-destructive" : undefined,
          }),
        },
      ],
    },
    {
      title: "Worst late payment",
      lines: [
        { label: "Last 3 months", cell: (s) => days(s.dpd_max_3m) },
        { label: "Last 6 months", cell: (s) => days(s.dpd_max_6m) },
        { label: "Last 12 months", cell: (s) => days(s.dpd_max_12m) },
        { label: "Last 24 months", cell: (s) => days(s.dpd_max_24m) },
        { label: "Last 36 months", cell: (s) => days(s.dpd_max_36m) },
        {
          label: "Ever 60 or more days late",
          cell: (s) =>
            s.dpd_60_plus_flag === null
              ? { v: "—" }
              : s.dpd_60_plus_flag
                ? { v: "Yes", cls: "text-destructive" }
                : { v: "No" },
        },
        {
          label: "Paid on time, last 24 months",
          cell: (s) => ({
            v:
              s.on_time_pct_24m === null
                ? "—"
                : `${Math.round(Number(s.on_time_pct_24m) * 10) / 10}%`,
          }),
        },
      ],
    },
    {
      title: "Other",
      lines: [
        { label: "Enquiries, last 90 days", cell: (s) => ({ v: count(s.enquiry_count_90d) }) },
        {
          label: "Written off / settled, last 5 years",
          cell: (s) =>
            s.no_hit
              ? { v: "—" }
              : {
                  v: `${s.writeoff_count_5y ?? 0} / ${s.settled_count_5y ?? 0}`,
                  cls:
                    (s.writeoff_count_5y ?? 0) + (s.settled_count_5y ?? 0) > 0
                      ? "text-destructive"
                      : undefined,
                },
        },
        { label: "Oldest account", cell: (s) => ({ v: age(s.oldest_account_months) }) },
        ...(any((s) => s.guarantor_accounts)
          ? [
              {
                label: "As guarantor or authorised user (not counted)",
                cell: (s: BureauSummary) => ({ v: count(s.guarantor_accounts) }),
              },
            ]
          : []),
        ...(any((s) => s.corporate_cards)
          ? [
              {
                label: "Corporate cards (not counted)",
                cell: (s: BureauSummary) => ({ v: count(s.corporate_cards) }),
              },
            ]
          : []),
      ],
    },
  ];

  const notCounted = [
    rules?.guarantor_counted === false && "guarantor and authorised-user accounts",
    rules?.corporate_cards_counted === false && "corporate cards",
  ].filter(Boolean) as string[];
  const isCombined = (s: BureauSummary) => s.bureau === "COMBINED";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 w-[34%] bg-card py-1 pr-3 text-left font-medium">
                <span className="sr-only">Measure</span>
              </th>
              {cols.map((s) => (
                <th
                  key={s.bureau}
                  scope="col"
                  className={cn(
                    "px-2 py-1.5 text-right align-bottom font-semibold text-foreground",
                    isCombined(s) && "rounded-t-md bg-primary/5",
                  )}
                >
                  {bureauName(s.bureau)}
                  {isCombined(s) ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      used by the engine
                    </span>
                  ) : (
                    s.no_hit && (
                      <span className="mt-0.5 block">
                        <Pill tone="muted">No record</Pill>
                      </span>
                    )
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th
                  scope="rowgroup"
                  className="sticky left-0 z-10 bg-card pt-3 pr-3 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {g.title}
                </th>
                {cols.map((s) => (
                  <td key={s.bureau} className={cn(isCombined(s) && "bg-primary/5")} />
                ))}
              </tr>
              {g.lines.map((l) => (
                <tr key={l.label} className="border-t border-border">
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 bg-card py-1.5 pr-3 text-left align-top",
                      l.strong ? "font-semibold" : "font-normal text-muted-foreground",
                    )}
                  >
                    {l.label}
                  </th>
                  {cols.map((s) => {
                    const c = l.cell(s);
                    return (
                      <td
                        key={s.bureau}
                        className={cn(
                          "px-2 py-1.5 text-right align-top tabular-nums",
                          (l.strong || isCombined(s)) && "font-semibold",
                          isCombined(s) && "bg-primary/5",
                          c.cls,
                        )}
                      >
                        <span className="whitespace-nowrap">{c.v}</span>
                        {c.sub ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {c.sub}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {inFoir
          ? `Monthly obligation is loan EMIs plus ${pct} of card and overdraft balances.`
          : `Monthly obligation is loan EMIs; the ${pct} of card and overdraft balances is shown but not counted.`}{" "}
        {notCounted.length > 0 &&
          `${sentence(`${notCounted.join(" and ").replace(/^./, (c) => c.toUpperCase())} are shown but not counted; their late payments still count`)} `}
        {rules?.score_rule && `Score used: ${sentence(rules.score_rule)}`}
      </p>
    </div>
  );
}

// --- differences and flags -------------------------------------------------------

function differenceText(x: BureauDifference, bureaus: BureauSummary[]): string {
  const base = tidy(x.text);
  const d = x.detail ?? {};
  if (x.code === "STATUS_DIFFERS")
    return `${base} (${Object.entries(d)
      .map(
        ([b, v]) =>
          `${bureauName(b)}: ${(STATUS[String(v) as BureauAccount["status"]]?.[0] ?? String(v)).toLowerCase()}`,
      )
      .join(", ")}).`;
  if (x.code === "DPD_DIFFERS")
    return `${base} (${Object.entries(d)
      .map(([b, v]) => `${bureauName(b)}: ${Number(v) > 0 ? `worst ${Number(v)} days` : "on time"}`)
      .join(", ")}).`;
  if (x.code === "SCORE_GAP") {
    const scores = bureaus
      .filter((s) => s.score !== null)
      .map((s) => `${bureauName(s.bureau)} ${s.score}`);
    return `${base} (${scores.join(", ")}).`;
  }
  return sentence(base);
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "info" || tone === "muted" || tone === "primary")
    return <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />;
  return (
    <TriangleAlert
      className={cn(
        "mt-0.5 size-4 shrink-0",
        tone === "destructive" ? "text-destructive" : "text-warning-foreground dark:text-warning",
      )}
      aria-hidden="true"
    />
  );
}

function ThingsToCheck({
  differences,
  flags,
  bureaus,
}: {
  differences: BureauDifference[];
  flags: BureauFlag[];
  bureaus: BureauSummary[];
}) {
  const heading = "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  const none = (text: string) => (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> {text}
    </p>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className={heading}>Where the bureaus differ</h3>
        {differences.length === 0 ? (
          none(bureaus.length > 1 ? "They agree on every account." : "Only one bureau was pulled.")
        ) : (
          <ul className="space-y-1.5 text-sm">
            {differences.map((x, i) => (
              <li key={`${x.code}-${x.merged_seq ?? x.bureau ?? i}`} className="flex gap-2">
                <ToneIcon tone="warning" />
                <span>{differenceText(x, bureaus)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className={heading}>Worth a look</h3>
        {flags.length === 0 ? (
          none("Nothing flagged.")
        ) : (
          <>
            <ul className="space-y-1.5 text-sm">
              {flags.map((f) => (
                <li key={f.code} className="flex gap-2">
                  <ToneIcon tone={FLAG_TONE[f.code] ?? "warning"} />
                  <span>{FLAG_TEXT[f.code] ?? sentence(tidy(f.text))}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted-foreground">
              For your judgement; the engine does not use these.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// --- accounts ----------------------------------------------------------------------

function Accounts({
  accounts,
  bothHit,
  rate,
}: {
  accounts: BureauAccount[];
  bothHit: boolean;
  rate: number | undefined;
}) {
  const heading = "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  if (accounts.length === 0)
    return (
      <div>
        <h3 className={heading}>Accounts</h3>
        <p className="text-sm text-muted-foreground">No accounts on either report.</p>
      </div>
    );

  // One group per loan: the same merged_seq is the same loan on both bureaus.
  const groups = new Map<string, BureauAccount[]>();
  for (const a of accounts) {
    const key = a.merged_seq !== null ? `m${a.merged_seq}` : `${a.bureau}-${a.seq}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const top = Math.max(...accounts.map((a) => monthIndex(a.grid_month)));
  const pct = `${Math.round((rate ?? 0.05) * 100)}%`;

  return (
    <div>
      <h3 className={heading}>Accounts</h3>
      <p className="mb-1.5 text-xs text-muted-foreground">
        Late payments, last 24 months: one square a month, newest on the left ({monthLabel(top)}) to
        oldest on the right ({monthLabel(top - 23)}). Months line up across bureaus, so a bureau
        that reports a month later starts with an empty square.
      </p>
      <ul className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map(([cls, word]) => (
          <li key={word} className="flex items-center gap-1">
            <span className={cn("size-3 rounded-[2px]", cls)} aria-hidden="true" />
            {word}
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Account</th>
              <th className="py-1 pr-3 font-medium">Bureau</th>
              <th className="py-1 pr-3 font-medium">Held as</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 pr-3 text-right font-medium">Balance</th>
              <th className="py-1 text-right font-medium">Monthly EMI</th>
            </tr>
          </thead>
          {[...groups.entries()].map(([key, copies]) => (
            <AccountGroup key={key} copies={copies} top={top} bothHit={bothHit} pct={pct} />
          ))}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Monthly EMI is what each account adds to the monthly obligation: the instalment for a loan,{" "}
        {pct} of the balance for a card or overdraft. Accounts marked not counted are left out.
      </p>
    </div>
  );
}

function AccountGroup({
  copies,
  top,
  bothHit,
  pct,
}: {
  copies: BureauAccount[];
  top: number;
  bothHit: boolean;
  pct: string;
}) {
  const first = copies[0];
  if (!first) return null;
  const last4 = first.account_masked?.replace(/\D/g, "").slice(-4);
  const where =
    copies.length > 1
      ? `On ${copies.map((c) => bureauName(c.bureau)).join(" and ")}`
      : bothHit
        ? `${bureauName(first.bureau)} only`
        : null;

  return (
    <tbody className="border-t border-border">
      {copies.map((a, i) => {
        const cells = aligned(a, top);
        const worst = Math.max(-1, ...cells.map((v) => v ?? -1));
        const older = a.dpd_max_25_36m > 0 ? a.dpd_max_25_36m : 0;
        const [status, statusTone] = STATUS[a.status] ?? [a.status, "muted" as Tone];
        const cls = ASSET_CLASS[a.asset_class];
        const live = a.status === "ACTIVE";
        const guarantor = a.ownership === "GUARANTOR" || a.ownership === "AUTHORISED";
        return (
          <Fragment key={`${a.bureau}-${a.seq}`}>
            <tr>
              {i === 0 && (
                <td rowSpan={copies.length * 2} className="py-2 pr-3 align-top">
                  <p className="font-medium">{first.lender_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {productName(first.product)}
                    {last4 ? ` · …${last4}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Opened {monthLabel(monthIndex(first.opened_on))}
                    {where ? ` · ${where}` : ""}
                  </p>
                  {copies.some((c) => c.licence_cancelled) && (
                    <p className={cn("text-xs", WARN)}>Lender&apos;s licence cancelled</p>
                  )}
                  {first.corporate && (
                    <p className="text-xs text-muted-foreground">Company pays; not counted</p>
                  )}
                </td>
              )}
              <td
                className={cn("pr-3 align-top font-medium", i === 0 ? "pt-2" : "pt-1.5")}
                title={`Printed as: ${a.lender_raw}, ${a.product_raw}`}
              >
                {bureauName(a.bureau)}
              </td>
              <td className={cn("pr-3 align-top", i === 0 ? "pt-2" : "pt-1.5")}>
                {HELD_AS[a.ownership] ?? a.ownership}
                {guarantor && (
                  <span className="block text-xs text-muted-foreground">not counted</span>
                )}
              </td>
              <td className={cn("pr-3 align-top", i === 0 ? "pt-2" : "pt-1.5")}>
                <span className="flex flex-wrap gap-1">
                  <Pill tone={statusTone}>{status}</Pill>
                  {cls && <Pill tone={cls[1]}>{cls[0]}</Pill>}
                </span>
                {(a.restructured || a.suit_filed) && (
                  <span
                    className={cn("mt-0.5 block text-xs", a.suit_filed ? "text-destructive" : WARN)}
                  >
                    {[a.restructured && "Restructured", a.suit_filed && "Suit filed"]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </td>
              <td
                className={cn(
                  "pr-3 text-right align-top whitespace-nowrap tabular-nums",
                  i === 0 ? "pt-2" : "pt-1.5",
                )}
              >
                {!live && a.outstanding === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  money(a.outstanding)
                )}
                {live && a.revolving && a.credit_limit !== null && (
                  <span className="block text-xs text-muted-foreground">
                    limit {money(a.credit_limit)}
                  </span>
                )}
                {live && !a.revolving && a.sanctioned !== null && (
                  <span className="block text-xs text-muted-foreground">
                    of {money(a.sanctioned)}
                  </span>
                )}
                {a.overdue > 0 && (
                  <span className="block text-xs text-destructive">{money(a.overdue)} overdue</span>
                )}
                {(a.writeoff_amount ?? 0) > 0 && (
                  <span className="block text-xs text-destructive">
                    {money(a.writeoff_amount)} written off
                  </span>
                )}
                {(a.settled_amount ?? 0) > 0 && (
                  <span className="block text-xs text-destructive">
                    settled for {money(a.settled_amount)}
                  </span>
                )}
              </td>
              <td
                className={cn(
                  "text-right align-top whitespace-nowrap tabular-nums",
                  i === 0 ? "pt-2" : "pt-1.5",
                )}
              >
                <Emi a={a} pct={pct} />
              </td>
            </tr>
            <tr>
              <td colSpan={5} className={cn("pt-1", i === copies.length - 1 ? "pb-2.5" : "pb-1")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <DpdGrid cells={cells} top={top} />
                  <span
                    className={cn(
                      "text-xs",
                      lateTone(Math.max(worst, older)) ?? "text-muted-foreground",
                    )}
                  >
                    {worst > 0
                      ? `worst ${worst} days`
                      : worst === 0
                        ? "on time"
                        : "no months reported"}
                    {older > 0 && ` · ${older} days, 25–36 months ago`}
                  </span>
                </div>
              </td>
            </tr>
          </Fragment>
        );
      })}
    </tbody>
  );
}

/** What one account adds to the monthly obligation. */
function Emi({ a, pct }: { a: BureauAccount; pct: string }) {
  if (a.status !== "ACTIVE") return <span className="text-muted-foreground">—</span>;
  const note = (text: string) => (
    <span className="block text-xs text-muted-foreground">{text}</span>
  );
  if (a.revolving) {
    if (a.obligation <= 0)
      return (
        <>
          <span className="text-muted-foreground">—</span>
          {note("not counted")}
        </>
      );
    return (
      <>
        <span className={cn(!a.counted_in_obligation && "text-muted-foreground")}>
          {money(a.obligation)}
        </span>
        {note(`${pct} of balance${a.counted_in_obligation ? "" : ", not counted"}`)}
      </>
    );
  }
  if (a.monthly_emi === null)
    return (
      <>
        <span className="text-muted-foreground">—</span>
        {a.emi_not_reported && note("EMI not reported")}
      </>
    );
  const every = FREQUENCY[a.frequency];
  return (
    <>
      <span className={cn(!a.counted_in_obligation && "text-muted-foreground")}>
        {money(a.monthly_emi)}
      </span>
      {every && a.emi !== null && note(`${money(a.emi)} ${every}`)}
      {!a.counted_in_obligation && note("not counted")}
    </>
  );
}

// --- enquiries ---------------------------------------------------------------------

function Enquiries({
  enquiries,
  combined,
  asOf,
}: {
  enquiries: BureauEnquiry[];
  combined: BureauSummary;
  asOf: string | null;
}) {
  const heading = "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  // The same lender on the same day is one enquiry, whichever bureaus show it.
  const rows = new Map<string, { e: BureauEnquiry; bureaus: string[] }>();
  for (const e of enquiries) {
    const key = `${e.lender_code}|${e.enquired_on}`;
    const row = rows.get(key);
    if (row) row.bureaus.push(bureauName(e.bureau));
    else rows.set(key, { e, bureaus: [bureauName(e.bureau)] });
  }
  const today = asOf ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const daysAgo = (iso: string) => Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);

  return (
    <div>
      <h3 className={heading}>Enquiries</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Lenders who asked a bureau about this customer: {count(combined.enquiry_count_30d)} in the
        last 30 days, {count(combined.enquiry_count_90d)} in 90 days,{" "}
        {count(combined.enquiry_count_12m)} in 12 months. The same lender on the same day counts
        once.
      </p>
      {rows.size === 0 ? (
        <p className="text-sm text-muted-foreground">No enquiries on either report.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Lender</th>
                <th className="py-1 pr-3 font-medium">For</th>
                <th className="py-1 pr-3 text-right font-medium">Amount</th>
                <th className="py-1 font-medium">Reported by</th>
              </tr>
            </thead>
            <tbody>
              {[...rows.entries()].map(([key, { e, bureaus }]) => {
                const recentCar = e.purpose === "AUTO" && daysAgo(e.enquired_on) <= 30;
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="py-1.5 pr-3 align-top whitespace-nowrap">
                      {day(e.enquired_on)}
                    </td>
                    <td className="py-1.5 pr-3 align-top">{e.lender_name}</td>
                    <td className="py-1.5 pr-3 align-top">
                      {productName(e.purpose)}
                      {recentCar && (
                        <span className={cn("block text-xs", WARN)}>in the last 30 days</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right align-top tabular-nums">
                      {money(e.amount)}
                    </td>
                    <td className="py-1.5 align-top text-muted-foreground">{bureaus.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
