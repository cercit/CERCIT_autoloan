# Task 16 — Add application detail fields from Supabase joins

## Goal
The application detail page shows blank values for several fields (address, residence, designation, experience, salary bank) because `getApplication()` in api.ts doesn't query those columns. Wire them up.

## Current state
- `getApplication()` in `api.ts` joins `customers`, `vehicles`, `bureau_reports`, `recommendations`, `credit_decisions`
- The `customers` table has columns: `address_line1`, `address_line2`, `pincode`, `residence_type`, `designation`, `years_in_current_job`, `total_work_experience_years`, `salary_bank_name`
- These are NOT included in the select statement
- The `mapToApplication` transform hardcodes empty strings: `address: ""`, `residence: ""`, `designation: ""`, etc.

## What to do

### 1. Expand the customers select in `getApplication()`
In `src/lib/api.ts`, line ~148, the customers select is:
```
customers!inner(full_name, email, mobile, pan_number, age_at_application, employer_name, city, state_code)
```

Add these columns:
```
address_line1, address_line2, pincode, residence_type, designation, years_in_current_job, total_work_experience_years, salary_bank_name
```

### 2. Map the new fields in the `mapToApplication` call
After the existing customer field mappings (around line ~176), add:
- `address`: `cust.address_line1 + (cust.address_line2 ? ", " + cust.address_line2 : "") + (cust.pincode ? " - " + cust.pincode : "")`
- `residence`: `cust.residence_type ?? ""`
- `designation`: `cust.designation ?? ""`
- `totalExperience`: `cust.total_work_experience_years ? cust.total_work_experience_years + " years" : ""`
- `currentTenure`: `cust.years_in_current_job ? cust.years_in_current_job + " years" : ""`
- `salaryBank`: `cust.salary_bank_name ?? ""`

### 3. Add these fields to applicationRowSchema
The zod schema (`applicationRowSchema`) needs optional string/number fields for the new columns so they can pass through. Add:
- `address_line1: z.string().optional().default("")`
- `address_line2: z.string().optional().default("")`
- `pincode: z.string().optional().default("")`
- `residence_type: z.string().optional().default("")`
- `designation: z.string().optional().default("")`
- `years_in_current_job: z.coerce.number().optional().default(0)`
- `total_work_experience_years: z.coerce.number().optional().default(0)`
- `salary_bank_name: z.string().optional().default("")`

And update the `.transform()` to use them instead of empty strings.

## Files to edit
- `src/lib/api.ts` — expand query, schema, and mapping

## Verify
```bash
cd C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit
npx tsc --noEmit && npx vite build --config vite.spa.config.ts
```
