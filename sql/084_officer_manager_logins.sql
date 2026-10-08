-- 084: one Credit Officer and one Credit Manager login (9 Oct 2026)
-- Same style as cercit+admin and cercit+head. Limits copied from the existing
-- logins: officer Rs 18 lakh and 40 cases a day (demo1), manager Rs 25 lakh
-- (cercit+sam). Rights come from the roles; nothing about the roles changes.
-- Sign-ins are made in Supabase (Authentication > Users > Add user, Auto Confirm)
-- and link themselves by email. Safe to run more than once.

INSERT INTO users (email, full_name, role, state_code, is_active, max_sanction_amount, daily_case_limit) VALUES
  ('cercit+officer@gmail.com', 'Credit Officer', 'credit_officer', NULL, true, 1800000, 40),
  ('cercit+manager@gmail.com', 'Credit Manager', 'credit_manager', NULL, true, 2500000, NULL)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true,
    max_sanction_amount = EXCLUDED.max_sanction_amount, daily_case_limit = EXCLUDED.daily_case_limit;

INSERT INTO audit_events (event_type, actor_type, event_detail)
VALUES ('USER_CREATED', 'SYSTEM',
        jsonb_build_object('logins', jsonb_build_array('cercit+officer@gmail.com', 'cercit+manager@gmail.com'), 'migration', '084'));

-- Result: two rows, "linked" turns true once each sign-in is made in Supabase
SELECT email, role, max_sanction_amount, daily_case_limit, (auth_user_id IS NOT NULL) AS linked
FROM users WHERE email IN ('cercit+officer@gmail.com', 'cercit+manager@gmail.com');
