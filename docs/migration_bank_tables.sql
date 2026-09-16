-- Migration: Add bank statement analysis tables for Week 2
-- Run this in Supabase SQL Editor

-- Bank statement analysis summary (one row per application)
CREATE TABLE IF NOT EXISTS bank_statement_analysis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id text NOT NULL,
  avg_monthly_balance numeric DEFAULT 0,
  salary_credit_count integer DEFAULT 0,
  avg_salary_amount numeric DEFAULT 0,
  emi_debit_count integer DEFAULT 0,
  emi_debit_total numeric DEFAULT 0,
  cash_deposits numeric DEFAULT 0,
  cheque_bounce_inward integer DEFAULT 0,
  cheque_bounce_outward integer DEFAULT 0,
  min_balance_breaches integer DEFAULT 0,
  months integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(application_id)
);

-- Individual bank transactions (many rows per application)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id text NOT NULL,
  transaction_date date,
  description text,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  category text DEFAULT 'Other',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_app
  ON bank_transactions(application_id);

CREATE INDEX IF NOT EXISTS idx_bank_statement_analysis_app
  ON bank_statement_analysis(application_id);

-- Allow Lambda service role to insert
ALTER TABLE bank_statement_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on bank_statement_analysis"
  ON bank_statement_analysis FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on bank_transactions"
  ON bank_transactions FOR ALL
  USING (true) WITH CHECK (true);
