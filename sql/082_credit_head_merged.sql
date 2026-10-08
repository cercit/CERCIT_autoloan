-- 082: one Credit Head role and login covering credit, policy and compliance (9 Oct 2026)
-- Sameer's decision: Credit Head, Policy Manager and Compliance become one role
-- with one login. The Credit Head keeps its 21 rights and gains the 5 it lacked:
-- aml.review, app.view.aggregate, consent.view, grievance.handle, role.approve
-- (26 in all). No new clashing pair: app.decide + policy.author already has a
-- waiver (26 Sep). Policy Manager and Compliance had no logins; they are
-- switched off, not deleted (history and old audit entries keep their names).
-- The other built-in check stays: nobody approves their own policy, pricing,
-- model or role change, so the head approves what the admin writes and back.
-- New login row: cercit+head@gmail.com. Its sign-in is made in Supabase
-- (Authentication > Users > Add user, Auto Confirm); it links itself by email.
-- Safe to run more than once.

-- 1. Every right of the three roles on the Credit Head
INSERT INTO role_permissions (role_code, permission_code)
SELECT DISTINCT 'credit_head', rp.permission_code
FROM role_permissions rp
WHERE rp.role_code IN ('compliance', 'policy_manager')
  AND NOT EXISTS (SELECT 1 FROM role_permissions x
                  WHERE x.role_code = 'credit_head' AND x.permission_code = rp.permission_code);

UPDATE roles
SET description = 'Credit head, also covering credit policy and compliance (merged 9 Oct 2026)', updated_at = now()
WHERE code = 'credit_head';

-- 2. Switch off the two merged roles (only if nobody uses them)
UPDATE roles SET is_active = false, updated_at = now()
WHERE code IN ('compliance', 'policy_manager')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = roles.code AND u.is_active);

-- 3. The login row
INSERT INTO users (email, full_name, role, state_code, is_active)
VALUES ('cercit+head@gmail.com', 'Credit Head', 'credit_head', NULL, true)
ON CONFLICT (email) DO UPDATE SET role = 'credit_head', full_name = 'Credit Head', is_active = true;

-- 4. Audit entry
INSERT INTO audit_events (event_type, actor_type, event_detail)
VALUES ('ROLE_RIGHTS_CHANGED', 'SYSTEM',
        jsonb_build_object('role', 'credit_head', 'change', 'merged with policy_manager and compliance; both switched off',
                           'login', 'cercit+head@gmail.com', 'migration', '082'));

-- Result: 26 rights, the two old roles off, the login row ready
SELECT (SELECT count(*) FROM role_permissions WHERE role_code = 'credit_head') AS head_rights,
       (SELECT string_agg(code || '=' || is_active, ', ') FROM roles WHERE code IN ('compliance', 'policy_manager')) AS old_roles,
       (SELECT role || ', sign-in linked: ' || (auth_user_id IS NOT NULL) FROM users WHERE email = 'cercit+head@gmail.com') AS head_login;
