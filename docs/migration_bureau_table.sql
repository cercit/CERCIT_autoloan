-- Migration: Add bureau_reports table for bureau upload + parsing
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bureau_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id text NOT NULL,
  bureau_name text DEFAULT 'CIBIL',
  score integer DEFAULT 0,
  dpd_30 integer DEFAULT 0,
  dpd_60 integer DEFAULT 0,
  dpd_90 integer DEFAULT 0,
  active_accounts integer DEFAULT 0,
  total_accounts integer DEFAULT 0,
  total_outstanding numeric DEFAULT 0,
  total_credit_limit numeric DEFAULT 0,
  enquiries_90d integer DEFAULT 0,
  pan text DEFAULT '',
  report_date text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(application_id)
);

CREATE INDEX IF NOT EXISTS idx_bureau_reports_app
  ON bureau_reports(application_id);

ALTER TABLE bureau_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on bureau_reports"
  ON bureau_reports FOR ALL
  USING (true) WITH CHECK (true);
