-- cercit — returning customers by mobile, whatever stage they are at (28 Sep 2026)
--
-- The customer login now asks one question first: mobile number or email
-- (start-step.tsx). A number we know gets "welcome back" and a sign-in link to
-- the email on file. Until now the lookup (046) found only unfinished
-- applications, so a customer who had already submitted was treated as new.
-- It now finds the customer from any application; after the email code the
-- website sends them to their unfinished step, or to their tracking page.
--
-- Run order: after 050. Safe to re-run. No AWS change: the continue-link
-- service reads the same fields.

CREATE OR REPLACE FUNCTION fn_customer_resume_lookup(p_mobile TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('email', c.email, 'email_masked', fn_mask_email(c.email),
                            'application_id', a.application_id, 'step', a.onboarding_step, 'started', a.created_at,
                            'status', a.status)
  FROM customers c JOIN applications a ON a.customer_id = c.id AND a.origin = 'CUSTOMER'
  WHERE c.mobile_hash = fn_pii_hash(right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10))
  ORDER BY (a.status = 'DRAFT') DESC, a.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_customer_resume_lookup(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_customer_resume_lookup(TEXT) TO service_role;
