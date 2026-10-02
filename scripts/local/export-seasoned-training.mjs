// Risk model v2, step 1: build the synthetic book locally and export one row per assessed application.
//
// Runs the real migrations in a local Postgres (PGlite), then the same synthetic generator as
// production (055). Nothing is read from or written to Supabase. Each row holds the 18 model
// features worked out from the tables the platform itself fills (bureau detail 053, bank and
// salary detail 054, the engine's recommendation), so the model trains on the data shapes it
// will see when it scores a real file.
//
// Run:  node scripts/local/export-seasoned-training.mjs [applications=20000]
// Out:  scripts/data/seasoned-features.csv
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { migratedDb } from "../../tests/sql/harness.mjs";

const TOTAL = Number(process.argv[2] ?? 20000);
const BATCH = 500;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "seasoned-features.csv");

const { db, failures } = await migratedDb();
if (failures.length) throw new Error("migrations failed: " + failures.join("; "));
await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)");

const t0 = Date.now();
for (let b = 1; b * BATCH <= TOTAL; b++) {
  const r = (await db.query("select fn_synthetic_generate($1, $2) as v", [b, BATCH])).rows[0].v;
  console.log(`batch ${b}: made ${r.made} (${Math.round((Date.now() - t0) / 1000)}s)`);
}

// One row per application the engine assessed (approved, referred or declined), so the
// model sees the whole through-the-door population, not only the approved files.
const FEATURES_SQL = `
with apps as (
  select a.id, a.application_id, a.status, a.loan_amount_requested, a.tenure_months,
         c.age_at_application, c.employer_category, c.employer_name, c.total_work_experience_years, c.date_of_joining, a.created_at, a.indicative_emi,
         v.on_road_price, r.recommendation,
         -- a hard decline stops before FOIR is worked out (stored as 0); recompute it then
         case when coalesce(r.foir_calculated, 0) > 0 then r.foir_calculated
              else round(100.0 * (coalesce(bsum.monthly_obligation, 0)
                                  + coalesce(nullif(a.indicative_emi, 0),
                                             a.loan_amount_requested * (0.099 / 12) / (1 - power(1 + 0.099 / 12, -a.tenure_months))))
                         / nullif(coalesce(nullif(ia.eligible_net_salary, 0), a.declared_net_salary), 0), 2) end as foir_calculated
  from applications a
  left join bureau_summary bsum on bsum.application_id = a.id and bsum.bureau = 'COMBINED'
  left join lateral (select eligible_net_salary from income_assessments i where i.application_id = a.id
                     order by i.created_at desc limit 1) ia on true
  join customers c on c.id = a.customer_id
  join vehicles v on v.application_id = a.id
  join recommendations r on r.application_id = a.id
  where a.origin = 'SYNTHETIC' and a.status not in ('DRAFT', 'SUBMITTED')
),
-- the same account seen by two bureaus is merged (merged_seq); its worst month counts once
acct as (
  select ba.application_id, coalesce(ba.merged_seq, ba.seq) as k,
         max((select coalesce(max(d), 0) from unnest(ba.dpd) d)) as worst,
         bool_or(ba.revolving and ba.product in ('CARD', 'CORP_CARD')) as card,
         max(case when ba.product in ('CARD', 'CORP_CARD') and ba.status = 'ACTIVE' then ba.outstanding end) as card_out,
         max(case when ba.product in ('CARD', 'CORP_CARD') and ba.status = 'ACTIVE' then ba.credit_limit end) as card_limit
  from bureau_accounts ba join apps on apps.id = ba.application_id
  group by 1, 2
),
dpd as (
  select application_id,
         count(*) filter (where worst >= 30 and worst < 60) as dpd30,
         count(*) filter (where worst >= 60 and worst < 90) as dpd60,
         count(*) filter (where worst >= 90) as dpd90,
         count(*) filter (where card) as cards,
         count(*) filter (where card and card_out > 0.5 * nullif(card_limit, 0)) as cards_heavy,
         count(*) filter (where card and card_out > 0) as cards_carrying
  from acct group by 1
),
bank as (
  select application_id,
         sum(bounces) as bounces,
         count(*) filter (where salary_credit > 0) as salary_months,
         sum(cash_deposits) as cash, sum(salary_credit) as salary_in
  from bank_monthly_summary group by 1
)
select apps.application_id, apps.status, apps.recommendation,
       coalesce(bs.score, 650) as "bureauScore",
       coalesce(d.dpd30, 0) as "dpd30", coalesce(d.dpd60, 0) as "dpd60", coalesce(d.dpd90, 0) as "dpd90",
       case when coalesce(bs.writeoff_count_5y, 0) > 0 then 1 else 0 end as "dpdWriteOff",
       coalesce(bs.enquiry_count_90d, 0) as "enquiryVelocity",
       coalesce(bk.bounces, 0) as "bounceCount",
       least(6, coalesce(bk.salary_months, 6)) as "salaryRegularity",
       case when apps.employer_category in ('GOVERNMENT', 'PSU') then 5
            when apps.employer_category = 'MNC' then 4
            when apps.employer_category = 'PUBLIC_LTD' then 3
            else 2 end as "employerTier",
       case when coalesce(bk.salary_in, 0) > 0 then least(100, round(100.0 * bk.cash / bk.salary_in, 1)) else 15 end as "cashWithdrawalRatio",
       round(100.0 * apps.loan_amount_requested / nullif(apps.on_road_price, 0), 1) as "ltvPercent",
       coalesce(apps.foir_calculated, 40) as "foirPercent",
       apps.tenure_months as "tenureMonths",
       apps.age_at_application as "age",
       case when apps.employer_category in ('GOVERNMENT', 'PSU') then 1 else 0 end as "govtEmployee",
       coalesce(apps.total_work_experience_years, round(extract(epoch from apps.created_at - apps.date_of_joining::timestamptz) / 31557600.0, 1), 3) as "employmentYears",
       case when coalesce(d.cards, 0) = 0 then 0 when d.cards_heavy > 0 then 3 when d.cards_carrying > 0 then 2 else 1 end as "ccServicingPattern",
       greatest(0, 100 - coalesce(apps.foir_calculated, 40)) as "freeIncomeRatio",
       -- extra detail the platform now has; kept for analysis, not fed to the model
       coalesce(bs.credit_utilization_pct, 0) as "creditUtilPct",
       coalesce(bs.unsecured_enquiry_90d, 0) as "unsecuredEnq90d",
       coalesce(bs.no_hit, false)::int as "noHit"
from apps
left join bureau_summary bs on bs.application_id = apps.id and bs.bureau = 'COMBINED'
left join dpd d on d.application_id = apps.id
left join bank bk on bk.application_id = apps.id
order by apps.application_id`;

const rows = (await db.query(FEATURES_SQL)).rows;
const cols = Object.keys(rows[0]);
const esc = (v) => (v === null || v === undefined ? "" : String(v).includes(",") ? `"${v}"` : String(v));
writeFileSync(OUT, [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
console.log(`wrote ${rows.length} rows to scripts/data/seasoned-features.csv in ${Math.round((Date.now() - t0) / 1000)}s`);
await db.close();
