// Local Postgres (PGlite) with Supabase-like stubs, loaded with sql/NNN_*.sql.
// Used by the SQL tests so migrations are checked before anyone runs them in Supabase.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const SQL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "sql");

// Supabase keeps extensions in their own schema and puts it on the search path.
// Mirroring that catches functions that pin search_path to public only.
const SUPABASE_STUBS = `
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  SET search_path TO "$user", public, extensions;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB, created_at TIMESTAMPTZ DEFAULT now());
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $f$ SELECT current_setting('request.jwt.claim.role', true) $f$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;

// Placeholder key so 012 can run locally; the real key is only ever set in Supabase.
const LOCAL_PII_KEY = "local-test-key-not-used-anywhere-else-0123456789";

export async function migratedDb({ upTo = 999 } = {}) {
  const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(SQL_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const failures = [];
  for (const f of files) {
    if (Number(f.slice(0, 3)) > upTo) break;
    let sql = readFileSync(join(SQL_DIR, f), "utf8");
    if (f.startsWith("012_")) sql = sql.replace("REPLACE_ME_WITH_A_LONG_RANDOM_KEY", LOCAL_PII_KEY);
    try {
      await db.exec(sql);
    } catch (e) {
      failures.push(`${f}: ${e.message.split("\n")[0]}`);
    }
  }
  return { db, failures, files };
}

export function makeChecker(label) {
  let passed = 0;
  const failed = [];
  return {
    async ok(name, fn) {
      try {
        await fn();
        passed++;
      } catch (e) {
        failed.push(`${name}: ${e.message.split("\n")[0]}`);
      }
    },
    async rejects(name, fn, pattern) {
      try {
        await fn();
        failed.push(`${name}: expected an error, none raised`);
      } catch (e) {
        if (pattern && !pattern.test(e.message)) failed.push(`${name}: wrong error — ${e.message.split("\n")[0]}`);
        else passed++;
      }
    },
    equal(name, actual, expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a === b) passed++;
      else failed.push(`${name}: expected ${b}, got ${a}`);
    },
    report() {
      console.log(`${label}: ${passed} passed, ${failed.length} failed`);
      for (const f of failed) console.log(`  FAIL ${f}`);
      return failed.length;
    },
  };
}
