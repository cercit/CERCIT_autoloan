-- =============================================================================
-- 090: the name-match rule (KYC-NAME) is fed from the documents (22 Oct 2026)
-- =============================================================================
-- Before: KYC-NAME ("Name match across docs", >= 98, refers on fail) read
-- income_assessments.name_match_score, which almost nothing fills, so the rule
-- was skipped on 1,740 of 1,748 cases. Sameer decided on 22 Oct: feed it.
--
-- Now:
--   * fn_kyc_name_score(app): the weakest of the PAN and Aadhaar name matches
--     against the customer's name, 0-100, from what the document readers found.
--     NULL when no PAN or Aadhaar has been read (the rule then stays skipped,
--     as before; 088 already refers a case missing bank or income data).
--   * The engine reads the income check's score if there is one, else this.
--   * The name matcher (fn_doc_name_score, 052) gets better at Indian names:
--     common spelling variants count as the same word (Mohd / Mohammed,
--     Laxmi / Lakshmi, Shreenivas / Srinivasa, ...), and one wrong letter in a
--     word of 5+ letters still matches (a reader's slip: MITTlMANI).
--     Initials already matched (S = Shreenivas). Short words must be exact.
--
-- Not changed: the rule's threshold (98) and its result on fail (refer).
-- Those are policy, changed through Policy Rules (Head proposes, Admin approves).
-- The document checks' own name bar (0.80) is unchanged too.
--
-- How: new helper functions, fn_doc_words and fn_doc_name_score replaced, and
-- the engine patched in place (one checked text change), as 088 did.
-- Run order: after 089. Safe to re-run.
-- =============================================================================

-- Common spelling variants of Indian name words, mapped to one form.
CREATE OR REPLACE FUNCTION fn_doc_word_canon(w TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN w IN ('mohammed', 'mohammad', 'mohamed', 'mohamad', 'muhammad', 'muhammed', 'mohd', 'md') THEN 'mohammed'
    WHEN w IN ('lakshmi', 'laxmi', 'lakshmy', 'laxmy') THEN 'lakshmi'
    WHEN w IN ('srinivas', 'srinivasa', 'sreenivas', 'sreenivasa', 'shreenivas', 'shrinivas', 'shreenivasa', 'shrinivasa') THEN 'srinivas'
    WHEN w IN ('syed', 'sayed', 'saiyed', 'sayyed') THEN 'syed'
    WHEN w IN ('shaikh', 'shaik', 'sheikh', 'shk') THEN 'shaikh'
    WHEN w IN ('kumar', 'kr') THEN 'kumar'
    WHEN w IN ('venkatesh', 'venkatesha', 'venkatesan') THEN 'venkatesh'
    WHEN w IN ('krishna', 'krishnaa', 'krisna') THEN 'krishna'
    WHEN w IN ('narayan', 'narayana', 'narayanan') THEN 'narayan'
    WHEN w IN ('subramanian', 'subramaniam', 'subrahmanyam', 'subramanyam') THEN 'subramanian'
    ELSE w
  END;
$$;

-- Words of a name, lower case, titles dropped, variants mapped (052, plus the map).
CREATE OR REPLACE FUNCTION fn_doc_words(p TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(fn_doc_word_canon(w)), '{}') FROM unnest(regexp_split_to_array(
           lower(regexp_replace(coalesce(p, ''), '[^A-Za-z ]', ' ', 'g')), '\s+')) AS w
  WHERE w <> '' AND w NOT IN ('mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'kumari', 'late');
$$;

-- True when two words of 5+ letters differ by one letter (changed, added or dropped).
CREATE OR REPLACE FUNCTION fn_doc_one_slip(a TEXT, b TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  la INT := length(a);
  lb INT := length(b);
  i INT := 1;
BEGIN
  IF a = b OR least(la, lb) < 5 OR abs(la - lb) > 1 THEN
    RETURN false;
  END IF;
  WHILE i <= least(la, lb) AND substr(a, i, 1) = substr(b, i, 1) LOOP
    i := i + 1;
  END LOOP;
  IF la = lb THEN
    RETURN substr(a, i + 1) = substr(b, i + 1);   -- one letter changed
  ELSIF la > lb THEN
    RETURN substr(a, i + 1) = substr(b, i);       -- one letter added in a
  ELSE
    RETURN substr(a, i) = substr(b, i + 1);       -- one letter dropped from a
  END IF;
END;
$$;

-- Share of the shorter name's words found in the longer one (052). A single
-- letter matches a word it starts with ("Sameer S" and "SAMEER SHREENIVAS" = 1.0);
-- 090: one wrong letter in a 5+ letter word also matches. At least one whole
-- word must match.
CREATE OR REPLACE FUNCTION fn_doc_name_score(p_a TEXT, p_b TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a TEXT[] := fn_doc_words(p_a);
  b TEXT[] := fn_doc_words(p_b);
  s TEXT[];
  l TEXT[];
  w TEXT;
  hit INT := 0;
  whole INT := 0;
BEGIN
  IF cardinality(a) = 0 OR cardinality(b) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(a) <= cardinality(b) THEN s := a; l := b; ELSE s := b; l := a; END IF;
  FOREACH w IN ARRAY s LOOP
    IF w = ANY (l) THEN
      hit := hit + 1;
      IF length(w) > 1 THEN whole := whole + 1; END IF;
    ELSIF length(w) >= 5 AND EXISTS (SELECT 1 FROM unnest(l) x WHERE fn_doc_one_slip(w, x)) THEN
      hit := hit + 1;
      whole := whole + 1;
    ELSIF EXISTS (SELECT 1 FROM unnest(l) x WHERE (length(w) = 1 AND left(x, 1) = w) OR (length(x) = 1 AND left(w, 1) = x)) THEN
      hit := hit + 1;
    END IF;
  END LOOP;
  RETURN CASE WHEN whole = 0 THEN 0 ELSE round(hit::NUMERIC / cardinality(s), 2) END;
END;
$$;

-- The weakest PAN / Aadhaar name match against the customer, 0-100; NULL if none read.
CREATE OR REPLACE FUNCTION fn_kyc_name_score(p_app UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(min(fn_doc_name_score(fn_doc_read(p_app, r, 'name'), c.full_name)) * 100)
  FROM unnest(ARRAY['pan_card', 'aadhaar_card']) AS r
  JOIN applications a ON a.id = p_app
  JOIN customers c ON c.id = a.customer_id
  WHERE fn_doc_read(p_app, r, 'name') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION fn_kyc_name_score(UUID) FROM PUBLIC, anon, authenticated;

-- The engine reads it when the income check has no score of its own.
DO $$
DECLARE
  d TEXT := pg_get_functiondef('fn_run_policy_engine(uuid)'::regprocedure);
  n TEXT;
BEGIN
  IF d LIKE '%090: KYC-NAME fed%' THEN
    RAISE NOTICE '090 already applied';
    RETURN;
  END IF;
  n := replace(d, $q$WHEN 'name_match_score' THEN actual_val := income.name_match_score;$q$,
               $q$WHEN 'name_match_score' THEN actual_val := coalesce(income.name_match_score, fn_kyc_name_score(p_application_id));  -- 090: KYC-NAME fed$q$);
  IF n = d THEN RAISE EXCEPTION '090: name rule line not found'; END IF;
  EXECUTE n;
END;
$$;

-- Check after running:
-- SELECT pg_get_functiondef('fn_run_policy_engine(uuid)'::regprocedure) LIKE '%090: KYC-NAME fed%';   -- true
-- SELECT fn_doc_name_score('Mohd Irfan', 'MOHAMMED IRFAN');                                            -- 1.00
