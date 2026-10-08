-- 083: the Credit Head writes, the Admin approves (9 Oct 2026)
-- Sameer's decision: only the Admin approves credit rules, the risk model,
-- role rights and the rate grid; the Credit Head proposes them. Nobody can
-- approve their own change, so the Admin stops proposing these four.
--
--   Credit Head  loses: policy.approve, model.approve, role.approve, pricing.approve
--                gains: role.manage (propose a role change)
--   Admin        loses: policy.author, model.propose, role.manage, pricing.author
--                keeps: viewing and approving all four, emergency rule switch-off,
--                       simulation, users, organisation, cases
--
-- No new clashing pair. Safe to run more than once.

DELETE FROM role_permissions
WHERE (role_code = 'credit_head' AND permission_code IN ('policy.approve', 'model.approve', 'role.approve', 'pricing.approve'))
   OR (role_code = 'admin'       AND permission_code IN ('policy.author', 'model.propose', 'role.manage', 'pricing.author'));

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'credit_head', 'role.manage'
WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_code = 'credit_head' AND permission_code = 'role.manage');

UPDATE roles SET description = 'Credit head, also covering credit policy and compliance. Proposes rule, model, rate and role changes; the Admin approves them (9 Oct 2026)', updated_at = now()
WHERE code = 'credit_head';

INSERT INTO audit_events (event_type, actor_type, event_detail)
VALUES ('ROLE_RIGHTS_CHANGED', 'SYSTEM',
        jsonb_build_object('change', 'Credit Head proposes rules, model, rates and roles; Admin approves them', 'migration', '083'));

-- Result: each row should show the Head proposing and the Admin approving
SELECT p.permission_code AS right_code,
       string_agg(rp.role_code, ', ' ORDER BY rp.role_code) AS held_by
FROM (VALUES ('policy.author'), ('policy.approve'), ('model.propose'), ('model.approve'),
             ('pricing.author'), ('pricing.approve'), ('role.manage'), ('role.approve')) p(permission_code)
LEFT JOIN role_permissions rp ON rp.permission_code = p.permission_code
LEFT JOIN roles r ON r.code = rp.role_code
WHERE r.is_active IS NOT FALSE
GROUP BY p.permission_code
ORDER BY p.permission_code;
