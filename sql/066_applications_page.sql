-- =============================================================================
-- 066: Applications list a page at a time, searched in the database (fix list C4)
-- =============================================================================
-- The Applications page was slow to open (Sameer, 2 Oct). It loaded all
-- ~2,000 cases at once through fn_list_applications, then asked for the
-- server engine's decisions by sending every case number in one request (a
-- very long address that can fail), then searched and sorted in the browser.
--
-- fn_list_applications_page(...) does the work in the database and returns
-- one page:
--   * search: case number, applicant name or employer (contains), the last 4
--     of a PAN, or a whole PAN (matched by its blind index, never decrypted)
--   * statuses: a list of database statuses to keep (empty = all)
--   * sort: submitted (default, newest first), name, loan, cibil or status
--   * page / page size (50 by default, at most 200)
-- Each row carries the same columns as fn_list_applications plus the server
-- engine's latest decision, so no second request is needed. The first page
-- is filtered and counted on the cases table alone; the bureau score,
-- decision and car are looked up for the 50 rows shown (or, when sorting by
-- score, for the filtered cases).
--
-- Same visibility as fn_list_applications: any app.view right; a real
-- customer's case only for staff who may see real customers, and never a
-- draft they have not sent; officers see their own and unassigned cases
-- (fn_staff_case_scope, 061; fix list B2).
--
-- Read only. Run order: after 065. Safe to re-run. fn_list_applications stays
-- as it is for the other screens that use it.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_bureau_reports_application ON bureau_reports (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_credit_decisions_application ON credit_decisions (application_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS ix_recommendations_application ON recommendations (application_id, created_at DESC);
-- (engine decisions by case and cases by date are already indexed: idx_engine_decisions_app in 033, idx_applications_created in 001)

CREATE OR REPLACE FUNCTION fn_list_applications_page(
  p_search    TEXT    DEFAULT NULL,
  p_statuses  TEXT[]  DEFAULT NULL,
  p_sort      TEXT    DEFAULT 'submitted',
  p_desc      BOOLEAN DEFAULT true,
  p_page      INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real   BOOLEAN;
  v_q      TEXT := nullif(btrim(coalesce(p_search, '')), '');
  v_hash   TEXT;
  v_size   INTEGER := LEAST(GREATEST(coalesce(p_page_size, 50), 1), 200);
  v_page   INTEGER := GREATEST(coalesce(p_page, 1), 1);
  v_sort   TEXT := CASE WHEN p_sort IN ('submitted', 'name', 'loan', 'cibil', 'status') THEN p_sort ELSE 'submitted' END;
  v_desc   BOOLEAN := coalesce(p_desc, true);
  v_total  BIGINT;
  v_rows   JSONB;
BEGIN
  PERFORM fn_require_any_permission(ARRAY['app.view.own', 'app.view.team', 'app.view.all']);
  v_real := fn_sees_real_customers();
  -- a whole PAN is looked up by its blind index
  IF v_q ~* '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN
    v_hash := fn_pii_hash(v_q);
  END IF;

  WITH filtered AS (
    SELECT a.id,
           CASE v_sort WHEN 'name' THEN lower(c.full_name) WHEN 'status' THEN a.status END AS sort_text,
           CASE v_sort WHEN 'loan' THEN coalesce(a.loan_amount_requested, q.loan_amount_requested)
                       WHEN 'cibil' THEN (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                                          ORDER BY x.created_at DESC LIMIT 1) END AS sort_num,
           a.created_at
    FROM applications a
    JOIN customers c ON c.id = a.customer_id
    CROSS JOIN fn_staff_case_scope() sc
    LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v_sort = 'loan'
    WHERE (a.origin IS DISTINCT FROM 'CUSTOMER' OR (v_real AND a.status <> 'DRAFT'))
      AND (sc.sees_all OR a.assigned_officer_id = sc.me OR (a.assigned_officer_id IS NULL AND sc.unassigned))
      AND (p_statuses IS NULL OR cardinality(p_statuses) = 0 OR a.status = ANY (p_statuses))
      AND (v_q IS NULL
           OR a.application_id ILIKE '%' || v_q || '%'
           OR c.full_name ILIKE '%' || v_q || '%'
           OR c.employer_name ILIKE '%' || v_q || '%'
           OR (length(v_q) = 4 AND upper(c.pan_last4) = upper(v_q))
           OR (v_hash IS NOT NULL AND c.pan_hash = v_hash))
  ),
  ordered AS (
    SELECT x.id, row_number() OVER (ORDER BY
             CASE WHEN v_desc THEN x.sort_text END DESC NULLS LAST,
             CASE WHEN NOT v_desc THEN x.sort_text END ASC NULLS LAST,
             CASE WHEN v_desc THEN x.sort_num END DESC NULLS LAST,
             CASE WHEN NOT v_desc THEN x.sort_num END ASC NULLS LAST,
             CASE WHEN v_desc THEN x.created_at END DESC,
             CASE WHEN NOT v_desc THEN x.created_at END ASC,
             x.id) AS ord
    FROM filtered x
  )
  SELECT (SELECT count(*) FROM filtered),
         (SELECT coalesce(jsonb_agg(r ORDER BY ord), '[]'::jsonb) FROM (
          SELECT p.ord, jsonb_build_object(
            'application_id', a.application_id,
            'full_name', c.full_name,
            'email', c.email,
            'mobile', fn_pii_mask(c.mobile_last4, 10),
            'employer_name', c.employer_name,
            'age_at_application', c.age_at_application,
            'pan_number', fn_pii_mask(c.pan_last4, 10),
            'city', c.city,
            'state_code', c.state_code,
            'status', a.status,
            'loan_amount_requested', coalesce(a.loan_amount_requested, q.loan_amount_requested),
            'tenure_months', coalesce(a.tenure_months, q.tenure_months),
            'declared_net_salary', a.declared_net_salary,
            'vehicle_make', coalesce(v.make, q.make),
            'vehicle_model', coalesce(v.model, q.model),
            'vehicle_variant', coalesce(v.variant, q.variant),
            'ex_showroom_price', coalesce(v.ex_showroom_price, q.ex_showroom),
            'on_road_price', coalesce(v.on_road_price, q.on_road),
            'dealer_name', coalesce(d.dealer_name, q.dealer_name),
            'cibil_score', br.score,
            'decision', cd.decision,
            'rate', cd.sanctioned_rate,
            'foir_pct', r.foir_calculated,
            'ltv_pct', r.ltv_calculated,
            'officer_name', u.full_name,
            'created_at', a.created_at,
            'origin', a.origin,
            'engine_decision', ed.decision) AS r
          FROM ordered p
          JOIN applications a ON a.id = p.id
          JOIN customers c ON c.id = a.customer_id
          LEFT JOIN vehicles v ON v.application_id = a.id
          LEFT JOIN dealers d ON d.id = v.dealer_id
          LEFT JOIN vehicle_quotations q ON q.application_id = a.id AND v.id IS NULL
          LEFT JOIN LATERAL (SELECT x.score FROM bureau_reports x WHERE x.application_id = a.id
                             ORDER BY x.created_at DESC LIMIT 1) br ON true
          LEFT JOIN LATERAL (SELECT x.decision, x.sanctioned_rate FROM credit_decisions x WHERE x.application_id = a.id
                             ORDER BY x.decided_at DESC NULLS LAST LIMIT 1) cd ON true
          LEFT JOIN LATERAL (SELECT x.foir_calculated, x.ltv_calculated FROM recommendations x WHERE x.application_id = a.id
                             ORDER BY x.created_at DESC LIMIT 1) r ON true
          LEFT JOIN LATERAL (SELECT x.decision FROM engine_decisions x WHERE x.application_id = a.id
                             ORDER BY x.decided_at DESC LIMIT 1) ed ON true
          LEFT JOIN users u ON u.id = a.assigned_officer_id
          WHERE p.ord > (v_page - 1) * v_size AND p.ord <= v_page * v_size
         ) t)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'page', v_page, 'page_size', v_size, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION fn_list_applications_page(TEXT, TEXT[], TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_list_applications_page(TEXT, TEXT[], TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

-- Check after running (as postgres):
-- SELECT fn_list_applications_page()->'total';                     -- every case (about 2,000)
-- SELECT jsonb_array_length(fn_list_applications_page()->'rows');  -- 50
