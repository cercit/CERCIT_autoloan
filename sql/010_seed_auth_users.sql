-- cercit — Seed demo users in Supabase Auth + link to app users table
--
-- IMPORTANT: Do NOT run this SQL directly.
-- Create these users through the Supabase Dashboard instead:
--   Authentication > Users > Add User
--
-- After creating each auth user, copy their UUID from the dashboard
-- and run the UPDATE statements below to link them.
--
-- Demo accounts to create in Supabase Auth dashboard:
--
--   1. officer@cercit.in   / password: cercit2026
--      Role: credit_officer (Rajeev Menon)
--
--   2. manager@cercit.in   / password: cercit2026
--      Role: credit_manager (Priya Sharma)
--
--   3. admin@cercit.in     / password: cercit2026
--      Role: admin (System Admin)

-- After creating the auth users, run these to link them.
-- Replace the UUIDs with the actual auth.users.id from the dashboard.

-- Step 1: Insert app-level user records (skip if already seeded)
INSERT INTO users (email, full_name, role, state_code, is_active, max_sanction_amount, daily_case_limit)
VALUES
  ('officer@cercit.in', 'Rajeev Menon',  'credit_officer',  'KA', true, 2500000, 40),
  ('manager@cercit.in', 'Priya Sharma',  'credit_manager',  'KA', true, 5000000, 20),
  ('admin@cercit.in',   'System Admin',  'admin',           NULL, true, NULL,    NULL)
ON CONFLICT (email) DO NOTHING;

-- Step 2: Link auth_user_id (replace placeholders with real UUIDs)
-- UPDATE users SET auth_user_id = '<officer-auth-uuid>' WHERE email = 'officer@cercit.in';
-- UPDATE users SET auth_user_id = '<manager-auth-uuid>' WHERE email = 'manager@cercit.in';
-- UPDATE users SET auth_user_id = '<admin-auth-uuid>'   WHERE email = 'admin@cercit.in';
