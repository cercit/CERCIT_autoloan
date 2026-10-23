-- =============================================================================
-- 094: the name matcher forgives letters a reader mixes up (23 Oct 2026)
-- =============================================================================
-- Found while testing the sample documents: the document reader read a capital
-- I as a lower-case l, so "Iyer" became "lyer". With 090 a slip is forgiven only
-- in words of 5+ letters, so "Asha Ramesh lyer" against "Asha Ramesh Iyer"
-- scored 0.67 and the name check failed. Digits get mixed up too (M0HAN, M1TTIMANI),
-- and fn_doc_words dropped digits, which split the word in two.
--
-- Now:
--   * fn_doc_words reads 0 as o and 1 as i before dropping other characters;
--   * fn_doc_name_score treats l and i as the same letter on both sides.
-- So "ASHA RAMESH lyer" = "Asha Ramesh Iyer" and "M0HAN" = "Mohan" (1.00).
-- Different people still don't match; employer matching (fn_doc_org_score) gets
-- the same benefit through fn_doc_name_score.
--
-- The AWS cross-document check (cross_validator) gets the same change.
-- Run order: after 093. Safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_doc_words(p TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(fn_doc_word_canon(w)), '{}') FROM unnest(regexp_split_to_array(
           lower(regexp_replace(translate(coalesce(p, ''), '01', 'oi'), '[^A-Za-z ]', ' ', 'g')), '\s+')) AS w
  WHERE w <> '' AND w NOT IN ('mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'kumari', 'late');
$$;

-- 052 / 090, plus: l and i count as the same letter (094).
CREATE OR REPLACE FUNCTION fn_doc_name_score(p_a TEXT, p_b TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a TEXT[] := ARRAY(SELECT translate(x, 'l', 'i') FROM unnest(fn_doc_words(p_a)) AS x);
  b TEXT[] := ARRAY(SELECT translate(x, 'l', 'i') FROM unnest(fn_doc_words(p_b)) AS x);
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

-- Check after running:
-- SELECT fn_doc_name_score('ASHA RAMESH lyer', 'Asha Ramesh Iyer') AS a,   -- 1.00
--        fn_doc_name_score('M0HAN SHARMA', 'Mohan Sharma') AS b,           -- 1.00
--        fn_doc_name_score('Asha R', 'Priya Sharma') AS c;                 -- 0
