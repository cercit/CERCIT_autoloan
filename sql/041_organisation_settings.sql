-- cercit — organisation settings (backlog AD5.1)
--
-- One record per lender: who they are (legal name, CIN, RBI registration,
-- GSTIN, address), how customers reach them (support and grievance officer)
-- and which email domains staff accounts must use.
--
--   * an admin changes it (new right org.manage); every change is audited
--     with before and after values
--   * the public parts (name, registration, contacts, grievance officer) are
--     readable by anyone, because RBI digital-lending rules expect a lender to
--     publish them; the staff email domains are for staff only
--   * registration numbers start empty: this is a demo, and a made-up CIN or
--     RBI number must never appear as if it were real
--   * with "staff must use these domains" switched on, the database refuses a
--     staff account on any other domain, whichever screen or script adds it
--
-- Run order: after 040. Safe to re-run.

INSERT INTO permissions (code, module, description) VALUES
  ('org.manage', 'admin', 'Change the organisation''s details and staff email domains')
ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'admin', 'org.manage'
WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_code = 'admin' AND permission_code = 'org.manage');

CREATE TABLE IF NOT EXISTS organisation_settings (
  tenant_id                   UUID          NOT NULL DEFAULT fn_default_tenant_id(),
  company_name                VARCHAR(100)  NOT NULL,
  legal_name                  VARCHAR(200),
  cin                         VARCHAR(21),
  rbi_registration_no         VARCHAR(30),
  gstin                       VARCHAR(15),
  registered_address          TEXT,
  support_email               VARCHAR(255),
  support_phone               VARCHAR(20),
  grievance_officer_name      VARCHAR(100),
  grievance_officer_email     VARCHAR(255),
  grievance_officer_phone     VARCHAR(20),
  grievance_reply_days        SMALLINT      NOT NULL DEFAULT 7,
  staff_email_domains         TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  restrict_staff_domains      BOOLEAN       NOT NULL DEFAULT false,
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_by                  UUID,

  CONSTRAINT pk_organisation_settings        PRIMARY KEY (tenant_id),
  CONSTRAINT fk_organisation_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_organisation_settings_by     FOREIGN KEY (updated_by) REFERENCES users(id),
  -- CIN: L/U, 5-digit industry code, state, year, company type, 6-digit number
  CONSTRAINT ck_org_cin        CHECK (cin IS NULL OR cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  CONSTRAINT ck_org_gstin      CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  CONSTRAINT ck_org_rbi        CHECK (rbi_registration_no IS NULL OR rbi_registration_no ~ '^[A-Z0-9][A-Z0-9./-]{3,29}$'),
  CONSTRAINT ck_org_emails     CHECK ((support_email IS NULL OR support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                  AND (grievance_officer_email IS NULL OR grievance_officer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  CONSTRAINT ck_org_phones     CHECK ((support_phone IS NULL OR support_phone ~ '^[0-9+ ()-]{6,20}$')
                                  AND (grievance_officer_phone IS NULL OR grievance_officer_phone ~ '^[0-9+ ()-]{6,20}$')),
  CONSTRAINT ck_org_reply_days CHECK (grievance_reply_days BETWEEN 1 AND 30),
  CONSTRAINT ck_org_domains    CHECK (NOT restrict_staff_domains OR cardinality(staff_email_domains) > 0)
);

-- Today's public details, as shown on the site. Registration numbers stay empty.
INSERT INTO organisation_settings (company_name, support_email, support_phone, grievance_officer_email,
                                   grievance_reply_days, staff_email_domains)
VALUES ('cercit', 'support@cercit.in', '1800 000 0000', 'gro@cercit.in', 7, ARRAY['cercit.in', 'cercit.com'])
ON CONFLICT (tenant_id) DO NOTHING;

-- =============================================================================
-- Staff email domains, enforced on every write to users
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_users_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org organisation_settings%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND lower(NEW.email) = lower(OLD.email) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_org FROM organisation_settings WHERE tenant_id = fn_default_tenant_id();
  IF coalesce(v_org.restrict_staff_domains, false)
     AND NOT (lower(split_part(NEW.email, '@', 2)) = ANY (v_org.staff_email_domains)) THEN
    RAISE EXCEPTION 'staff accounts must use a company address (%)', array_to_string(v_org.staff_email_domains, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_email_domain ON users;
CREATE TRIGGER trg_users_email_domain
  BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW EXECUTE FUNCTION trg_users_email_domain();

-- =============================================================================
-- Read and change
-- =============================================================================

-- Anyone, signed in or not: what the footer and legal page show.
CREATE OR REPLACE FUNCTION fn_public_org_info()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'company_name', company_name, 'legal_name', legal_name, 'cin', cin,
    'rbi_registration_no', rbi_registration_no, 'gstin', gstin, 'registered_address', registered_address,
    'support_email', support_email, 'support_phone', support_phone,
    'grievance_officer_name', grievance_officer_name, 'grievance_officer_email', grievance_officer_email,
    'grievance_officer_phone', grievance_officer_phone, 'grievance_reply_days', grievance_reply_days)
  FROM organisation_settings
  WHERE tenant_id = fn_default_tenant_id();
$$;

-- Staff: everything, plus whether this person may change it.
CREATE OR REPLACE FUNCTION fn_org_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_row   organisation_settings%ROWTYPE;
BEGIN
  IF NOT fn_is_trusted_operator() AND fn_current_staff_id() IS NULL THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM organisation_settings WHERE tenant_id = fn_default_tenant_id();
  RETURN fn_public_org_info() || jsonb_build_object(
    'staff_email_domains', to_jsonb(v_row.staff_email_domains),
    'restrict_staff_domains', v_row.restrict_staff_domains,
    'updated_at', v_row.updated_at,
    'updated_by', (SELECT full_name FROM users WHERE id = v_row.updated_by),
    'can_manage', fn_has_permission('org.manage'));
END;
$$;

CREATE OR REPLACE FUNCTION fn_org_settings_save(p JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_before  JSONB;
  v_domains TEXT[];
  v_bad     TEXT;
  v_outside TEXT;
BEGIN
  v_actor := fn_require_permission('org.manage');

  IF nullif(trim(p->>'company_name'), '') IS NULL THEN
    RAISE EXCEPTION 'company name is required' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(trim(d)) ORDER BY lower(trim(d))), ARRAY[]::TEXT[]) INTO v_domains
  FROM jsonb_array_elements_text(coalesce(p->'staff_email_domains', '[]'::jsonb)) AS d
  WHERE trim(d) <> '';
  SELECT string_agg(d, ', ') INTO v_bad FROM unnest(v_domains) AS d WHERE d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'not an email domain: % (write it like cercit.in, without @)', v_bad USING ERRCODE = '22023';
  END IF;

  -- Switching the restriction on must not strand people already outside it.
  IF coalesce((p->>'restrict_staff_domains')::BOOLEAN, false) THEN
    SELECT string_agg(email, ', ') INTO v_outside FROM (
      SELECT email FROM users
      WHERE is_active AND NOT (lower(split_part(email, '@', 2)) = ANY (v_domains))
      ORDER BY email LIMIT 5) x;
    IF v_outside IS NOT NULL THEN
      RAISE EXCEPTION 'these active staff use other domains; change or suspend them first: %', v_outside USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT to_jsonb(o) - 'tenant_id' - 'updated_at' - 'updated_by' INTO v_before
  FROM organisation_settings o WHERE tenant_id = fn_default_tenant_id();

  UPDATE organisation_settings
  SET company_name            = trim(p->>'company_name'),
      legal_name              = nullif(trim(p->>'legal_name'), ''),
      cin                     = nullif(upper(trim(p->>'cin')), ''),
      rbi_registration_no     = nullif(upper(trim(p->>'rbi_registration_no')), ''),
      gstin                   = nullif(upper(trim(p->>'gstin')), ''),
      registered_address      = nullif(trim(p->>'registered_address'), ''),
      support_email           = nullif(lower(trim(p->>'support_email')), ''),
      support_phone           = nullif(trim(p->>'support_phone'), ''),
      grievance_officer_name  = nullif(trim(p->>'grievance_officer_name'), ''),
      grievance_officer_email = nullif(lower(trim(p->>'grievance_officer_email')), ''),
      grievance_officer_phone = nullif(trim(p->>'grievance_officer_phone'), ''),
      grievance_reply_days    = coalesce((p->>'grievance_reply_days')::SMALLINT, 7),
      staff_email_domains     = v_domains,
      restrict_staff_domains  = coalesce((p->>'restrict_staff_domains')::BOOLEAN, false),
      updated_at              = now(),
      updated_by              = v_actor
  WHERE tenant_id = fn_default_tenant_id();

  INSERT INTO audit_events (event_type, actor_type, actor_id, event_detail)
  SELECT 'ORG_SETTINGS_CHANGED', CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'OFFICER' END, v_actor,
         jsonb_build_object('before', v_before, 'after', to_jsonb(o) - 'tenant_id' - 'updated_at' - 'updated_by')
  FROM organisation_settings o WHERE tenant_id = fn_default_tenant_id();
END;
$$;

ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organisation_settings FROM anon, authenticated;
GRANT SELECT ON organisation_settings TO service_role;

REVOKE ALL ON FUNCTION trg_users_email_domain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fn_public_org_info() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_public_org_info() TO anon, authenticated;
REVOKE ALL ON FUNCTION fn_org_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_org_settings() TO authenticated;
REVOKE ALL ON FUNCTION fn_org_settings_save(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_org_settings_save(JSONB) TO authenticated;

-- Check after running:
-- SELECT fn_public_org_info();
