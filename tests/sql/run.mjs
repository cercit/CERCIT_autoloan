// SQL tests: every migration loads, and the policy / PII / switch guards hold.
// Run: node tests/sql/run.mjs
import { migratedDb, makeChecker } from "./harness.mjs";

const A = "aaaaaaaa-0000-0000-0000-00000000000a"; // policy manager
const B = "bbbbbbbb-0000-0000-0000-00000000000b"; // credit head
let failures = 0;

// ---------------------------------------------------------------------------
// 1. Migrations
// ---------------------------------------------------------------------------
const { db, failures: migrationFailures, files } = await migratedDb();
{
  const t = makeChecker(`migrations (${files.length} files)`);
  t.equal("all migrations load", migrationFailures, []);
  failures += t.report();
  if (migrationFailures.length) {
    console.log("\nStopping: later checks depend on every migration loading.");
    process.exit(1);
  }
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
// Supabase's API sets these per request; no role means a direct database session.
const asApi = (role, sub = "") =>
  db.query("select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)", [role, sub]);
const asOperator = () => asApi("", "");

// ---------------------------------------------------------------------------
// 2. Feature switches
// ---------------------------------------------------------------------------
{
  const t = makeChecker("feature switches");
  const r = await one("select count(*)::int as n, bool_or(enabled) as any_on from feature_flags");
  t.equal("ten switches seeded, all off", r, { n: 10, any_on: false });
  t.equal("unknown switch reads off", (await one("select fn_feature_enabled('no_such_flag') as v")).v, false);
  await t.ok("switch change is recorded", async () => {
    await db.query("update feature_flags set enabled = true where flag_key = 'kyc_module'");
    const h = await one("select old_enabled, new_enabled from feature_flag_history where flag_key = 'kyc_module' order by changed_at desc limit 1");
    if (!(h.old_enabled === false && h.new_enabled === true)) throw new Error(JSON.stringify(h));
    await db.query("update feature_flags set enabled = false where flag_key = 'kyc_module'");
  });
  await t.rejects("bad switch key", () => db.query("insert into feature_flags (flag_key, module, description) values ('Bad-Key', 'x', 'x')"), /ck_feature_flags_key/);
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 3. PII encryption (012/013)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("PII at rest");
  const r = await one("select count(*) filter (where pan_number is not null or mobile is not null)::int as plaintext, count(*) filter (where mobile_enc is null)::int as missing_mobile from customers");
  t.equal("no plaintext after backfill", r, { plaintext: 0, missing_mobile: 0 });
  const ins = await one("insert into customers (full_name, email, mobile, pan_number) values ('T', 't1@example.com', '9876500001', 'QWERT1234Y') returning pan_number, mobile, pan_last4, mobile_last4");
  t.equal("insert is encrypted and masked", ins, { pan_number: null, mobile: null, pan_last4: "234Y", mobile_last4: "0001" });
  await t.rejects("customer without mobile", () => db.query("insert into customers (full_name, email) values ('T', 't2@example.com')"), /ck_customers_mobile_present/);
  await t.rejects("duplicate PAN in another case", () => db.query("insert into customers (full_name, email, mobile, pan_number) values ('T', 't3@example.com', '9876500003', 'qwert1234y ')"), /uk_customers_pan_hash/);
  const masked = await one("select pan_number from fn_list_applications() limit 1");
  t.equal("list view is masked", /^X{6}\w{4}$/.test(masked.pan_number), true);

  await db.query("insert into users (email, full_name, role, auth_user_id) values ('v@t.in', 'Viewer', 'viewer', '11111111-1111-1111-1111-111111111111'), ('o@t.in', 'Officer', 'credit_officer', '22222222-2222-2222-2222-222222222222')");
  const cid = (await one("select id from customers where email = 't1@example.com'")).id;
  await asApi("anon");
  await t.rejects("reveal without login", () => db.query("select * from fn_customer_pii($1, 'x')", [cid]), /not authenticated/);
  await asApi("authenticated", "11111111-1111-1111-1111-111111111111");
  await t.rejects("reveal as viewer", () => db.query("select * from fn_customer_pii($1, 'x')", [cid]), /permission denied: pii.reveal/);
  await asApi("authenticated", "22222222-2222-2222-2222-222222222222");
  const rev = await one("select pan_number, mobile from fn_customer_pii($1, 'case review')", [cid]);
  t.equal("officer reveal decrypts", rev, { pan_number: "QWERT1234Y", mobile: "9876500001" });
  const audit = await one("select count(*)::int as n from audit_events where event_type = 'PII_REVEAL' and event_detail->>'reason' = 'case review'");
  t.equal("reveal is audited", audit.n, 1);
  const actor = await one("select a.actor_type, u.email from audit_events a join users u on u.id = a.actor_id where a.event_type = 'PII_REVEAL'");
  t.equal("reveal names the officer", actor, { actor_type: "OFFICER", email: "o@t.in" });
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 4. Server-side permission checks (018/019)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("permission checks");
  const VIEWER = "11111111-1111-1111-1111-111111111111";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const PM = "33333333-3333-3333-3333-333333333333";
  const GONE = "44444444-4444-4444-4444-444444444444";
  const CUSTOMER = "55555555-5555-5555-5555-555555555555";
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('pm2@t.in', 'PM', 'policy_manager', $1)", [PM]);
  await db.query("insert into users (email, full_name, role, auth_user_id, is_active) values ('left@t.in', 'Left', 'credit_officer', $1, false)", [GONE]);
  const appId = (await one("select application_id from applications order by created_at limit 1")).application_id;

  t.equal("mapping mirrors auth.ts for officer", (await one("select fn_role_permissions('credit_officer') @> array['app.decide','pii.reveal'] as v")).v, true);
  t.equal("policy manager cannot decide", (await one("select 'app.decide' = any(fn_role_permissions('policy_manager')) as v")).v, false);
  t.equal("unknown role has no rights", (await one("select cardinality(fn_role_permissions('nobody')) as n")).n, 0);

  await asOperator();
  await t.ok("SQL editor session is trusted", () => db.query("select * from fn_list_applications()"));

  await asApi("anon");
  await t.rejects("list without login", () => db.query("select * from fn_list_applications()"), /not authenticated/);
  await asApi("authenticated", CUSTOMER);
  await t.rejects("list as a customer login", () => db.query("select * from fn_list_applications()"), /no active cercit user/);
  await asApi("authenticated", GONE);
  await t.rejects("list as a deactivated officer", () => db.query("select * from fn_list_applications()"), /no active cercit user/);
  await asApi("authenticated", VIEWER);
  await t.ok("list as viewer", () => db.query("select * from fn_list_applications()"));
  await t.rejects("decide as viewer", () => db.query("select fn_officer_decision($1, 'APPROVE')", [appId]), /permission denied: app.decide/);
  await asApi("authenticated", PM);
  await t.rejects("decide as policy manager", () => db.query("select fn_officer_decision($1, 'APPROVE')", [appId]), /permission denied: app.decide/);
  // 006 wraps its body in an error handler, so a refusal comes back as a result, not an exception
  const refused = await one("select fn_submit_full_application(p_full_name => 'X', p_email => 'x1@t.in', p_mobile => '9000000011') as v");
  t.equal("submit as policy manager is refused", [refused.v.error, refused.v.summary], [true, "permission denied: app.create"]);
  await asOperator();
  t.equal("refused submit writes nothing", (await one("select count(*)::int as n from customers where email = 'x1@t.in'")).n, 0);
  await asApi("authenticated", PM);

  await asApi("authenticated", OFFICER);
  await t.ok("decide as officer", () => db.query("select fn_officer_decision($1, 'REJECT', 'test')", [appId]));
  const ev = await one("select a.actor_type, u.email from audit_events a left join users u on u.id = a.actor_id where a.event_type = 'OFFICER_DECISION' order by a.created_at desc limit 1");
  t.equal("decision names the officer", ev, { actor_type: "OFFICER", email: "o@t.in" });
  await t.ok("submit as officer", () => db.query("select fn_submit_full_application(p_full_name => 'New Applicant', p_email => 'new1@t.in', p_mobile => '9000000012', p_pan => 'NEWPA1234N', p_net_salary => 90000, p_loan_amount => 600000, p_ex_showroom => 700000, p_on_road => 780000, p_cibil_score => 770)"));

  await asApi("anon");
  await db.query("set role anon");
  await t.rejects("anon cannot execute officer decision", () => db.query("select fn_officer_decision($1, 'APPROVE')", [appId]), /permission denied for function/);
  await t.rejects("anon cannot execute submission", () => db.query("select fn_submit_full_application(p_full_name => 'X', p_email => 'x2@t.in', p_mobile => '9000000013')"), /permission denied for function/);
  await t.rejects("anon cannot execute policy engine", () => db.query("select fn_run_policy_engine(gen_random_uuid())"), /permission denied for function/);
  await db.query("reset role");
  await asApi("authenticated", OFFICER);
  await db.query("set role authenticated");
  await t.rejects("app user cannot call pipeline steps directly", () => db.query("select fn_assess_application(gen_random_uuid())"), /permission denied for function/);
  await db.query("reset role");

  // 020: policy and pricing tables are read-only through the API
  await db.query("set role authenticated");
  await t.rejects("app user edits a credit rule directly", () => db.query("update policy_rules set is_active = false"), /permission denied for table policy_rules/);
  await t.rejects("app user edits the rate grid directly", () => db.query("update rate_grid set rate_pct = 1"), /permission denied for table rate_grid/);
  await t.rejects("app user turns a module switch on", () => db.query("update feature_flags set enabled = true"), /permission denied for table feature_flags/);
  await t.rejects("app user writes a policy version", () => db.query("insert into policy_versions (version_code, rationale) values ('x9', 'x')"), /permission denied for table policy_versions/);
  await t.ok("app user can still read the rate grid", () => db.query("select * from rate_grid"));
  await db.query("reset role");
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 5. Row-level security (009)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("row-level security");
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const CUSTOMER = "55555555-5555-5555-5555-555555555555";
  const GONE = "44444444-4444-4444-4444-444444444444";
  const officerId = (await one("select id from users where auth_user_id = $1", [OFFICER])).id;
  const viewerId = (await one("select id from users where email = 'v@t.in'")).id;
  const count = async (table) => (await one(`select count(*)::int as n from ${table}`)).n;

  await db.query("set role authenticated");
  await asApi("authenticated", CUSTOMER);
  t.equal("customer login sees no applicants", await count("customers"), 0);
  t.equal("customer login sees no applications", await count("applications"), 0);
  t.equal("customer login sees no staff", await count("users"), 0);
  t.equal("customer login sees no audit trail", await count("audit_events"), 0);
  await t.rejects("customer login writes an audit entry", () => db.query("insert into audit_events (event_type, event_detail, actor_type) values ('X', '{}', 'USER')"), /row-level security/);

  await asApi("authenticated", GONE);
  t.equal("deactivated officer sees no applicants", await count("customers"), 0);

  await asApi("authenticated", OFFICER);
  t.equal("officer sees applicants", (await count("customers")) > 0, true);
  t.equal("officer sees applications", (await count("applications")) > 0, true);
  const promoted = await db.query("update users set role = 'admin' where auth_user_id = $1 returning id", [OFFICER]);
  t.equal("officer cannot change own role", promoted.rows.length, 0);
  await t.ok("officer writes a note in own name", () => db.query("insert into audit_events (event_type, event_detail, actor_type, actor_id) values ('OFFICER_NOTE', '{}', 'OFFICER', $1)", [officerId]));
  await t.rejects("officer writes a note in someone else's name", () => db.query("insert into audit_events (event_type, event_detail, actor_type, actor_id) values ('OFFICER_NOTE', '{}', 'OFFICER', $1)", [viewerId]), /row-level security/);
  await t.rejects("officer writes a note with no name", () => db.query("insert into audit_events (event_type, event_detail, actor_type) values ('OFFICER_NOTE', '{}', 'OFFICER')"), /row-level security/);
  await db.query("reset role");
  await asOperator();
  t.equal("role really unchanged", (await one("select role from users where auth_user_id = $1", [OFFICER])).role, "credit_officer");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 6. Versioned policy (016/017)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("versioned policy");
  await asOperator();
  await db.query(`insert into users (id, email, full_name, role) values ($1, 'pm@t.in', 'Policy Manager', 'policy_manager'), ($2, 'ch@t.in', 'Credit Head', 'credit_head')`, [A, B]);

  const base = await one("select id, status, is_baseline from policy_versions where version_code = '2026.08'");
  t.equal("baseline is active", [base.status, base.is_baseline], ["ACTIVE", true]);
  t.equal("22 baseline settings", (await one("select count(*)::int as n from policy_parameters where policy_version_id = $1", [base.id])).n, 22);
  t.equal("rate read through function", (await one("select fn_policy_param('pricing.base_rate.approve') as v")).v, 8.99);
  const doc = await one("select document_sha256, document->'nodes'->1->'content'->>'hitPolicy' as hit from fn_policy_document_at()");
  t.equal("rules document stored with hash", [doc.document_sha256.length, doc.hit], [64, "collect"]);
  t.equal("nothing in force before 1 Aug 2026", (await one("select fn_policy_version_at('CAR_NEW', '2026-07-31T00:00:00+05:30') as v")).v, null);

  // 021: unified rules stored as a draft, not live
  const d9 = await one("select v.status, v.tier, v.base_version_id = $1 as based_on_baseline, (select count(*)::int from policy_parameters p where p.policy_version_id = v.id) as params, (select document->'nodes'->1->>'name' from policy_documents d where d.policy_version_id = v.id) as table_name from policy_versions v where version_code = '2026.09'", [base.id]);
  t.equal("2026.09 stored as a draft", d9, { status: "DRAFT", tier: "MATERIAL", based_on_baseline: true, params: 22, table_name: "Credit policy 2026.09" });
  t.equal("baseline still the live version", (await one("select version_code from fn_policy_document_at()")).version_code, "2026.08");

  // Live content is frozen
  await t.rejects("edit live setting", () => db.query("update policy_parameters set value = '9.5' where policy_version_id = $1 and param_key = 'pricing.base_rate.approve'", [base.id]), /cannot change/);
  await t.rejects("edit live rules", () => db.query("update policy_documents set document = '{}' where policy_version_id = $1", [base.id]), /cannot change/);
  await t.rejects("delete live setting", () => db.query("delete from policy_parameters where policy_version_id = $1 and param_key = 'pricing.loading.cat_a'", [base.id]), /cannot change/);
  await t.rejects("delete a version", () => db.query("delete from policy_versions where id = $1", [base.id]), /never deleted/);
  await t.rejects("move live start date", () => db.query("update policy_versions set effective_from = now() where id = $1", [base.id]), /cannot change/);
  await t.rejects("new version not starting as draft", () => db.query("insert into policy_versions (version_code, status, rationale) values ('x1', 'ACTIVE', 'x')"), /must start as DRAFT/);

  // A draft
  const draft = await one("insert into policy_versions (version_code, base_version_id, rationale, authored_by, tier) values ('2026.10', $1, 'Raise Category C loading', $2, 'MATERIAL') returning id", [base.id, A]);
  await db.query("insert into policy_parameters (policy_version_id, param_key, value) select $1, param_key, value from policy_parameters where policy_version_id = $2", [draft.id, base.id]);
  await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents where policy_version_id = $2", [draft.id, base.id]);
  await t.ok("draft setting can change", () => db.query("update policy_parameters set value = '1.5' where policy_version_id = $1 and param_key = 'pricing.loading.cat_c'", [draft.id]));
  await t.rejects("value above maximum", () => db.query("update policy_parameters set value = '45' where policy_version_id = $1 and param_key = 'pricing.base_rate.maybe'", [draft.id]), /above the maximum/);
  await t.rejects("text where a number belongs", () => db.query(`update policy_parameters set value = '"nine"' where policy_version_id = $1 and param_key = 'pricing.base_rate.maybe'`, [draft.id]), /must be a number/);
  await t.rejects("unknown setting key", () => db.query("insert into policy_parameters (policy_version_id, param_key, value) values ($1, 'pricing.made_up', '1')", [draft.id]), /fk_policy_parameters_key/);
  await t.rejects("draft straight to approved", () => db.query("update policy_versions set status = 'APPROVED', approved_by = $2, approved_at = now(), effective_from = now() where id = $1", [draft.id, B]), /cannot move from DRAFT to APPROVED/);

  // Submitted
  await db.query("update policy_versions set status = 'PENDING_APPROVAL', submitted_at = now() where id = $1", [draft.id]);
  await t.rejects("edit content once submitted", () => db.query("update policy_parameters set value = '2' where policy_version_id = $1 and param_key = 'pricing.loading.cat_c'", [draft.id]), /cannot change/);
  await t.rejects("edit rationale once submitted", () => db.query("update policy_versions set rationale = 'changed' where id = $1", [draft.id]), /can no longer be edited/);

  const cr = await one("insert into policy_change_requests (policy_version_id, title, requested_by) values ($1, 'Category C loading 1.25 → 1.5', $2) returning id", [draft.id, A]);
  await t.rejects("author reviews own change", () => db.query("insert into policy_change_reviews (change_request_id, reviewer_id, decision) values ($1, $2, 'APPROVE')", [cr.id, A]), /cannot review/);
  await t.ok("another person reviews", () => db.query("insert into policy_change_reviews (change_request_id, reviewer_id, decision) values ($1, $2, 'APPROVE')", [cr.id, B]));

  await t.rejects("author approves own version", () => db.query("update policy_versions set status = 'APPROVED', approved_by = $2, approved_at = now(), effective_from = '2026-10-01T00:00:00+05:30' where id = $1", [draft.id, A]), /four_eyes/);
  await t.rejects("approval without approver", () => db.query("update policy_versions set status = 'APPROVED', effective_from = '2026-10-01T00:00:00+05:30' where id = $1", [draft.id]), /approval_recorded/);
  await t.ok("credit head approves", () => db.query("update policy_versions set status = 'APPROVED', approved_by = $2, approved_at = now(), effective_from = '2026-10-01T00:00:00+05:30' where id = $1", [draft.id, B]));
  await t.rejects("approver changed afterwards", () => db.query("update policy_versions set approved_by = $2 where id = $1", [draft.id, A]), /already recorded/);

  // Activation
  await t.rejects("two active versions", () => db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]), /uq_policy_versions_one_active|ex_policy_versions_window/);
  await t.rejects("overlapping windows", async () => {
    await db.query("begin");
    try {
      await db.query("update policy_versions set status = 'SUPERSEDED', effective_to = '2026-10-02T00:00:00+05:30' where id = $1", [base.id]);
      await db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }, /ex_policy_versions_window/);
  await t.ok("supersede and activate", async () => {
    await db.query("begin");
    await db.query("update policy_versions set status = 'SUPERSEDED', effective_to = '2026-10-01T00:00:00+05:30' where id = $1", [base.id]);
    await db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]);
    await db.query("commit");
  });
  t.equal("new rate in force after 1 Oct", (await one("select fn_policy_param('pricing.loading.cat_c', 'CAR_NEW', '2026-10-15T00:00:00+05:30') as v")).v, 1.5);
  t.equal("old rate still readable for September", (await one("select fn_policy_param('pricing.loading.cat_c', 'CAR_NEW', '2026-09-15T00:00:00+05:30') as v")).v, 1.25);
  await t.rejects("superseded version reactivated", () => db.query("update policy_versions set status = 'ACTIVE' where id = $1", [base.id]), /cannot move from SUPERSEDED/);
  failures += t.report();
}

await db.close();
if (failures) {
  console.log(`\n${failures} SQL test(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll SQL tests passed");
}
