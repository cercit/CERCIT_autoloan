-- =============================================================================
-- 092: tamper-evident audit log (R3, 22 Oct 2026)
-- =============================================================================
-- Before: app users couldn't edit or delete audit_events, but the database
-- owner could, without leaving a trace.
--
-- Now: every audit event, the moment it is written, gets a link in a hash
-- chain kept in its own table, audit_chain:
--     content_hash = sha256 of the event (id, case, type, detail, who, when)
--     link_hash    = sha256(previous link_hash || content_hash)
-- audit_chain can only be added to (update, delete and truncate are refused).
-- fn_audit_chain_verify() walks the chain and reports:
--     broken links  - the chain itself was rewritten
--     altered       - an event whose content no longer matches its hash
--     removed       - an event that is gone (legitimate after the synthetic
--                     purge or an erasure request; anything else needs a look)
-- A nightly AWS job (aws/lambdas/audit_export) copies new links and events to
-- an S3 bucket with Object Lock, so even rewriting the whole chain in the
-- database would no longer match the locked copy.
--
-- Existing events are chained once, oldest first, when this runs.
-- Run order: after 091. Safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_chain (
  seq           BIGSERIAL    PRIMARY KEY,
  event_id      UUID         NOT NULL,
  content_hash  TEXT         NOT NULL,
  prev_hash     TEXT         NOT NULL,
  link_hash     TEXT         NOT NULL,
  chained_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uk_audit_chain_event UNIQUE (event_id)
);
ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_chain FROM PUBLIC, anon, authenticated;

-- The fingerprint of one event.
CREATE OR REPLACE FUNCTION fn_audit_content_hash(e audit_events)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(concat_ws('|', e.id, e.application_id, e.event_type, e.event_detail::TEXT,
                                 e.actor_type, e.actor_id,
                                 to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION fn_audit_link(p_prev TEXT, p_content TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_prev || p_content, 'sha256'), 'hex');
$$;

-- Add one event to the chain (one writer at a time, so the chain never forks).
CREATE OR REPLACE FUNCTION fn_audit_chain_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev TEXT;
  v_content TEXT := fn_audit_content_hash(NEW);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cercit_audit_chain'));
  SELECT link_hash INTO v_prev FROM audit_chain ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  INSERT INTO audit_chain (event_id, content_hash, prev_hash, link_hash)
  VALUES (NEW.id, v_content, v_prev, fn_audit_link(v_prev, v_content));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain_add ON audit_events;
CREATE TRIGGER trg_audit_chain_add AFTER INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_add();

-- The chain can only grow.
CREATE OR REPLACE FUNCTION fn_audit_chain_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_chain can only be added to' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain_no_change ON audit_chain;
CREATE TRIGGER trg_audit_chain_no_change BEFORE UPDATE OR DELETE ON audit_chain
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_append_only();
DROP TRIGGER IF EXISTS trg_audit_chain_no_truncate ON audit_chain;
CREATE TRIGGER trg_audit_chain_no_truncate BEFORE TRUNCATE ON audit_chain
  FOR EACH STATEMENT EXECUTE FUNCTION fn_audit_chain_append_only();

-- Chain the events that already exist, oldest first.
DO $$
DECLARE
  e audit_events;
  v_prev TEXT;
  v_content TEXT;
BEGIN
  SELECT link_hash INTO v_prev FROM audit_chain ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  FOR e IN SELECT * FROM audit_events a
           WHERE NOT EXISTS (SELECT 1 FROM audit_chain c WHERE c.event_id = a.id)
           ORDER BY a.created_at, a.id LOOP
    v_content := fn_audit_content_hash(e);
    INSERT INTO audit_chain (event_id, content_hash, prev_hash, link_hash)
    VALUES (e.id, v_content, v_prev, fn_audit_link(v_prev, v_content));
    v_prev := fn_audit_link(v_prev, v_content);
  END LOOP;
END;
$$;

-- Walk the chain and say what, if anything, has changed.
CREATE OR REPLACE FUNCTION fn_audit_chain_verify()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  lnk RECORD;
  e audit_events;
  v_prev TEXT := 'GENESIS';
  v_links INT := 0;
  v_broken INT := 0;
  v_altered INT := 0;
  v_removed INT := 0;
  v_first BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM fn_require_permission('audit.view');
  END IF;
  FOR lnk IN SELECT * FROM audit_chain ORDER BY seq LOOP
    v_links := v_links + 1;
    IF lnk.prev_hash <> v_prev OR lnk.link_hash <> fn_audit_link(lnk.prev_hash, lnk.content_hash) THEN
      v_broken := v_broken + 1;
      v_first := coalesce(v_first, lnk.seq);
    END IF;
    SELECT * INTO e FROM audit_events WHERE id = lnk.event_id;
    IF NOT FOUND THEN
      v_removed := v_removed + 1;
    ELSIF fn_audit_content_hash(e) <> lnk.content_hash THEN
      v_altered := v_altered + 1;
      v_first := coalesce(v_first, lnk.seq);
    END IF;
    v_prev := lnk.link_hash;
  END LOOP;
  RETURN jsonb_build_object(
    'links', v_links, 'broken_links', v_broken, 'altered', v_altered, 'removed', v_removed,
    'unchained', (SELECT count(*) FROM audit_events ae WHERE NOT EXISTS (SELECT 1 FROM audit_chain ch WHERE ch.event_id = ae.id)),
    'head', v_prev, 'first_problem_seq', v_first,
    'ok', v_broken = 0 AND v_altered = 0);
END;
$$;
REVOKE ALL ON FUNCTION fn_audit_chain_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_audit_chain_verify() TO authenticated;

-- For the nightly copy to S3 (service key only): links after a sequence number, with their events.
CREATE OR REPLACE FUNCTION fn_audit_export(p_after_seq BIGINT, p_limit INT DEFAULT 5000)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'seq')::BIGINT), '[]'::JSONB) FROM (
    SELECT jsonb_build_object('seq', c.seq, 'event_id', c.event_id, 'content_hash', c.content_hash,
                              'prev_hash', c.prev_hash, 'link_hash', c.link_hash, 'chained_at', c.chained_at,
                              'event', to_jsonb(a)) AS x
    FROM audit_chain c LEFT JOIN audit_events a ON a.id = c.event_id
    WHERE c.seq > p_after_seq
    ORDER BY c.seq
    LIMIT least(greatest(p_limit, 1), 20000)
  ) t;
$$;
REVOKE ALL ON FUNCTION fn_audit_export(BIGINT, INT) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION fn_audit_export(BIGINT, INT) TO service_role;
  END IF;
END $$;

-- Check after running:
-- SELECT fn_audit_chain_verify();   -- ok: true, broken_links 0, altered 0, unchained 0
