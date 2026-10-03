-- 081: the demo admin gets every right (master access), 3 Oct 2026
-- Sameer's decision: cercit+admin@gmail.com (role admin) holds all 32 rights.
-- Four pairs normally can't sit on one role (permission_conflicts), so the admin
-- gets a waiver for each, like the app.decide + user.manage one from 26 Sep.
-- The other built-in check still holds: nobody approves their own policy,
-- pricing, model or role change (the approver must be someone else).
-- Remove before real data (review by 1 Nov 2026). Safe to run more than once.

-- 1. Waivers for the four clashing pairs
INSERT INTO role_conflict_waivers (role_code, permission_a, permission_b, reason, review_by)
SELECT 'admin', c.permission_a, c.permission_b,
       'Decision 3 Oct 2026: demo admin has master access during the build. Approver must still be someone else. Remove before real data.',
       DATE '2026-11-01'
FROM permission_conflicts c
WHERE NOT EXISTS (SELECT 1 FROM role_conflict_waivers w
                  WHERE w.role_code = 'admin' AND w.permission_a = c.permission_a AND w.permission_b = c.permission_b);

-- 2. Every right to the admin role
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'admin', p.code
FROM permissions p
WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_code = 'admin' AND rp.permission_code = p.code);

-- 3. Audit entry
INSERT INTO audit_events (event_type, actor_type, event_detail)
VALUES ('ROLE_RIGHTS_CHANGED', 'SYSTEM',
        jsonb_build_object('role', 'admin', 'change', 'master access: all rights granted', 'migration', '081'));

-- Result: should read 32 of 32
SELECT (SELECT count(*) FROM role_permissions WHERE role_code = 'admin') AS admin_rights,
       (SELECT count(*) FROM permissions) AS all_rights;
