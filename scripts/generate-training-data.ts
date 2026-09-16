/**
 * cercit Week 3 / Part A -- synthetic training data generator
 *
 * Produces N synthetic new-car-loan applications (salaried segment only)
 * with distributions taken from industry benchmarks, not from any real
 * portfolio. Every row is fabricated. No company data is involved.
 *
 * Run:  node --experimental-strip-types scripts/generate-training-data.ts [rows] [seed]
 * Out:  scripts/data/training-data.csv  (+ training-data.meta.json)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- seeded RNG (mulberry32) so runs are reproducible ----------
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROWS = Number(process.argv[2] ?? 10000);
const SEED = Number(process.argv[3] ?? 20260916);
const rand = makeRng(SEED);

const uniform = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;
function normal(mean: number, sd: number) {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
function pick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function poisson(lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

// ---------- vehicle catalogue (on-road price in INR) ----------
// Maruti-heavy mix; UV shift pushes ticket size to 8.5-11.5L
const VEHICLES = [
  { segment: "mini", onRoad: 550000, w: 12 },
  { segment: "compact", onRoad: 800000, w: 38 },
  { segment: "compact_sedan", onRoad: 950000, w: 12 },
  { segment: "compact_suv", onRoad: 1150000, w: 24 },
  { segment: "mid_suv", onRoad: 1700000, w: 10 },
  { segment: "premium", onRoad: 2600000, w: 4 },
];

export interface SyntheticRow {
  applicationId: string;
  // -- existing 14 model features --
  bureauScore: number;
  dpd30: number;
  dpd60: number;
  dpd90: number;
  dpdWriteOff: number;
  enquiryVelocity: number;
  bounceCount: number;
  salaryRegularity: number;
  employerTier: number;
  cashWithdrawalRatio: number;
  ltvPercent: number;
  foirPercent: number;
  tenureMonths: number;
  age: number;
  // -- new features (Week 3) --
  govtEmployee: number; // 1 = verified permanent govt employee
  employmentYears: number;
  ccServicingPattern: number; // 0 = no card, 1 = pays full, 2 = partial, 3 = minimum due only
  freeIncomeRatio: number; // % of net salary left after ALL EMIs incl. proposed
  // -- context columns (not model inputs, kept for CAM display / tests) --
  netMonthlySalary: number;
  existingEmi: number;
  proposedEmi: number;
  loanAmount: number;
  vehicleOnRoad: number;
  vehicleSegment: string;
  downPaymentPct: number;
  // -- labels --
  bad30: number; // 30+ DPD within 12 months of disbursal
  default90: number; // 90+ DPD within 24 months
}

function emi(principal: number, annualRate: number, months: number) {
  const r = annualRate / 12 / 100;
  return (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
}

function generateRow(i: number): SyntheticRow {
  // ----- employment -----
  const govtEmployee = chance(0.18) ? 1 : 0;
  const employerTier = govtEmployee
    ? 5
    : pick([1, 2, 3, 4, 5], [6, 16, 38, 28, 12]);
  const age = Math.round(clamp(normal(36, 7), 23, 58));
  const maxYears = Math.max(0.5, age - 22);
  const employmentYears = govtEmployee
    ? round(clamp(uniform(1, maxYears), 0.5, maxYears), 1)
    : round(clamp(Math.abs(normal(0, 5)) + 0.5, 0.5, maxYears), 1);

  // ----- income -----
  const tierMedian = [0, 32000, 42000, 58000, 82000, 125000][employerTier];
  const salaryRaw = govtEmployee
    ? normal(62000, 18000)
    : tierMedian * Math.exp(normal(0, 0.35));
  const netMonthlySalary = Math.round(clamp(salaryRaw, 22000, 400000) / 500) * 500;

  // ----- bureau (post Feb-2026 recalibration: 50 pts lower) -----
  // continuous score; delinquency signals get likelier as the score falls, but every
  // combination is possible so the model learns marginal effects, not a cluster
  let bureauScore = normal(738, 48) + (govtEmployee ? 12 : 0);
  bureauScore = Math.round(clamp(bureauScore, 520, 880));
  const stress = clamp((740 - bureauScore) / 60, 0, 2.5); // 0 at 740+, ~1.7 at 640
  const dpd30 = poisson(0.08 + 0.55 * stress);
  const dpd60 = chance(0.15 + 0.2 * stress) ? poisson(0.05 + 0.4 * stress) : 0;
  const dpd90 = chance(0.05 + 0.15 * stress) ? poisson(0.03 + 0.3 * stress) : 0;
  const dpdWriteOff = chance(0.004 + 0.035 * stress) ? 1 : 0;
  const enquiryVelocity = poisson(1.0 + 1.4 * stress + (chance(0.1) ? 3 : 0));
  const bounceCount = poisson(0.12 + 0.6 * stress + (chance(0.08) ? 1 : 0));
  const profile = stress > 1.3 ? "stressed" : stress > 0.5 ? "average" : "clean";

  // ----- bank behaviour -----
  const salaryRegularity = govtEmployee
    ? 6
    : profile === "stressed"
      ? pick([3, 4, 5, 6], [15, 25, 30, 30])
      : pick([4, 5, 6], [5, 20, 75]);
  const cashWithdrawalRatio = round(
    clamp(normal(profile === "stressed" ? 32 : 16, 10), 0, 90),
    1
  );

  // ----- credit card servicing -----
  const hasCard = chance(employerTier >= 3 ? 0.72 : 0.45);
  const ccServicingPattern = !hasCard
    ? 0
    : profile === "stressed"
      ? pick([1, 2, 3], [25, 35, 40])
      : profile === "average"
        ? pick([1, 2, 3], [60, 28, 12])
        : pick([1, 2, 3], [82, 14, 4]);

  // ----- existing obligations -----
  let existingEmi = 0;
  if (chance(0.28)) existingEmi += netMonthlySalary * uniform(0.18, 0.35); // home loan
  if (chance(0.22)) existingEmi += netMonthlySalary * uniform(0.05, 0.15); // PL / consumer
  if (ccServicingPattern === 3) existingEmi += netMonthlySalary * uniform(0.05, 0.12); // min-due drag
  existingEmi = Math.round(existingEmi);

  // ----- vehicle + loan structure -----
  const v = pick(VEHICLES, VEHICLES.map((x) => x.w));
  const vehicleOnRoad = Math.round(v.onRoad * uniform(0.9, 1.12));
  // most salaried prefer high LTV; ~20% bring real down payment
  const downPaymentPct = chance(0.2)
    ? round(uniform(15, 35), 1)
    : round(clamp(normal(6, 5), 0, 15), 1);
  const ltvPercent = round(100 - downPaymentPct, 1);
  const loanAmount = Math.round((vehicleOnRoad * ltvPercent) / 100 / 1000) * 1000;

  // tenure: 4-5y for high salary/second car, 7y standard, up to 10y for govt hatchback < 12L
  const tenureYears = govtEmployee && vehicleOnRoad < 1200000 && chance(0.25)
    ? pick([7, 8, 10], [40, 30, 30])
    : netMonthlySalary > 120000 && chance(0.6)
      ? pick([3, 4, 5], [20, 45, 35])
      : pick([3, 4, 5, 6, 7], [5, 12, 28, 15, 40]);
  const tenureMonths = tenureYears * 12;

  const rate = bureauScore >= 750 ? 8.99 : bureauScore >= 700 ? 9.9 : 11.5;
  const proposedEmi = Math.round(emi(loanAmount, rate, tenureMonths));

  const foirPercent = round(((existingEmi + proposedEmi) / netMonthlySalary) * 100, 1);
  const freeIncomeRatio = round(100 - foirPercent, 1);

  // ----- outcome label -----
  // logit tuned so overall bad30 ~= 2.5-3%, default90 ~= 0.6-0.8% (salaried book)
  let z = -6.9;
  z += (700 - bureauScore) * 0.017;
  z += dpd30 * 0.45 + dpd60 * 0.8 + dpd90 * 1.3 + dpdWriteOff * 2.0;
  z += enquiryVelocity * 0.12;
  z += bounceCount * 0.5;
  z += (6 - salaryRegularity) * 0.35;
  z += (3 - employerTier) * 0.2;
  z += Math.max(0, cashWithdrawalRatio - 25) * 0.02;
  z += Math.max(0, foirPercent - 50) * 0.06;
  z += Math.max(0, 20 - freeIncomeRatio) * 0.05;
  z += ltvPercent > 95 ? 0.25 : 0;
  z += (tenureMonths - 60) * 0.006;
  z += ccServicingPattern === 3 ? 0.9 : ccServicingPattern === 2 ? 0.3 : 0;
  z += age < 27 ? 0.4 : age > 50 ? 0.15 : 0;
  z += employmentYears < 1.5 ? 0.45 : employmentYears > 8 ? -0.25 : 0;
  z += govtEmployee ? -1.1 : 0;
  z += normal(0, 1.1); // unobserved noise (life events: marriage, layoffs, accidents)

  // 0.5% floor: even a spotless file carries life-event risk the features never see
  const pBad = 0.005 + 0.995 / (1 + Math.exp(-z));
  const bad30 = chance(pBad) ? 1 : 0;
  // roughly 1 in 4 early-arrear cases roll to 90+ (aggressive early arrest at 60)
  const default90 = bad30 && chance(govtEmployee ? 0.12 : 0.26) ? 1 : 0;

  return {
    applicationId: `SYN-${String(i + 1).padStart(6, "0")}`,
    bureauScore,
    dpd30,
    dpd60,
    dpd90,
    dpdWriteOff,
    enquiryVelocity,
    bounceCount,
    salaryRegularity,
    employerTier,
    cashWithdrawalRatio,
    ltvPercent,
    foirPercent,
    tenureMonths,
    age,
    govtEmployee,
    employmentYears,
    ccServicingPattern,
    freeIncomeRatio,
    netMonthlySalary,
    existingEmi,
    proposedEmi,
    loanAmount,
    vehicleOnRoad,
    vehicleSegment: v.segment,
    downPaymentPct,
    bad30,
    default90,
  };
}

// ---------- main ----------
const rows: SyntheticRow[] = [];
for (let i = 0; i < ROWS; i++) rows.push(generateRow(i));

const columns = Object.keys(rows[0]) as (keyof SyntheticRow)[];
const csv = [
  columns.join(","),
  ...rows.map((r) => columns.map((c) => String(r[c])).join(",")),
].join("\n");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "training-data.csv"), csv, "utf8");

const n = rows.length;
const mean = (k: keyof SyntheticRow) =>
  round(rows.reduce((s, r) => s + Number(r[k]), 0) / n, 3);
const rate = (k: keyof SyntheticRow, filter?: (r: SyntheticRow) => boolean) => {
  const sub = filter ? rows.filter(filter) : rows;
  return round((sub.reduce((s, r) => s + Number(r[k]), 0) / sub.length) * 100, 2);
};

const meta = {
  generatedAt: new Date().toISOString(),
  rows: n,
  seed: SEED,
  source: "synthetic -- industry benchmark distributions, no real portfolio data",
  modelFeatures: [
    "bureauScore", "dpd30", "dpd60", "dpd90", "dpdWriteOff", "enquiryVelocity",
    "bounceCount", "salaryRegularity", "employerTier", "cashWithdrawalRatio",
    "ltvPercent", "foirPercent", "tenureMonths", "age",
    "govtEmployee", "employmentYears", "ccServicingPattern", "freeIncomeRatio",
  ],
  labels: ["bad30", "default90"],
  summary: {
    bad30RatePct: rate("bad30"),
    default90RatePct: rate("default90"),
    bad30GovtPct: rate("bad30", (r) => r.govtEmployee === 1),
    bad30PrivatePct: rate("bad30", (r) => r.govtEmployee === 0),
    bad30Bureau750PlusPct: rate("bad30", (r) => r.bureauScore >= 750),
    bad30Bureau700to749Pct: rate("bad30", (r) => r.bureauScore >= 700 && r.bureauScore < 750),
    bad30BureauBelow700Pct: rate("bad30", (r) => r.bureauScore < 700),
    govtSharePct: rate("govtEmployee"),
    meanBureauScore: mean("bureauScore"),
    meanLoanAmount: mean("loanAmount"),
    meanFoirPct: mean("foirPercent"),
    meanLtvPct: mean("ltvPercent"),
    tenureMix: [36, 48, 60, 72, 84, 96, 120].reduce(
      (acc, t) => ({ ...acc, [t]: rows.filter((r) => r.tenureMonths === t).length }),
      {} as Record<number, number>
    ),
  },
};
writeFileSync(join(outDir, "training-data.meta.json"), JSON.stringify(meta, null, 2), "utf8");

console.log(`wrote ${n} rows -> scripts/data/training-data.csv`);
console.log(JSON.stringify(meta.summary, null, 2));
