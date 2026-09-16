-- cercit — customer employment / residence detail columns
--
-- src/lib/api.ts selects years_in_current_job, total_work_experience_years and
-- salary_bank_name from customers, and the CAM renders residence_type and
-- designation. None of them were ever added to the schema, so PostgREST
-- rejected the whole application-detail query:
--
--   column customers_1.years_in_current_job does not exist  (400)
--
-- which made the detail page fall back to mock data on every live load.
--
-- Additive and safe to re-run. Existing rows get NULL until the apply flow
-- starts capturing these.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS designation                 VARCHAR(120),
  ADD COLUMN IF NOT EXISTS years_in_current_job        SMALLINT,
  ADD COLUMN IF NOT EXISTS total_work_experience_years SMALLINT,
  ADD COLUMN IF NOT EXISTS salary_bank_name            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS residence_type              VARCHAR(30);

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS ck_customers_residence_type;
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_residence_type
  CHECK (residence_type IS NULL OR residence_type IN ('OWNED', 'RENTED', 'PARENTAL', 'COMPANY_PROVIDED'));

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS ck_customers_job_years;
ALTER TABLE customers
  ADD CONSTRAINT ck_customers_job_years
  CHECK (
    (years_in_current_job IS NULL OR years_in_current_job BETWEEN 0 AND 60)
    AND (total_work_experience_years IS NULL OR total_work_experience_years BETWEEN 0 AND 60)
    AND (
      years_in_current_job IS NULL
      OR total_work_experience_years IS NULL
      OR years_in_current_job <= total_work_experience_years
    )
  );
