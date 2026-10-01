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

  // A draft. It is approved below to start on 1 Oct 2099, far in the future, so it
  // is never the version in force today; later sections expect 2026.08 to be.
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

  await t.rejects("author approves own version", () => db.query("update policy_versions set status = 'APPROVED', approved_by = $2, approved_at = now(), effective_from = '2099-10-01T00:00:00+05:30' where id = $1", [draft.id, A]), /four_eyes/);
  await t.rejects("approval without approver", () => db.query("update policy_versions set status = 'APPROVED', effective_from = '2099-10-01T00:00:00+05:30' where id = $1", [draft.id]), /approval_recorded/);
  await t.ok("credit head approves", () => db.query("update policy_versions set status = 'APPROVED', approved_by = $2, approved_at = now(), effective_from = '2099-10-01T00:00:00+05:30' where id = $1", [draft.id, B]));
  await t.rejects("approver changed afterwards", () => db.query("update policy_versions set approved_by = $2 where id = $1", [draft.id, A]), /already recorded/);

  // Activation
  await t.rejects("two active versions", () => db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]), /uq_policy_versions_one_active|ex_policy_versions_window/);
  await t.rejects("overlapping windows", async () => {
    await db.query("begin");
    try {
      await db.query("update policy_versions set status = 'SUPERSEDED', effective_to = '2099-10-02T00:00:00+05:30' where id = $1", [base.id]);
      await db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }, /ex_policy_versions_window/);
  await t.ok("supersede and activate", async () => {
    await db.query("begin");
    await db.query("update policy_versions set status = 'SUPERSEDED', effective_to = '2099-10-01T00:00:00+05:30' where id = $1", [base.id]);
    await db.query("update policy_versions set status = 'ACTIVE' where id = $1", [draft.id]);
    await db.query("commit");
  });
  t.equal("new rate in force after 1 Oct 2099", (await one("select fn_policy_param('pricing.loading.cat_c', 'CAR_NEW', '2099-10-15T00:00:00+05:30') as v")).v, 1.5);
  t.equal("old rate still readable for September", (await one("select fn_policy_param('pricing.loading.cat_c', 'CAR_NEW', '2026-09-15T00:00:00+05:30') as v")).v, 1.25);
  await t.rejects("superseded version reactivated", () => db.query("update policy_versions set status = 'ACTIVE' where id = $1", [base.id]), /cannot move from SUPERSEDED/);

  // 022: the rules engine on AWS reads the policy with the service role, and only reads.
  // The live database refused this until 022; the local stubs grant more than Supabase does.
  // Each statement runs in its own transaction: the first refusal would abort a shared one.
  const asServiceRole = (sql, params) => async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      return await db.query(sql, params);
    } finally {
      await db.query("rollback");
    }
  };
  await t.ok("service role reads the version in force", asServiceRole("select version_code from fn_policy_document_at()"));
  await t.ok("service role reads a setting", asServiceRole("select fn_policy_param('pricing.base_rate.approve')"));
  await t.rejects("service role writes a version", asServiceRole("update policy_versions set rationale = 'x' where id = $1", [base.id]), /permission denied/);
  await t.rejects("service role writes rules", asServiceRole("update policy_documents set document = '{}' where policy_version_id = $1", [base.id]), /permission denied/);
  await t.rejects("service role adds a version", asServiceRole("insert into policy_versions (version_code, rationale) values ('9999.01', 'x')"), /permission denied/);
  await t.rejects("service role changes a switch", asServiceRole("update feature_flags set enabled = true"), /permission denied/);

  failures += t.report();
}

// ---------------------------------------------------------------------------
// 7. Policy change workflow (023)
// ---------------------------------------------------------------------------
// On its own product line, so the dates here do not depend on the versions the
// section above left behind.
{
  const t = makeChecker("policy change workflow");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001";
  const HEAD = "bbbbbbbb-0000-0000-0000-000000000002";
  const CLERK = "cccccccc-0000-0000-0000-000000000003";
  await asOperator();
  await db.query(`insert into users (email, full_name, role, auth_user_id) values
    ('author@t.in', 'Policy Author', 'policy_manager', $1),
    ('head@t.in', 'Credit Head', 'credit_head', $2),
    ('clerk@t.in', 'Officer', 'credit_officer', $3)`, [AUTHOR, HEAD, CLERK]);
  const authorId = (await one("select id from users where auth_user_id = $1", [AUTHOR])).id;
  const headId = (await one("select id from users where auth_user_id = $1", [HEAD])).id;

  // A live baseline for this product, started yesterday
  const P = "CAR_TEST";
  const oldV = await one("insert into policy_versions (product, version_code, rationale, is_baseline) values ($1, 'T.1', 'test baseline', true) returning id", [P]);
  await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents limit 1", [oldV.id]);
  await db.query("update policy_versions set status = 'ACTIVE', effective_from = now() - interval '1 day' where id = $1", [oldV.id]);

  const v = await one("insert into policy_versions (product, version_code, base_version_id, rationale, tier) values ($1, 'T.2', $2, 'Tighten the enquiry rule', 'STANDARD') returning id", [P, oldV.id]);
  await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents where policy_version_id = $2", [v.id, oldV.id]);
  const later = new Date(Date.now() + 7 * 864e5).toISOString();

  // Proposing
  await asApi("authenticated", CLERK);
  await t.rejects("officer proposes a policy change", () => db.query("select fn_policy_submit($1, 'Tighten enquiries')", [v.id]), /permission denied: policy.author/);
  await asApi("authenticated", AUTHOR);
  await t.ok("policy manager proposes", () => db.query("select fn_policy_submit($1, 'Tighten enquiries', 'Three enquiries in 90 days instead of four')", [v.id]));
  t.equal("waiting for approval, author recorded",
    await one("select status, authored_by = $1 as mine from policy_versions where id = $2", [authorId, v.id]),
    { status: "PENDING_APPROVAL", mine: true });
  await t.rejects("proposing twice", () => db.query("select fn_policy_submit($1, 'Again')", [v.id]), /only a draft can be proposed/);
  t.equal("shows in the approval queue as the author's own",
    await one("select count(*)::int as n, bool_or(mine) as mine from fn_policy_pending() where version_code = 'T.2'"), { n: 1, mine: true });

  // Approving
  await asApi("authenticated", CLERK);
  await t.rejects("officer approves", () => db.query("select fn_policy_approve($1, $2)", [v.id, later]), /permission denied: policy.approve/);
  await asApi("authenticated", HEAD);
  await t.rejects("start date in the past", () => db.query("select fn_policy_approve($1, now() - interval '1 day')", [v.id]), /cannot start in the past/);
  await t.rejects("rejecting without a reason", () => db.query("select fn_policy_reject($1, '  ')", [v.id]), /a reason is required/);
  await t.rejects("someone else withdraws it", () => db.query("select fn_policy_withdraw($1)", [v.id]), /proposed by someone else/);

  // The author takes it back, then sends it again
  await asApi("authenticated", AUTHOR);
  await t.ok("author withdraws", () => db.query("select fn_policy_withdraw($1, 'needs a rethink')", [v.id]));
  t.equal("back to draft", (await one("select status from policy_versions where id = $1", [v.id])).status, "DRAFT");
  await t.ok("author proposes again", () => db.query("select fn_policy_submit($1, 'Tighten enquiries')", [v.id]));

  // Nobody approves their own change, even holding the right to approve
  await asOperator();
  const own = await one("insert into policy_versions (product, version_code, rationale, tier) values ($1, 'T.9', 'Written by the approver', 'STANDARD') returning id", [P]);
  await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents where policy_version_id = $2", [own.id, oldV.id]);
  await asApi("authenticated", HEAD);
  await t.ok("credit head may also write policy", () => db.query("select fn_policy_submit($1, 'Own change')", [own.id]));
  await t.rejects("approver approves own change", () => db.query("select fn_policy_approve($1, $2)", [own.id, later]), /someone else must approve/);
  await t.rejects("approver rejects own change", () => db.query("select fn_policy_reject($1, 'no')", [own.id]), /someone else must review/);
  t.equal("own change is marked as the approver's own in the queue",
    (await one("select mine from fn_policy_pending() where version_code = 'T.9'")).mine, true);
  t.equal("author of the other change is unchanged",
    (await one("select authored_by = $1 as v from policy_versions where id = $2", [authorId, v.id])).v, true);
  void headId;

  await asApi("authenticated", HEAD);
  await t.ok("credit head approves with a start date", () => db.query("select fn_policy_approve($1, $2, 'Agreed at the credit committee')", [v.id, later]));
  t.equal("approved, approver and date recorded",
    await one("select status, approved_by is not null as who, effective_from is not null as dated from policy_versions where id = $1", [v.id]),
    { status: "APPROVED", who: true, dated: true });
  t.equal("approval recorded as a review",
    await one("select decision, comment from policy_change_reviews order by reviewed_at desc limit 1"),
    { decision: "APPROVE", comment: "Agreed at the credit committee" });
  t.equal("queue no longer holds it", (await one("select count(*)::int as n from fn_policy_pending() where version_code = 'T.2'")).n, 0);
  t.equal("not live until its date", (await one("select version_code from fn_policy_document_at($1)", [P])).version_code, "T.1");

  // The scheduled job (CC1.2)
  await asOperator();
  t.equal("nothing due yet", (await one("select fn_policy_activate_due() as v")).v.activated, 0);
  await db.query("update policy_versions set effective_from = now() - interval '1 minute' where id = $1", [v.id]);
  t.equal("due version goes live", (await one("select fn_policy_activate_due() as v")).v.activated, 1);
  t.equal("T.2 is now the version in force", (await one("select version_code from fn_policy_document_at($1)", [P])).version_code, "T.2");
  const closed = await one("select effective_to, status from policy_versions where id = $1", [oldV.id]);
  const started = await one("select effective_from, status from policy_versions where id = $1", [v.id]);
  t.equal("previous version closed exactly where the new one starts",
    [String(closed.effective_to), closed.status, started.status],
    [String(started.effective_from), "SUPERSEDED", "ACTIVE"]);
  t.equal("yesterday's rules still readable",
    (await one("select version_code from fn_policy_document_at($1, now() - interval '12 hours')", [P])).version_code, "T.1");

  // Nobody reaches these functions without a login
  await db.query("set role anon");
  await t.rejects("anon cannot propose", () => db.query("select fn_policy_submit($1, 'x')", [v.id]), /permission denied for function/);
  await t.rejects("anon cannot approve", () => db.query("select fn_policy_approve($1, now())", [v.id]), /permission denied for function/);
  await db.query("reset role");
  await db.query("set role authenticated");
  await t.rejects("app user cannot run the activation job", () => db.query("select fn_policy_activate_due()"), /permission denied for function/);
  await db.query("reset role");
  await asOperator();

  failures += t.report();
}

// ---------------------------------------------------------------------------
// 8. Writing a policy draft (024)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("policy draft editing");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001";
  const HEAD = "bbbbbbbb-0000-0000-0000-000000000002";
  const CLERK = "cccccccc-0000-0000-0000-000000000003";
  await asOperator();
  const liveCode = (await one("select version_code from fn_policy_document_at()")).version_code;
  const liveRate = (await one("select fn_policy_param('pricing.base_rate.approve') as v")).v;

  await asApi("authenticated", CLERK);
  await t.rejects("officer starts a draft", () => db.query("select fn_policy_draft_create('X.1', 'test')"), /permission denied: policy.author/);
  await asApi("authenticated", AUTHOR);
  await t.rejects("draft without a reason", () => db.query("select fn_policy_draft_create('X.1', '  ')"), /a reason for the change is required/);

  const made = (await one("select fn_policy_draft_create('2027.01', 'Rate review for Q1', 'STANDARD') as v")).v;
  const draftId = made.versionId;
  t.equal("draft copied from the version in force", await one("select status, base_version_id = $1 as based_on_live, authored_by is not null as owned from policy_versions where id = $2",
    [(await one("select fn_policy_version_at() as v")).v, draftId]), { status: "DRAFT", based_on_live: true, owned: true });
  t.equal("settings and rules came with it", await one("select (select count(*)::int from policy_parameters where policy_version_id = $1) as params, (select count(*)::int from policy_documents where policy_version_id = $1) as docs", [draftId]),
    { params: 22, docs: 1 });

  // Changing settings
  await t.ok("author changes a setting", () => db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '9.25'::jsonb)", [draftId]));
  t.equal("new value on the draft, live value untouched",
    [(await one("select value from policy_parameters where policy_version_id = $1 and param_key = 'pricing.base_rate.approve'", [draftId])).value,
     (await one("select fn_policy_param('pricing.base_rate.approve') as v")).v], [9.25, liveRate]);
  await t.rejects("value above the allowed maximum", () => db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '45'::jsonb)", [draftId]), /above the maximum/);
  await t.rejects("text where a number belongs", () => db.query(`select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '"nine"'::jsonb)`, [draftId]), /must be a number/);
  await t.rejects("setting that does not exist", () => db.query("select fn_policy_draft_set_param($1, 'pricing.invented', '1'::jsonb)", [draftId]), /fk_policy_parameters_key/);

  // Somebody else's draft
  await asApi("authenticated", HEAD);
  await t.rejects("another person edits the draft", () => db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '9.5'::jsonb)", [draftId]), /belongs to someone else/);
  await t.rejects("another person discards the draft", () => db.query("select fn_policy_draft_discard($1)", [draftId]), /belongs to someone else/);

  // The settings view shows draft against live
  await asApi("authenticated", AUTHOR);
  const shown = await one("select value, live_value, min_value, max_value, label from fn_policy_settings($1) where param_key = 'pricing.base_rate.approve'", [draftId]);
  t.equal("settings view shows the draft value beside the live one", [shown.value, shown.live_value, shown.label !== null], [9.25, liveRate, true]);
  t.equal("every setting is listed", (await one("select count(*)::int as n from fn_policy_settings($1)", [draftId])).n, 22);

  // Once sent, the draft is frozen
  await t.ok("author sends it for approval", () => db.query("select fn_policy_submit($1, 'Rate review for Q1')", [draftId]));
  await t.rejects("editing after sending", () => db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '9.1'::jsonb)", [draftId]), /only a draft can be changed/);
  await t.rejects("discarding after sending", () => db.query("select fn_policy_draft_discard($1)", [draftId]), /only a draft can be discarded/);
  t.equal("nothing changed for applications yet", (await one("select version_code from fn_policy_document_at()")).version_code, liveCode);

  // Discarding a draft keeps the trail
  const second = (await one("select fn_policy_draft_create('2027.02', 'Abandoned idea') as v")).v;
  await t.ok("author discards an unsent draft", () => db.query("select fn_policy_draft_discard($1)", [second.versionId]));
  t.equal("discarded draft is cancelled, not deleted", (await one("select status from policy_versions where id = $1", [second.versionId])).status, "CANCELLED");

  await db.query("set role anon");
  await t.rejects("anon cannot start a draft", () => db.query("select fn_policy_draft_create('X.9', 'x')"), /permission denied for function/);
  await db.query("reset role");
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 9. Impact check before approval (025)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("policy impact check");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001";
  const HEAD = "bbbbbbbb-0000-0000-0000-000000000002";
  const CLERK = "cccccccc-0000-0000-0000-000000000003";

  await asApi("authenticated", CLERK);
  await t.rejects("officer reads application facts", () => db.query("select * from fn_policy_facts(5)"), /permission denied/);
  await asApi("authenticated", AUTHOR);
  const facts = await one("select application_id, facts from fn_policy_facts(5) limit 1");
  t.equal("facts come back for a real application", typeof facts?.application_id === "string" && facts.facts !== null, true);
  const keys = Object.keys(facts?.facts ?? {});
  t.equal("facts use the names both rule sets read",
    ["age", "foir", "tenureMonths", "hasBureau", "hasSevereDPD"].every((k) => keys.includes(k)),
    true, keys.join(","));
  // Only numbers and yes/no answers leave the database; nothing that identifies a person.
  t.equal("facts carry nothing personal",
    Object.values(facts?.facts ?? {}).every((v) => v === null || typeof v === "number" || typeof v === "boolean"), true,
    JSON.stringify(facts?.facts));
  // 026: a fact that cannot be worked out stays present as null. Stripping it made the
  // engine skip the whole application, and the first live run reported "nothing would
  // change" after evaluating nothing.
  t.equal("unknown facts stay present as null",
    ["ambVsEmiPct", "bureauScore", "ltvOnRoad", "foir"].every((k) => k in (facts?.facts ?? {})), true,
    Object.keys(facts?.facts ?? {}).join(","));
  t.equal("every application carries the same fact keys",
    (await one("select count(distinct k)::int as n from (select string_agg(key, ',' order by key) as k from fn_policy_facts(20), jsonb_object_keys(facts) as key group by application_id) x")).n <= 1, true);
  t.equal("the sample is limited to what was asked for",
    (await one("select count(*)::int as n from fn_policy_facts(2)")).n <= 2, true);

  // Recording a comparison, then reading it back for the approval screen
  const target = await one("select id from policy_versions where status = 'PENDING_APPROVAL' order by submitted_at desc limit 1");
  const liveId = (await one("select fn_policy_version_at() as v")).v;
  if (target) {
    // 027: only the rules engine may write the figures an approver reads
    await t.ok("the engine records a comparison", async () => {
      await asApi("service_role");          // how the Lambda's key arrives
      try {
        await db.query("select fn_policy_simulation_record($1, $2, 120, '{\"review->decline\": 4}'::jsonb, '{\"changed\": 4}'::jsonb)", [target.id, liveId]);
      } finally {
        await asApi("authenticated", AUTHOR);
      }
    });
    const impact = await one("select sample_size, flips, summary, run_by from fn_policy_impact($1)", [target.id]);
    t.equal("approval screen sees the comparison",
      [impact.sample_size, impact.flips["review->decline"], impact.run_by], [120, 4, null]);
    await asApi("authenticated", HEAD);
    await t.ok("the approver can read it too", () => db.query("select * from fn_policy_impact($1)", [target.id]));
  }

  // The engine reaches the facts as the service role, and writes only through the function
  await db.query("begin");
  await db.query("set local role service_role");
  await t.ok("engine reads the facts", () => db.query("select * from fn_policy_facts(3)"));
  await db.query("rollback");
  await db.query("begin");
  await db.query("set local role service_role");
  await t.rejects("engine writes a simulation row directly", () =>
    db.query("insert into policy_simulations (policy_version_id, sample_size) values ($1, 1)", [liveId]), /permission denied/);
  await db.query("rollback");

  await db.query("set role anon");
  await t.rejects("anon reads the facts", () => db.query("select * from fn_policy_facts(1)"), /permission denied for function/);
  await db.query("reset role");
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 10. Fixes from the credit-control review (027)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("review fixes");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001";
  const HEAD = "bbbbbbbb-0000-0000-0000-000000000002";
  const CLERK = "cccccccc-0000-0000-0000-000000000003";
  const P = "CAR_FIX";

  // A live baseline on its own product line
  await asOperator();
  const src = await one("select policy_version_id as id from fn_policy_document_at() limit 1");
  const base = await one("insert into policy_versions (product, version_code, rationale, is_baseline) values ($1, 'F.0', 'baseline', true) returning id", [P]);
  await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents where policy_version_id = $2", [base.id, src.id]);
  await db.query("update policy_versions set status = 'ACTIVE', effective_from = now() - interval '2 days' where id = $1", [base.id]);

  const mk = async (code) => {
    const v = await one("insert into policy_versions (product, version_code, rationale, tier) values ($1, $2, 'test', 'STANDARD') returning id", [P, code]);
    await db.query("insert into policy_documents (policy_version_id, document) select $1, document from policy_documents where policy_version_id = $2", [v.id, base.id]);
    return v.id;
  };
  const a = await mk("F.1");
  const b = await mk("F.2");
  const when = new Date(Date.now() + 3 * 864e5).toISOString();

  await asApi("authenticated", AUTHOR);
  await db.query("select fn_policy_submit($1, 'first')", [a]);
  await db.query("select fn_policy_submit($1, 'second')", [b]);
  await asApi("authenticated", HEAD);
  await t.ok("first change approved", () => db.query("select fn_policy_approve($1, $2)", [a, when]));
  await t.rejects("second change cannot start at the same moment",
    () => db.query("select fn_policy_approve($1, $2)", [b, when]), /already approved to start at the same moment/);

  // Even if two do end up due together, the job must not stop dead
  await t.ok("approved for a later moment", () => db.query("select fn_policy_approve($1, $2)", [b, new Date(Date.now() + 4 * 864e5).toISOString()]));
  await asOperator();
  await db.query("update policy_versions set effective_from = now() - interval '1 minute' where id in ($1, $2)", [a, b]);
  const run = (await one("select fn_policy_activate_due() as v")).v;
  t.equal("one goes live, the clash is cancelled rather than jamming the job",
    [run.activated, run.cancelled], [1, 1]);
  t.equal("a version is in force afterwards",
    (await one("select version_code from fn_policy_document_at($1)", [P])).version_code !== null, true);
  t.equal("running again is quiet", (await one("select fn_policy_activate_due() as v")).v.activated, 0);

  // Facts say "not known" instead of guessing
  await asApi("authenticated", AUTHOR);
  const f = (await one("select facts from fn_policy_facts(1)")).facts;
  t.equal("a delay's timing is not invented from a 12-month figure",
    f.anyDpd6m === false || f.anyDpd6m === null, true, JSON.stringify(f.anyDpd6m));
  t.equal("months 7-12 are not invented from a 24-month count", f.minorDpdMonths7to12, null);
  // 028: the EMI comes from what the assessment settled on, not just the indicative figure
  await asOperator();
  const assessed = await one("select a.application_id from applications a join recommendations r on r.application_id = a.id where r.recommended_emi is not null and a.status <> 'DRAFT' limit 1");
  if (assessed) {
    await asApi("authenticated", AUTHOR);
    const row = await one("select facts from fn_policy_facts(200) where application_id = $1", [assessed.application_id]);
    t.equal("an assessed file can be judged on affordability",
      [row.facts.foir !== null, row.facts.freeIncomeRatio !== null], [true, true], JSON.stringify(row.facts.foir));
  }

  // A file with no EMI anywhere is unknown, not perfect
  await asOperator();
  const cust = await one("insert into customers (full_name, email, mobile, age_at_application, employment_type) values ('No Emi', 'noemi@t.in', '9876512345', 30, 'PRIVATE') returning id");
  await db.query("insert into applications (application_id, customer_id, status, declared_net_salary, tenure_months) values ('999999000001', $1, 'SUBMITTED', 80000, 60)", [cust.id]);
  await asApi("authenticated", AUTHOR);
  const bare = await one("select facts from fn_policy_facts(500) where application_id = '999999000001'");
  t.equal("no EMI anywhere means affordability is unknown, not perfect",
    [bare.facts.foir, bare.facts.freeIncomeRatio, bare.facts.ambVsEmiPct], [null, null, null]);

  // Impact figures come from the engine only
  await asApi("authenticated", AUTHOR);
  await t.rejects("author writes impact figures by hand",
    () => db.query("select fn_policy_simulation_record($1, $2, 999, '{}'::jsonb, '{}'::jsonb)", [a, base.id]),
    /permission denied for function|only be recorded by the rules engine/);
  await asApi("service_role");
  await t.ok("the engine records them", () => db.query(
    "select fn_policy_simulation_record($1, $2, 10, '{}'::jsonb, '{}'::jsonb)", [a, base.id]));
  await asApi("authenticated", AUTHOR);

  // Who may ask for an impact check, in their own name
  await asApi("authenticated", AUTHOR);
  t.equal("policy manager may run an impact check", (await one("select fn_policy_may_simulate() as v")).v, true);
  await asApi("authenticated", CLERK);
  t.equal("officer may not", (await one("select fn_policy_may_simulate() as v")).v, false);
  await asApi("anon");
  t.equal("nobody signed in may not", (await one("select fn_policy_may_simulate() as v")).v, false);

  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 11. Repayment history: how late was a payment, really (029)
// ---------------------------------------------------------------------------
// Sameer's example, 18 Sep 2026: EMI 15,000 due on the 5th.
//   Jan-Mar paid on time; Apr paid 14,999 on time (1 rupee short);
//   May 30 days late; Jun 60; Jul 90 (in three attempts after a failed mandate);
//   Aug on time.
{
  const t = makeChecker("repayment history");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001";
  await asOperator();

  const cust = await one("insert into customers (full_name, email, mobile, age_at_application, employment_type) values ('Repay Example', 'repay@t.in', '9876500099', 35, 'PRIVATE') returning id");
  const loan = await one(`insert into loan_accounts (loan_account_no, customer_id, disbursed_on, disbursed_amount, installment_day, emi_amount, tenure_months, contract_rate_pct)
    values ('LN-EXAMPLE-1', $1, '2025-12-20', 700000, 5, 15000, 60, 8.99) returning id`, [cust.id]);

  const months = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05"];
  for (const [n, due] of months.entries()) {
    await db.query("insert into loan_installments (loan_id, installment_no, due_date, amount_due) values ($1, $2, $3, 15000)", [loan.id, n + 1, due]);
  }
  // A receipt may name the installment it is for — a transaction tagged to that
  // month — or name nothing, in which case it pays the oldest arrears first.
  const pay = (on, amount, outcome = "SUCCESS", forNo = null, ref = null) =>
    db.query(`insert into loan_repayments (loan_id, installment_id, paid_on, amount, outcome, reference_no)
      values ($1, (select id from loan_installments where loan_id = $1 and installment_no = $2), $3, $4, $5, $6)`,
      [loan.id, forNo, on, amount, outcome, ref ?? `${on}-${amount}-${outcome}-${forNo ?? "any"}`]);

  await pay("2026-01-05", 15000);
  await pay("2026-02-05", 15000);
  await pay("2026-03-05", 15000);
  await pay("2026-04-05", 14999);            // 1 rupee short, still on time
  await pay("2026-06-04", 15000);                 // May's, 30 days late
  await pay("2026-08-04", 15000);                 // June's, 60 days late
  await pay("2026-08-05", 0, "BOUNCED", 7);       // July's mandate failed
  await pay("2026-08-05", 15000, "SUCCESS", 8);   // August paid on time, tagged to August
  await pay("2026-10-01", 5000);                  // July's arrears, paid in three goes
  await pay("2026-10-02", 5000);
  await pay("2026-10-03", 5001);

  await asApi("authenticated", AUTHOR);
  const rows = (await db.query("select * from fn_loan_installment_status($1)", [loan.id])).rows;
  const late = Object.fromEntries(rows.map((r) => [r.installment_no, r.days_late]));
  t.equal("Jan to Mar are on time", [late[1], late[2], late[3]], [0, 0, 0]);
  t.equal("one rupee short on the due date is not a delay", late[4], 0);
  t.equal("the April shortfall is still recorded",
    Number(rows.find((r) => r.installment_no === 4).shortfall) > 0 || Number(rows.find((r) => r.installment_no === 4).amount_paid) < 15000, true,
    JSON.stringify(rows.find((r) => r.installment_no === 4)));
  t.equal("May is 30 days late", late[5], 30);
  t.equal("June is 60 days late", late[6], 60);
  t.equal("July is 90 days late, paid off in several attempts", late[7], 90);
  t.equal("August, paid on time and tagged to August, stays on time", late[8], 0);
  t.equal("the failed mandate is counted as an attempt",
    rows.find((r) => r.installment_no === 7).attempts >= 2, true, JSON.stringify(rows.find((r) => r.installment_no === 7)));

  // The facts the credit rules ask for, as of the day after the last payment
  const facts = (await one("select fn_loan_dpd_facts($1, '2026-10-04') as v", [cust.id])).v;
  t.equal("a delay inside the last 6 months is now answerable", facts.anyDpd6m, true);
  t.equal("worst delay in 12 months", facts.worstDpd12m, 90);
  t.equal("60 days late ever", facts.dpd60Ever, true);
  t.equal("90 days late within 12 months", facts.dpd90OrWriteoff12m, true);

  // Read as of a much later date, the same delays fall outside six months
  const later = (await one("select fn_loan_dpd_facts($1, '2027-06-30') as v", [cust.id])).v;
  t.equal("the same file is clean in the last 6 months a year later", later.anyDpd6m, false);
  t.equal("but the 60-day delay is still on the record", later.dpd60Ever, true);

  // A customer with no loan of ours is "not known", not "clean"
  const stranger = await one("insert into customers (full_name, email, mobile) values ('No Loan', 'noloan@t.in', '9876500098') returning id");
  const none = (await one("select fn_loan_dpd_facts($1) as v", [stranger.id])).v;
  t.equal("no loan with us means nothing is claimed", [none.installmentsSeen, none.anyDpd6m === undefined], [0, true], JSON.stringify(none));

  // What the loan really earned, given when the money arrived
  const irr = (await one("select fn_loan_irr($1, '2026-10-04') as v", [loan.id])).v;
  t.equal("the realised return is a sensible number", irr !== null && Number(irr) < 0, true, String(irr));

  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 12. Every decision records the policy and model it was made under (030)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("decision version pinning");
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  await asOperator();

  // Rows that existed before 030: a fresh database stopped at 029, then 030 applied
  {
    const { readFileSync } = await import("node:fs");
    const { db: old } = await migratedDb({ upTo: 29 });
    const before = (await old.query("select count(*)::int as n from credit_decisions")).rows[0].n;
    await old.exec(readFileSync(new URL("../../sql/030_decision_version_pinning.sql", import.meta.url), "utf8"));
    const r = (await old.query(`select count(*)::int as n,
        count(*) filter (where d.version_basis = 'ASSUMED' and pv.version_code = '2026.08' and d.rules_snapshot is null)::int as assumed
      from credit_decisions d left join policy_versions pv on pv.id = d.policy_version_id`)).rows[0];
    t.equal("old decisions are marked 2026.08 (assumed), not passed off as recorded", [before > 0, r.n, r.assumed], [true, before, before]);
    await old.exec(readFileSync(new URL("../../sql/030_decision_version_pinning.sql", import.meta.url), "utf8"));
    const again = (await old.query("select count(*) filter (where version_basis = 'ASSUMED')::int as n from credit_decisions")).rows[0].n;
    t.equal("running 030 twice changes nothing", again, before);
    await old.close();
  }

  // A new application, assessed and decided now
  await asApi("authenticated", OFFICER);
  const submitted = (await one("select fn_submit_full_application(p_full_name => 'Pin Test', p_email => 'pin1@t.in', p_mobile => '9000000031', p_pan => 'PINTS1234P', p_dob => '1990-01-01', p_employer => 'Infosys', p_city => 'Chennai', p_state_code => 'TN', p_pincode => '600001', p_tenure => 60, p_make => 'Maruti Suzuki', p_model => 'Dzire', p_variant => 'VXI', p_fuel_type => 'PETROL', p_net_salary => 95000, p_loan_amount => 600000, p_ex_showroom => 700000, p_on_road => 780000, p_cibil_score => 780) as v")).v;
  await asOperator();
  t.equal("the test application went through", submitted.decision !== "ERROR", true, JSON.stringify(submitted));
  const app = { id: submitted.application_uuid, application_id: submitted.application_id };
  const rec = await one(`select pv.version_code, r.version_basis, r.model_version, r.rules_snapshot
    from recommendations r left join policy_versions pv on pv.id = r.policy_version_id where r.application_id = $1`, [app.id]);
  t.equal("the recommendation records the version in force", [rec.version_code, rec.version_basis, rec.model_version], ["2026.08", "RECORDED", "cercit-risk-v1"]);
  const dec = await one(`select d.id, pv.version_code, d.version_basis, d.model_version, d.rules_snapshot
    from credit_decisions d left join policy_versions pv on pv.id = d.policy_version_id where d.application_id = $1`, [app.id]);
  t.equal("the system decision records it too", [dec.version_code, dec.version_basis, dec.model_version], ["2026.08", "RECORDED", "cercit-risk-v1"]);
  const snap = await one("select jsonb_array_length(rules) as n from rule_set_snapshots where rules_sha256 = $1", [dec.rules_snapshot]);
  t.equal("the exact rule set used is kept", snap?.n > 0, true);

  // The caller cannot choose the stamps
  const forged = await one(`insert into credit_decisions (application_id, recommendation_id, decision, decided_by, policy_version_id, model_version, version_basis)
    select $1, r.id, 'APPROVE', 'SYSTEM', null, null, 'ASSUMED' from recommendations r where r.application_id = $1
    returning version_basis, model_version, policy_version_id is not null as has_version`, [app.id]);
  t.equal("values supplied on insert are replaced", forged, { version_basis: "RECORDED", model_version: "cercit-risk-v1", has_version: true });
  await db.query("update credit_decisions set version_basis = 'ASSUMED', model_version = null, officer_remarks = 'note' where id = $1", [dec.id]);
  const kept = await one("select version_basis, model_version, officer_remarks from credit_decisions where id = $1", [dec.id]);
  t.equal("an edit cannot rewrite them", kept, { version_basis: "RECORDED", model_version: "cercit-risk-v1", officer_remarks: "note" });

  // A decision dated before any approved version records none, rather than guessing
  const early = await one(`insert into credit_decisions (application_id, recommendation_id, decision, decided_by, decided_at)
    select $1, r.id, 'REJECT', 'SYSTEM', '2026-07-01' from recommendations r where r.application_id = $1
    returning policy_version_id, model_version`, [app.id]);
  t.equal("the stamp follows the decision date", early, { policy_version_id: null, model_version: null });

  // A rule changes later: the old decision still shows the old threshold
  const oldRule = await one("select rule_id, threshold_value from policy_rules where is_active order by rule_id limit 1");
  await db.query("update policy_rules set threshold_value = '999' where rule_id = $1", [oldRule.rule_id]);
  await asApi("authenticated", OFFICER);
  await db.query("select fn_officer_decision($1, 'REJECT', 'after the rule change')", [app.application_id]);
  await asOperator();
  const redecided = await one("select rules_snapshot from credit_decisions where application_id = $1 and decided_by = 'OFFICER' order by decided_at desc limit 1", [app.id]);
  t.equal("a re-made decision gets a new fingerprint", redecided.rules_snapshot !== dec.rules_snapshot, true);
  const replay = await one(`select r->>'threshold_value' as v from rule_set_snapshots s, jsonb_array_elements(s.rules) r
    where s.rules_sha256 = $1 and r->>'rule_id' = $2`, [dec.rules_snapshot, oldRule.rule_id]);
  t.equal("the old fingerprint still gives the old threshold", replay?.v, oldRule.threshold_value);
  await db.query("update policy_rules set threshold_value = $2 where rule_id = $1", [oldRule.rule_id, oldRule.threshold_value]);

  // Reading it back
  await asApi("authenticated", OFFICER);
  const rows = (await db.query("select source, version_code, version_basis, model_version from fn_decision_versions($1)", [app.id])).rows;
  t.equal("an officer can see what a case was decided under", rows.some((r) => r.source === "DECISION" && r.version_code === "2026.08"), true, JSON.stringify(rows));
  await asApi("anon");
  await db.query("set role anon");
  await t.rejects("anon cannot", () => db.query("select * from fn_decision_versions($1)", [app.id]), /permission denied/);
  await db.query("reset role");
  await asApi("authenticated", OFFICER);
  await db.query("set role authenticated");
  await t.rejects("nobody writes snapshots through the API", () => db.query("insert into rule_set_snapshots (rules_sha256, rules) values ('x', '[]')"), /permission denied/);
  await t.rejects("nobody registers a model through the API", () => db.query("insert into model_versions (model_version, status, effective_from) values ('evil', 'RETIRED', now())"), /permission denied/);
  await t.ok("nobody stamps a decision by hand through the API", async () => {
    try {
      const r = await db.query("update credit_decisions set version_basis = 'ASSUMED' where version_basis = 'RECORDED'");
      if (r.affectedRows > 0) throw new Error(`${r.affectedRows} rows changed`);
    } catch (e) {
      if (!/permission denied/.test(e.message)) throw e;
    }
  });
  await db.query("reset role");

  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 13. FOIR base, LTV base and tenure precedence (031)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("FOIR, LTV and tenure basis");
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  let n = 40;
  const submit = async (overrides) => {
    n += 1;
    const args = {
      p_full_name: "Basis Test", p_email: `basis${n}@t.in`, p_mobile: `90000000${n}`, p_pan: `BASIS${1000 + n}B`,
      p_dob: "1990-01-01", p_employer: "Infosys", p_city: "Chennai", p_state_code: "TN", p_pincode: "600001",
      p_make: "Maruti Suzuki", p_model: "Dzire", p_variant: "VXI", p_fuel_type: "PETROL",
      p_net_salary: 95000, p_loan_amount: 600000, p_ex_showroom: 700000, p_on_road: 780000, p_cibil_score: 780, p_tenure: 60,
      ...overrides,
    };
    const names = Object.keys(args);
    await asApi("authenticated", OFFICER);
    const v = (await one(`select fn_submit_full_application(${names.map((k, j) => `${k} => $${j + 1}`).join(", ")}) as v`, names.map((k) => args[k]))).v;
    await asOperator();
    if (v.decision === "ERROR") throw new Error(JSON.stringify(v));
    return one(`select r.*, a.tenure_months as asked from recommendations r join applications a on a.id = r.application_id
      where r.application_id = $1 order by r.created_at desc limit 1`, [v.application_uuid]);
  };

  // Tenure: the tightest limit that applies
  t.equal("product limit beats a looser band", await one("select * from fn_tenure_cap(false, 780000, 96, 'APPROVE')"), { cap: 84, source: "product limit" });
  t.equal("a tighter band beats the product limit", await one("select * from fn_tenure_cap(false, 780000, 60, 'MAYBE')"), { cap: 60, source: "Maybe band limit" });
  t.equal("government employee on a small car gets 120", (await one("select * from fn_tenure_cap(true, 1000000, null, null)")).cap, 120);
  t.equal("but still no more than the band allows", (await one("select * from fn_tenure_cap(true, 1000000, 96, 'APPROVE')")).cap, 96);
  t.equal("not on a car over 12 lakh", (await one("select * from fn_tenure_cap(true, 1500000, null, null)")).cap, 84);

  const long = await submit({ p_tenure: 96 });
  t.equal("96 months asked, 84 recommended", [long.asked, long.recommended_tenure], [96, 84]);
  t.equal("the summary says the tenure was cut, and why", /Tenure reduced from 96 to 84 months \(product limit\)/.test(long.summary_text), true, long.summary_text);
  t.equal("the EMI is worked out on the shorter tenure",
    Number(long.recommended_emi), Number((await one("select fn_calculate_emi(600000, $1, 84) as v", [long.recommended_rate])).v));
  const normal = await submit({ p_tenure: 60 });
  t.equal("a tenure inside every limit is left alone", normal.recommended_tenure, 60);

  // FOIR: the same base the rules use (net salary plus eligible other income)
  const rule = await one(`select actual_value from policy_results where application_id = $1 and rule_id = 'INC-FOIR' order by created_at desc limit 1`, [normal.application_id]);
  t.equal("stored FOIR matches the FOIR the rules checked", Number(normal.foir_calculated), Number(rule?.actual_value), JSON.stringify({ stored: normal.foir_calculated, rule }));
  // With other income on file, FOIR uses net salary plus that income, as the rules do
  await db.query("update income_assessments set total_eligible_income = coalesce(eligible_net_salary, 95000) + 20000 where application_id = $1", [normal.application_id]);
  await db.query("select fn_generate_recommendation($1)", [normal.application_id]);
  const withOther = await one("select * from recommendations where application_id = $1 order by created_at desc limit 1", [normal.application_id]);
  const ruleNow = await one("select actual_value from policy_results where application_id = $1 and rule_id = 'INC-FOIR' order by created_at desc limit 1", [normal.application_id]);
  t.equal("with other income, stored FOIR still matches the rules", Number(withOther.foir_calculated), Number(ruleNow?.actual_value),
    JSON.stringify({ stored: withOther.foir_calculated, rule: ruleNow }));
  t.equal("and it is lower than on salary alone", Number(withOther.foir_calculated) < Number(normal.foir_calculated), true);

  // LTV: both figures named
  t.equal("summary names ex-showroom and on-road LTV", /LTV [\d.]+% of ex-showroom \([\d.]+% of on-road\)/.test(normal.summary_text), true, normal.summary_text);
  t.equal("ltv_calculated stays on-road", Number(normal.ltv_calculated), Math.round((600000 / 780000) * 10000) / 100);

  // A cut tenure that pushes FOIR over the cap goes to a person
  const tight = await submit({ p_tenure: 96, p_net_salary: 18500 });
  const flagged = (tight.risk_factors ?? []).some((f) => f.rule_id === "FOIR_AT_CAPPED_TENURE");
  t.equal("FOIR over the cap at the shorter tenure is not auto-approved",
    flagged ? tight.recommendation : "not triggered", flagged ? "MAYBE" : "not triggered", JSON.stringify({ rec: tight.recommendation, foir: tight.foir_calculated, rf: tight.risk_factors }));
  t.equal("and this case does trigger it", flagged || tight.recommendation !== "APPROVE", true, JSON.stringify({ rec: tight.recommendation, foir: tight.foir_calculated }));

  failures += t.report();
}

// ---------------------------------------------------------------------------
// 14. Before/after and change history (032)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("change history");
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001"; // Policy Author (section 7)
  const HEAD = "bbbbbbbb-0000-0000-0000-000000000002"; // Credit Head
  const CLERK = "cccccccc-0000-0000-0000-000000000003"; // Officer

  await asOperator();
  // Its own product line, so it cannot clash with versions other sections scheduled
  const liveRate = (await one("select fn_policy_param('pricing.base_rate.approve', 'CAR_TEST') as v")).v;
  const liveCode = (await one("select version_code from fn_policy_document_at('CAR_TEST')")).version_code;

  // A change goes the long way round: sent, taken back, fixed, sent again, approved, live
  await asApi("authenticated", AUTHOR);
  const id = (await one("select fn_policy_draft_create('H.1', 'History test', 'STANDARD', 'CAR_TEST') as v")).v.versionId;
  await db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '9.5'::jsonb)", [id]);
  await db.query("select fn_policy_submit($1, 'Raise the Approve rate', 'First go')", [id]);
  await db.query("select fn_policy_withdraw($1, 'wrong figure')", [id]);
  await db.query("select fn_policy_draft_set_param($1, 'pricing.base_rate.approve', '9.4'::jsonb)", [id]);
  await db.query("select fn_policy_submit($1, 'Raise the Approve rate', 'Second go')", [id]);

  // Before/after, while it waits
  const diff = (await db.query("select * from fn_policy_change_diff($1)", [id])).rows;
  const rate = diff.find((d) => d.item === "pricing.base_rate.approve");
  t.equal("the changed setting shows before and after", rate && [rate.change, Number(rate.before_value), Number(rate.after_value), rate.compared_to],
    [liveRate === null ? "ADDED" : "CHANGED", liveRate === null ? 0 : Number(liveRate), 9.4, liveCode], JSON.stringify(diff));
  t.equal("nothing else is listed as changed", diff.length, 1, JSON.stringify(diff.map((d) => d.item)));
  // A setting whose value really changes: draft 2027.01 (section 8) against the version it came from
  await asApi("authenticated", HEAD);
  const main = (await db.query("select * from fn_policy_change_diff((select id from policy_versions where version_code = '2027.01' and product = 'CAR_NEW')) where kind = 'SETTING'")).rows;
  t.equal("an edited value reads as changed, old and new", main.some((d) => d.change === "CHANGED" && d.before_value !== null && d.after_value !== null && d.before_value !== d.after_value), true, JSON.stringify(main));
  await asApi("authenticated", AUTHOR);

  await asApi("authenticated", HEAD);
  await db.query("select fn_policy_approve($1, now() + interval '1 day', 'Fine')", [id]);
  await asOperator();
  await db.query("update policy_versions set effective_from = now() - interval '1 minute' where id = $1", [id]);
  await db.query("select fn_policy_activate_due()");

  await asApi("authenticated", HEAD);
  const hist = (await db.query("select event, actor, reconstructed from fn_policy_history($1) order by at", [id])).rows;
  const steps = hist.filter((h) => !h.event.startsWith("Change request") && !h.event.startsWith("Review"));
  t.equal("every step is on the record, in order", steps.map((h) => h.event), [
    "Drafted", "Sent for approval", "Taken back by its author", "Sent for approval", "Approved", "Came into force",
  ], JSON.stringify(steps));
  t.equal("each step names who did it", steps.map((h) => h.actor), [
    "Policy Author", "Policy Author", "Policy Author", "Policy Author", "Credit Head", "System",
  ]);
  t.equal("recorded as it happened, not rebuilt", steps.every((h) => h.reconstructed === false), true);
  t.equal("the reviewer's comment is there", hist.some((h) => h.event === "Review: approve" && h.actor === "Credit Head"), true);
  const note = (await db.query("select note from fn_policy_history($1) where event = 'Change request'", [id])).rows.map((r) => r.note).join(" ");
  t.equal("the withdrawal reason is kept", /wrong figure/.test(note), true, note);
  const replaced = (await one("select h.event, h.actor from fn_policy_history() h join policy_versions v on v.id = h.version_id where v.version_code = $1 and v.product = 'CAR_TEST' order by h.at desc limit 1", [liveCode]));
  t.equal("the version it replaced shows that", replaced, { event: "Replaced by a newer version", actor: "System" });

  // Older versions: history rebuilt from their dates, and marked as such
  const seed = (await db.query("select event, reconstructed from fn_policy_history((select id from policy_versions where version_code = '2026.08' and product = 'CAR_NEW')) order by at")).rows;
  t.equal("2026.08's history is rebuilt and says so", seed.length > 0 && seed.filter((h) => !h.event.startsWith("Replaced")).every((h) => h.reconstructed), true, JSON.stringify(seed));

  // Rules: 2026.09 changes the rules document, and each difference is one line
  const rules = (await db.query("select * from fn_policy_change_diff((select id from policy_versions where version_code = '2026.09' and product = 'CAR_NEW')) where kind = 'RULE'")).rows;
  t.equal("rule differences are listed", rules.length > 0, true);
  t.equal("each reads as the rule and its conditions",
    rules.every((r) => /^[A-Z0-9_]+ \((hard|soft)\): /.test(r.after_value ?? r.before_value)), true, JSON.stringify(rules.slice(0, 3)));

  // Who may see it, and nobody writes it by hand
  await asApi("authenticated", CLERK);
  await t.rejects("an officer cannot read policy history", () => db.query("select * from fn_policy_history()"), /permission denied/);
  await db.query("set role authenticated");
  await t.rejects("nobody adds history through the API", () => db.query("insert into policy_version_events (policy_version_id, to_status) values ($1, 'ACTIVE')", [id]), /permission denied/);
  await db.query("reset role");

  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 15. The rules engine decides an application (033)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("server engine decisions");
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const AUTHOR = "aaaaaaaa-0000-0000-0000-000000000001"; // policy manager
  await asOperator();

  await asApi("authenticated", OFFICER);
  const sub = (await one(`select fn_submit_full_application(p_full_name => 'Engine Test', p_email => 'engine1@t.in',
    p_mobile => '9000000051', p_pan => 'ENGIN1234E', p_dob => '1990-01-01', p_employer => 'Infosys', p_city => 'Chennai',
    p_state_code => 'TN', p_pincode => '600001', p_tenure => 60, p_make => 'Maruti Suzuki', p_model => 'Dzire',
    p_variant => 'VXI', p_fuel_type => 'PETROL', p_net_salary => 95000, p_loan_amount => 600000,
    p_ex_showroom => 700000, p_on_road => 780000, p_cibil_score => 780) as v`)).v;
  const appId = sub.application_uuid;
  await asOperator();
  const before = await one("select recommendation from recommendations where application_id = $1 order by created_at desc limit 1", [appId]);

  // Facts for one application, for the engine to read
  await asApi("authenticated", AUTHOR);
  const facts = await one("select * from fn_policy_facts_for($1)", [appId]);
  t.equal("the engine can ask for one application", [facts?.application_id === sub.application_id, typeof facts?.facts === "object"], [true, true], JSON.stringify(facts)?.slice(0, 200));
  await t.rejects("an unknown application is refused", () => db.query("select * from fn_policy_facts_for($1)", ["99999999-9999-9999-9999-999999999999"]), /application not found/);

  // Only the engine may record an answer
  await t.rejects("a policy manager cannot record an engine decision",
    () => db.query("select fn_engine_decision_record($1, 'approve', null, '2026.08')", [appId]), /only the rules engine/);
  await asApi("authenticated", OFFICER);
  await db.query("set role authenticated");
  await t.rejects("nor can an officer through the API",
    () => db.query("select fn_engine_decision_record($1, 'decline', null, '2026.08')", [appId]), /permission denied/);
  await db.query("reset role");

  // The engine records its answer. The switch is off, so nothing else changes.
  await asApi("service_role");
  const versionId = (await one("select fn_policy_version_at() as v")).v;
  const off = (await one("select fn_engine_decision_record($1, 'decline', $2, '2026.08', 40, array['FOIR_LIMIT'], array['BOUNCES'], array['ambVsEmiPct']) as v", [appId, versionId])).v;
  t.equal("recorded but not applied while the switch is off", off.applied, false, JSON.stringify(off));
  await asOperator();
  const still = await one("select recommendation from recommendations where application_id = $1 order by created_at desc limit 1", [appId]);
  t.equal("the decision on file is untouched", still.recommendation, before.recommendation);

  await asApi("authenticated", OFFICER);
  const seen = await one("select * from fn_engine_decision($1)", [appId]);
  t.equal("an officer can see what the engine said",
    [seen.decision, seen.version_code, seen.applied, seen.hard_failed, seen.facts_not_known],
    ["decline", "2026.08", false, ["FOIR_LIMIT"], ["ambVsEmiPct"]], JSON.stringify(seen));

  // Switch on: the engine's answer becomes the decision
  await asOperator();
  await db.query("update feature_flags set enabled = true where flag_key = 'server_engine'");
  await asApi("service_role");
  const on = (await one("select fn_engine_decision_record($1, 'decline', $2, '2026.08', 40, array['FOIR_LIMIT'], '{}'::text[], '{}'::text[]) as v", [appId, versionId])).v;
  t.equal("with the switch on, it is applied", on.applied, true, JSON.stringify(on));
  await asOperator();
  const after = await one(`select r.recommendation, r.summary_text, a.status,
      (select d.decision from credit_decisions d where d.application_id = $1 and d.decided_by = 'SYSTEM' order by d.decided_at desc limit 1) as decided
    from recommendations r join applications a on a.id = r.application_id
    where r.application_id = $1 order by r.created_at desc limit 1`, [appId]);
  t.equal("the case now reads as rejected", [after.recommendation, after.decided, after.status], ["REJECT", "REJECT", "REJECTED"], JSON.stringify(after));
  t.equal("and says which policy decided it", /rules engine on policy 2026\.08/.test(after.summary_text), true, after.summary_text);
  const stamp = await one("select version_basis, model_version from credit_decisions where application_id = $1 and decided_by = 'SYSTEM' order by decided_at desc limit 1", [appId]);
  t.equal("the new decision is stamped with the policy it was made under", stamp.version_basis, "RECORDED", JSON.stringify(stamp));
  const audit = await one("select event_detail from audit_events where application_id = $1 and event_type = 'ENGINE_DECISION' order by created_at desc limit 1", [appId]);
  t.equal("it is on the audit trail", [audit?.event_detail?.decision, audit?.event_detail?.applied], ["decline", true], JSON.stringify(audit));

  // A decision the rules cannot produce is refused
  await asApi("service_role");
  await t.rejects("an invented decision is refused", () => db.query("select fn_engine_decision_record($1, 'maybe-ish', $2, '2026.08')", [appId, versionId]), /approve, review or decline/);

  await asOperator();
  await db.query("update feature_flags set enabled = false where flag_key = 'server_engine'");
  await db.query("set role authenticated");
  await t.rejects("nobody writes engine decisions by hand", () => db.query("insert into engine_decisions (application_id, decision) values ($1, 'approve')", [appId]), /permission denied/);
  await db.query("reset role");
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 16. The three demo accounts, and how a login finds its role (034)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("demo accounts");
  await asOperator();

  const rows = (await db.query(`select email, role, is_active, max_sanction_amount, auth_user_id
    from users where email in ('demo1@cercit.in', 'demo2@cercit.in', 'cercit+admin@gmail.com') order by email`)).rows;
  t.equal("all three accounts are seeded", rows.length, 3, JSON.stringify(rows));
  t.equal("each has the role it was asked for",
    Object.fromEntries(rows.map((r) => [r.email, r.role])),
    { "cercit+admin@gmail.com": "admin", "demo1@cercit.in": "credit_officer", "demo2@cercit.in": "credit_manager" });
  t.equal("the admin has no lending limit", rows.find((r) => r.role === "admin").max_sanction_amount, null);
  t.equal("the officer has one", Number(rows.find((r) => r.role === "credit_officer").max_sanction_amount) > 0, true);

  // A login created in Supabase links itself to the waiting role row
  const AUTHID = "dddddddd-0000-0000-0000-00000000000d";
  await db.query("insert into auth.users (id, email) values ($1, 'DEMO1@cercit.in')", [AUTHID]);
  const linked = await one("select auth_user_id from users where email = 'demo1@cercit.in'");
  t.equal("a new login is linked to its role row, whatever the letter case", linked.auth_user_id, AUTHID);

  // It cannot take over a row that already belongs to someone
  const OTHER = "eeeeeeee-0000-0000-0000-00000000000e";
  await db.query("insert into auth.users (id, email) values ($1, 'demo1@cercit.in')", [OTHER]);
  const unchanged = await one("select auth_user_id from users where email = 'demo1@cercit.in'");
  t.equal("a second login cannot take over the same role row", unchanged.auth_user_id, AUTHID);

  // Signing in is not the same as being allowed in
  const STRANGER = "ffffffff-0000-0000-0000-00000000000f";
  await db.query("insert into auth.users (id, email) values ($1, 'stranger@example.com')", [STRANGER]);
  await asApi("authenticated", STRANGER);
  await t.rejects("a login with no role row can do nothing",
    () => db.query("select fn_require_permission('app.view.all')"), /no active cercit user/);

  // The seeded officer can work cases
  await asApi("authenticated", AUTHID);
  t.equal("demo1 may decide cases", (await one("select fn_has_permission('app.decide') as v")).v, true);
  t.equal("demo1 may not change policy", (await one("select fn_has_permission('policy.author') as v")).v, false);

  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 17. Roles as data, conflicting rights, lockout and MFA (036)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("roles and login rules");
  await asOperator();
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const ADMIN = "abababab-0000-0000-0000-0000000000ab";
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('adm@t.in', 'Admin', 'admin', $1)", [ADMIN]);

  // Same rights as the CASE list in 018, role by role
  const counts = Object.fromEntries((await db.query(
    "select role_code, count(*)::int as n from role_permissions group by role_code order by role_code")).rows.map((r) => [r.role_code, r.n]));
  // compliance: the 12 from 018, plus role.approve from 039; admin: 12, plus org.manage from 041
  t.equal("every role keeps its 018 rights", counts,
    { admin: 13, compliance: 13, credit_head: 20, credit_manager: 9, credit_officer: 7, demo_viewer: 5, policy_manager: 11, reviewer: 5, viewer: 3 });
  t.equal("officer rights read from the table", (await one("select fn_role_permissions('credit_officer') as v")).v,
    ["app.create", "app.decide", "app.evaluate", "app.view.own", "pii.reveal", "report.export", "report.view"]);
  const six = (await db.query("select code from roles where not is_legacy and is_active order by code")).rows.map((r) => r.code);
  t.equal("six current roles, plus the public demo role (042)", six, ["admin", "compliance", "credit_head", "credit_manager", "credit_officer", "demo_viewer", "policy_manager"]);
  const mfa = (await db.query("select code from roles where mfa_required order by code")).rows.map((r) => r.code);
  t.equal("MFA marked for the four privileged roles", mfa, ["admin", "compliance", "credit_head", "policy_manager"]);
  t.equal("admin idles out at 10 minutes", (await one("select idle_timeout_minutes as v from roles where code = 'admin'")).v, 10);

  // Conflicting pairs
  const conflicts = (await db.query("select role_code, waived from v_role_conflicts order by role_code")).rows;
  t.equal("only waived conflicts exist", conflicts, [{ role_code: "admin", waived: true }, { role_code: "credit_head", waived: true }]);
  await db.query("insert into roles (code, name, description) values ('test_role', 'Test', 'x')");
  await db.query("insert into role_permissions (role_code, permission_code) values ('test_role', 'app.decide')");
  await t.rejects("a role cannot get decide and author together",
    () => db.query("insert into role_permissions (role_code, permission_code) values ('test_role', 'policy.author')"), /cannot hold both/);
  await t.rejects("a user cannot hold a role that does not exist",
    () => db.query("insert into users (email, full_name, role) values ('x@t.in', 'X', 'superuser')"), /fk_users_role/);
  await db.query("update roles set is_active = false where code = 'test_role'");
  t.equal("an inactive role has no rights", (await one("select cardinality(fn_role_permissions('test_role')) as n")).n, 0);
  await db.query("delete from roles where code = 'test_role'");

  // Nobody changes roles through the API yet
  await db.query("set role authenticated");
  await asApi("authenticated", ADMIN);
  await t.ok("staff can read roles", () => db.query("select * from roles"));
  await t.rejects("even an admin cannot edit roles directly",
    () => db.query("insert into role_permissions (role_code, permission_code) values ('viewer', 'app.decide')"), /permission denied/);
  await db.query("reset role");
  await db.query("set role anon");
  await asApi("anon");
  await t.rejects("anon cannot read roles", () => db.query("select * from roles"), /permission denied/);
  const rules = (await one("select fn_login_rules() as v")).v;
  t.equal("anon can read the login rules", [rules.password_min_length, rules.lockout_threshold, rules.lockout_minutes], [12, 5, 30]);
  await t.ok("wrong password on an unknown address says nothing", () => db.query("select fn_record_failed_login('nobody@example.com')"));

  // Lockout after five wrong passwords
  for (let i = 0; i < 4; i++) await db.query("select fn_record_failed_login('O@t.in ')");
  await db.query("reset role");
  await asOperator();
  t.equal("four misses: not locked yet", (await one("select failed_login_count as n, locked_until from users where email = 'o@t.in'")),
    { n: 4, locked_until: null });
  await db.query("set role anon");
  await db.query("select fn_record_failed_login('o@t.in')");
  await db.query("reset role");
  await asOperator();
  const locked = await one("select locked_until > now() as locked, failed_login_count as n from users where email = 'o@t.in'");
  t.equal("fifth miss locks the account", locked, { locked: true, n: 0 });
  t.equal("the lock is audited", (await one("select count(*)::int as n from audit_events where event_type = 'ACCOUNT_LOCKED'")).n, 1);

  await asApi("authenticated", OFFICER);
  await t.rejects("a locked officer can do nothing", () => db.query("select fn_require_permission('app.view.own')"), /account locked/);
  t.equal("sign-in check says locked", (await one("select fn_record_login() as v")).v.reason, "locked");
  await db.query("set role authenticated");
  t.equal("a locked officer sees no applicants", (await one("select count(*)::int as n from customers")).n, 0);
  await db.query("reset role");

  await asApi("authenticated", "11111111-1111-1111-1111-111111111111");
  const oid = (await one("select id from users where email = 'o@t.in'")).id;
  await t.rejects("a viewer cannot unlock", () => db.query("select fn_unlock_user($1)", [oid]), /permission denied: user.manage/);
  await asApi("authenticated", ADMIN);
  await t.ok("an admin unlocks", () => db.query("select fn_unlock_user($1)", [oid]));
  await asApi("authenticated", OFFICER);
  const ok = (await one("select fn_record_login() as v")).v;
  t.equal("after unlock the officer signs in", [ok.allowed, ok.role, ok.idle_timeout_minutes], [true, "credit_officer", 15]);
  await asOperator();
  t.equal("unlock and sign-in are audited",
    (await one("select count(*) filter (where event_type = 'ACCOUNT_UNLOCKED')::int as u, count(*) filter (where event_type = 'LOGIN')::int as l from audit_events")),
    { u: 1, l: 1 });

  // MFA, once switched on
  await db.query("update security_settings set value = 1 where setting_key = 'mfa_enforced'");
  await asApi("authenticated", ADMIN);
  await t.rejects("admin without a second step is refused", () => db.query("select fn_require_permission('user.view')"), /second sign-in step/);
  await db.query("select set_config('request.jwt.claims', '{\"aal\":\"aal2\"}', false)");
  await t.ok("admin with a second step gets in", () => db.query("select fn_require_permission('user.view')"));
  await db.query("select set_config('request.jwt.claims', '', false)");
  await asApi("authenticated", OFFICER);
  await t.ok("an officer does not need one", () => db.query("select fn_require_permission('app.view.own')"));
  await asOperator();
  await db.query("update security_settings set value = 0 where setting_key = 'mfa_enforced'");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 18. Staff account management (037)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("user admin");
  await asOperator();
  const ADMIN = "abababab-0000-0000-0000-0000000000ab";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const adminId = (await one("select id from users where auth_user_id = $1", [ADMIN])).id;
  const save = (args) => db.query(
    "select fn_admin_save_user($1, $2, $3, $4, $5, $6, $7) as id",
    [args.id ?? null, args.email, args.name ?? "Test Person", args.role, args.state ?? null, args.limit ?? null, args.daily ?? null]);

  await asApi("authenticated", OFFICER);
  await t.rejects("an officer cannot add staff", () => save({ email: "n1@t.in", role: "credit_officer" }), /permission denied: user.manage/);

  await asApi("authenticated", ADMIN);
  const created = (await save({ email: " New.Officer@T.in ", name: "New Officer", role: "credit_officer", state: "KA", limit: 1500000, daily: 30 })).rows[0].id;
  const row = await one("select email, role, state_code, max_sanction_amount::int as lim, is_active from users where id = $1", [created]);
  t.equal("admin adds an officer", row, { email: "new.officer@t.in", role: "credit_officer", state_code: "KA", lim: 1500000, is_active: true });
  await t.rejects("same email twice", () => save({ email: "new.officer@t.in", role: "credit_officer" }), /already exists/);
  await t.rejects("bad email", () => save({ email: "not-an-email", role: "credit_officer" }), /valid email/);
  await t.rejects("unknown role", () => save({ email: "n2@t.in", role: "superuser" }), /does not exist/);
  await t.rejects("older role for a new person", () => save({ email: "n3@t.in", role: "viewer" }), /older role/);
  await t.rejects("a sanction limit for a role that does not decide", () => save({ email: "n4@t.in", role: "policy_manager", limit: 100000 }), /has no sanction limit/);
  await t.rejects("unknown state", () => save({ email: "n5@t.in", role: "credit_officer", state: "ZZ" }), /unknown state/);

  await t.ok("admin changes the officer's limit", () => save({ id: created, email: "new.officer@t.in", name: "New Officer", role: "credit_manager", state: "KA", limit: 3000000, daily: 20 }));
  await t.rejects("admin cannot change their own account", () => save({ id: adminId, email: "adm@t.in", name: "Admin", role: "credit_head" }), /cannot change your own/);

  // A login for the new address links itself (034), then the address is fixed
  await asOperator();
  await db.query("insert into auth.users (id, email) values ('cdcdcdcd-0000-0000-0000-0000000000cd', 'new.officer@t.in')");
  await asApi("authenticated", ADMIN);
  await t.rejects("email of a signed-in person cannot change", () => save({ id: created, email: "other@t.in", name: "New Officer", role: "credit_manager" }), /cannot be changed/);

  await t.rejects("suspend needs a reason", () => db.query("select fn_admin_set_user_active($1, false, '')", [created]), /give a reason/);
  await t.ok("admin suspends", () => db.query("select fn_admin_set_user_active($1, false, 'left the company')", [created]));
  await t.rejects("admin cannot suspend themselves", () => db.query("select fn_admin_set_user_active($1, false, 'testing it')", [adminId]), /own account/);
  await asApi("authenticated", "cdcdcdcd-0000-0000-0000-0000000000cd");
  await t.rejects("a suspended person can do nothing", () => db.query("select fn_require_permission('app.view.team')"), /no active cercit user/);
  await asApi("authenticated", ADMIN);
  await t.ok("admin reactivates", () => db.query("select fn_admin_set_user_active($1, true, 'came back')", [created]));

  const list = (await db.query("select email, role_name, has_login, is_me, can_manage from fn_admin_list_users() where email in ('adm@t.in', 'new.officer@t.in') order by email")).rows;
  t.equal("list shows roles, logins and who is me", list, [
    { email: "adm@t.in", role_name: "Admin", has_login: true, is_me: true, can_manage: true },
    { email: "new.officer@t.in", role_name: "Credit Manager", has_login: true, is_me: false, can_manage: true }]);
  await asApi("authenticated", OFFICER);
  await t.rejects("an officer cannot list staff", () => db.query("select * from fn_admin_list_users()"), /permission denied: user.view/);

  await asOperator();
  const ev = (await db.query("select event_type from audit_events where event_type like 'USER_%' order by created_at")).rows.map((r) => r.event_type);
  t.equal("every change is audited", ev, ["USER_CREATED", "USER_CHANGED", "USER_SUSPENDED", "USER_REACTIVATED"]);
  const changed = await one("select event_detail->'before'->>'role' as b, event_detail->'after'->>'role' as a from audit_events where event_type = 'USER_CHANGED'");
  t.equal("the change keeps before and after", changed, { b: "credit_officer", a: "credit_manager" });
  await db.query("set role anon");
  await t.rejects("anon cannot add staff", () => save({ email: "n6@t.in", role: "credit_officer" }), /permission denied for function/);
  await db.query("reset role");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 19. Role builder with a second approval (039)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("role change approval");
  await asOperator();
  const ADMIN = "abababab-0000-0000-0000-0000000000ab";
  const COMP = "c0c0c0c0-0000-0000-0000-0000000000c0";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('comp@t.in', 'Compliance', 'compliance', $1)", [COMP]);
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('adm2@t.in', 'Second Admin', 'admin', 'adadadad-0000-0000-0000-0000000000ad')");
  const submit = (code, perms, opts = {}) => db.query(
    "select fn_role_request_submit($1, $2, $3, $4, $5, $6, $7, $8) as id",
    [code, opts.name ?? "Branch Auditor", opts.desc ?? "Reads cases for audits", perms, opts.mfa ?? false, opts.idle ?? 15, opts.active ?? true, opts.reason ?? "branch audit team needs read access"]);

  await asApi("authenticated", OFFICER);
  await t.rejects("an officer cannot propose", () => submit("branch_auditor", ["app.view.all"]), /permission denied: role.manage/);

  await asApi("authenticated", ADMIN);
  await t.rejects("a conflicting pair is refused at once", () => submit("bad_mix", ["app.decide", "policy.author"]), /cannot sit on one role/);
  await t.rejects("unknown right", () => submit("bad_right", ["app.fly"]), /unknown rights/);
  await t.rejects("short reason", () => submit("x_role", ["app.view.all"], { reason: "why" }), /explain the change/);
  await t.rejects("admin role is fixed", () => submit("admin", ["user.view"], { name: "Admin" }), /cannot be changed here/);
  await t.rejects("switching off a role people hold", () => submit("credit_officer", ["app.view.own"], { name: "Credit Officer", active: false }), /active users still hold/);
  const reqId = (await submit("branch_auditor", ["app.view.all", "audit.view", "report.view"])).rows[0].id;
  await t.rejects("one open proposal per role", () => submit("branch_auditor", ["app.view.all"]), /already waiting/);
  t.equal("nothing changes before approval", (await one("select count(*)::int as n from roles where code = 'branch_auditor'")).n, 0);

  await t.rejects("admin cannot approve (no role.approve)", () => db.query("select fn_role_request_decide($1, true)", [reqId]), /permission denied: role.approve/);
  await asApi("authenticated", COMP);
  await t.rejects("reject needs a reason", () => db.query("select fn_role_request_decide($1, false, '')", [reqId]), /say why/);
  await t.ok("compliance approves", () => db.query("select fn_role_request_decide($1, true, 'ok')", [reqId]));
  t.equal("the new role exists with its rights", (await one("select fn_role_permissions('branch_auditor') as v")).v, ["app.view.all", "audit.view", "report.view"]);
  await t.rejects("cannot decide twice", () => db.query("select fn_role_request_decide($1, true)", [reqId]), /already approved/);

  // Change: drop a right, then reject
  await asApi("authenticated", ADMIN);
  await t.rejects("no change is refused", () => submit("branch_auditor", ["app.view.all", "audit.view", "report.view"]), /nothing has changed/);
  const req2 = (await submit("branch_auditor", ["app.view.all", "report.view"], { reason: "audit trail access not needed any more" })).rows[0].id;
  await asApi("authenticated", COMP);
  await t.ok("compliance rejects with a reason", () => db.query("select fn_role_request_decide($1, false, 'keep audit access for now')", [req2]));
  t.equal("rejected change leaves rights alone", (await one("select cardinality(fn_role_permissions('branch_auditor')) as n")).n, 3);

  // Withdraw: only the proposer
  await asApi("authenticated", ADMIN);
  const req3 = (await submit("branch_auditor", ["app.view.all"], { reason: "trim to case reading only" })).rows[0].id;
  await asApi("authenticated", "adadadad-0000-0000-0000-0000000000ad");
  await t.rejects("another admin cannot withdraw it", () => db.query("select fn_role_request_withdraw($1)", [req3]), /only the person who proposed/);
  await asApi("authenticated", ADMIN);
  await t.ok("proposer withdraws", () => db.query("select fn_role_request_withdraw($1)", [req3]));

  // Nobody approves their own proposal, even with both rights (operator sets up a test role)
  await asOperator();
  await t.rejects("no role may hold propose and approve", () => db.query("insert into role_permissions (role_code, permission_code) values ('admin', 'role.approve')"), /cannot hold both/);

  const ov = (await one("select fn_roles_overview() as v")).v;
  t.equal("overview lists roles, rights and requests", [ov.roles.some((r) => r.code === "branch_auditor"), ov.permissions.length > 25, ov.requests.length], [true, true, 3]);
  await asApi("authenticated", COMP);
  const ovc = (await one("select fn_roles_overview() as v")).v;
  t.equal("compliance may approve, not manage", [ovc.can_manage, ovc.can_approve], [false, true]);
  await asApi("authenticated", OFFICER);
  await t.rejects("an officer cannot see the role screen", () => db.query("select fn_roles_overview()"), /permission denied/);

  await asOperator();
  const ev = (await db.query("select event_type from audit_events where event_type like 'ROLE_CHANGE_%' order by created_at")).rows.map((r) => r.event_type);
  t.equal("proposals and decisions are audited", ev,
    ["ROLE_CHANGE_PROPOSED", "ROLE_CHANGE_APPROVED", "ROLE_CHANGE_PROPOSED", "ROLE_CHANGE_REJECTED", "ROLE_CHANGE_PROPOSED", "ROLE_CHANGE_WITHDRAWN"]);
  await db.query("set role authenticated");
  await t.rejects("nobody edits requests directly", () => db.query("update role_change_requests set status = 'APPROVED'"), /permission denied/);
  await db.query("reset role");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 20. Who am I (040)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("my account");
  await asApi("authenticated", "abababab-0000-0000-0000-0000000000ab");
  await db.query("set role authenticated");
  const me = (await db.query("select email, role, role_name from fn_my_account()")).rows;
  t.equal("staff see their own row only", me, [{ email: "adm@t.in", role: "admin", role_name: "Admin" }]);
  await asApi("authenticated", "55555555-5555-5555-5555-555555555555");
  t.equal("a customer login gets no row", (await db.query("select * from fn_my_account()")).rows.length, 0);
  await db.query("reset role");
  await db.query("set role anon");
  await asApi("anon");
  await t.rejects("anon cannot ask", () => db.query("select * from fn_my_account()"), /permission denied for function/);
  await db.query("reset role");
  await asOperator();
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 21. Organisation settings (041)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("organisation settings");
  const ADMIN = "abababab-0000-0000-0000-0000000000ab";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const base = { company_name: "cercit", support_email: "support@cercit.in", support_phone: "1800 000 0000",
    grievance_officer_email: "gro@cercit.in", grievance_reply_days: 7, staff_email_domains: ["cercit.in"], restrict_staff_domains: false };
  const save = (p) => db.query("select fn_org_settings_save($1::jsonb)", [JSON.stringify(p)]);

  await db.query("set role anon");
  await asApi("anon");
  const pub = (await one("select fn_public_org_info() as v")).v;
  t.equal("anyone reads the public details", [pub.company_name, pub.support_phone, pub.cin], ["cercit", "1800 000 0000", null]);
  t.equal("staff domains are not public", "staff_email_domains" in pub, false);
  await t.rejects("anon cannot read staff settings", () => db.query("select fn_org_settings()"), /permission denied for function/);
  await db.query("reset role");

  await asApi("authenticated", OFFICER);
  t.equal("an officer reads settings, cannot change them", (await one("select fn_org_settings()->>'can_manage' as v")).v, "false");
  await t.rejects("an officer cannot save", () => save(base), /permission denied: org.manage/);

  await asApi("authenticated", ADMIN);
  await t.rejects("a made-up CIN shape is refused", () => save({ ...base, cin: "12345" }), /ck_org_cin/);
  await t.rejects("a bad domain is refused", () => save({ ...base, staff_email_domains: ["@cercit.in"] }), /not an email domain/);
  await t.ok("admin saves a valid CIN, GSTIN and grievance officer", () => save({ ...base, cin: "u65999ka2026ptc123456", gstin: "29ABCDE1234F1Z5", grievance_officer_name: "A. Officer" }));
  t.equal("CIN stored upper case", (await one("select cin from organisation_settings")).cin, "U65999KA2026PTC123456");
  await t.rejects("restriction refused while active staff use other domains",
    () => save({ ...base, restrict_staff_domains: true }), /use other domains/);

  // Restriction on: only company addresses from then on (operator sets it up directly)
  await asOperator();
  await db.query("update organisation_settings set restrict_staff_domains = true, staff_email_domains = array['cercit.in']");
  await t.rejects("a staff account on another domain is refused", () => db.query("insert into users (email, full_name, role) values ('x@gmail.com', 'X', 'credit_officer')"), /company address/);
  await t.ok("a company address is fine", () => db.query("insert into users (email, full_name, role) values ('y@cercit.in', 'Y', 'credit_officer')"));
  await t.ok("an existing outside address can still be edited in other ways", () => db.query("update users set full_name = 'Admin Renamed' where email = 'adm@t.in'"));
  await db.query("update organisation_settings set restrict_staff_domains = false");

  t.equal("the change is audited with before and after",
    (await one("select event_detail->'before'->>'cin' as b, event_detail->'after'->>'cin' as a from audit_events where event_type = 'ORG_SETTINGS_CHANGED' order by created_at desc limit 1")),
    { b: null, a: "U65999KA2026PTC123456" });
  await db.query("set role authenticated");
  await t.rejects("nobody edits the settings table directly", () => db.query("update organisation_settings set company_name = 'x'"), /permission denied/);
  await db.query("reset role");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 22. Public read-only demo account (042)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("public demo account");
  await asOperator();
  const DEMO = "de0de0de-0000-0000-0000-0000000000de";
  await db.query("insert into auth.users (id, email) values ($1, 'cercit+demo@gmail.com')", [DEMO]);
  t.equal("the demo login links to its read-only row", (await one("select role from users where auth_user_id = $1", [DEMO])).role, "demo_viewer");
  await asApi("authenticated", DEMO);
  await t.ok("the demo account lists cases", () => db.query("select * from fn_list_applications()"));
  const appId = (await one("select application_id from applications order by created_at limit 1")).application_id;
  await t.rejects("it cannot decide a case", () => db.query("select fn_officer_decision($1, 'APPROVE')", [appId]), /permission denied: app.decide/);
  const cid = (await one("select id from customers limit 1")).id;
  await t.rejects("it cannot reveal PAN or mobile", () => db.query("select * from fn_customer_pii($1, 'x')", [cid]), /permission denied: pii.reveal/);
  await t.rejects("it cannot see the staff list", () => db.query("select * from fn_admin_list_users()"), /permission denied: user.view/);
  const sub = await one("select fn_submit_full_application(p_full_name => 'X', p_email => 'd1@t.in', p_mobile => '9000000099') as v");
  t.equal("it cannot submit an application", sub.v.summary, "permission denied: app.create");

  await asOperator();
  await t.rejects("no write right can be added to the demo role", () => db.query("insert into role_permissions (role_code, permission_code) values ('demo_viewer', 'app.decide')"), /may only look/);
  await t.rejects("the demo login cannot be promoted", () => db.query("update users set role = 'admin' where email = 'cercit+demo@gmail.com'"), /keeps its demo role/);
  await db.query("set role anon");
  for (let i = 0; i < 6; i++) await db.query("select fn_record_failed_login('cercit+demo@gmail.com')");
  await db.query("reset role");
  t.equal("wrong passwords never lock the demo account", (await one("select locked_until, failed_login_count as n from users where email = 'cercit+demo@gmail.com'")), { locked_until: null, n: 0 });
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 23. Customer onboarding, steps 1 and 2 (043)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("customer onboarding");
  await asOperator();
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  const OTHER = "c2c2c2c2-0000-0000-0000-0000000000c2";
  const asCustomer = async (sub, email) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated" })]);
  };
  const version = (await one("select fn_consent_text('APPLICATION_PROCESSING')->>'version' as v")).v;
  const start = (mobile = "9876543210", method = "SIMULATED", first = "asha", last = "R") =>
    db.query("select fn_customer_start($1, $2, $3, $4, $5, $6, 'test-agent') as v", [first, "", last, mobile, method, version]);
  const vehicle = (app, extra = {}) => db.query("select fn_customer_save_vehicle($1, $2::jsonb) as v", [app, JSON.stringify({
    source: "MANUAL", make: "Hyundai", model: "Creta", variant: "SX", fuel_type: "PETROL",
    ex_showroom: 1500000, road_tax: 150000, insurance: 60000, loan_amount: 1200000, tenure_months: 60, ...extra })]);

  t.equal("fourteen document types (ITR in 045; dealer papers and RC in 049)", (await one("select count(*)::int as n from document_types")).n, 14);
  await db.query("set role anon");
  await asApi("anon");
  t.equal("anyone can read the consent wording", version, "2026-09-v1");
  await t.rejects("anon cannot start an application", () => start(), /permission denied for function/);
  await db.query("reset role");

  await db.query("set role authenticated");
  await asCustomer(CUST, "asha.r@example.com");
  await t.rejects("a bad mobile is refused", () => start("12345"), /10-digit Indian mobile/);
  await t.rejects("mobile must be verified", () => start("9876543210", "NONE"), /verify your mobile/);
  await t.rejects("an old consent version is refused", () => db.query("select fn_customer_start('Asha', '', 'R', '9876543210', 'SIMULATED', 'old', null)"), /current consent/);
  const first = (await start()).rows[0].v;
  t.equal("step 1 creates a draft and moves to step 2", [/^APP-/.test(first.application_id) || first.application_id.length > 5, first.step], [true, 2]);
  const again = (await start()).rows[0].v;
  t.equal("starting again resumes the same draft", again.application_id, first.application_id);
  const cur = (await one("select fn_customer_current() as v")).v;
  t.equal("current draft shows name, masked mobile and the checklist (live photo from 045)",
    [cur.customer.first_name, cur.customer.last_name, cur.customer.mobile_last4, cur.customer.mobile_check, cur.draft.documents.length],
    ["Asha", "R", "3210", "SIMULATED", 8]);

  // Step 2
  await t.rejects("loan above the on-road price is refused", () => vehicle(first.application_id, { loan_amount: 2000000 }), /more than the on-road price/);
  await t.rejects("an odd tenure is refused", () => vehicle(first.application_id, { tenure_months: 50 }), /tenure/);
  await t.rejects("a quotation needs its date", () => vehicle(first.application_id, { source: "QUOTATION" }), /quotation date/);
  await t.rejects("an expired quotation is refused", () => vehicle(first.application_id, { source: "QUOTATION", quote_date: "2026-01-01", valid_until: "2026-01-31" }), /expired/);
  const saved = (await vehicle(first.application_id)).rows[0].v;
  t.equal("typed-in car details leave the quote owed", [saved.step, saved.quote_pending], [3, true]);
  await t.ok("switching to the quotation clears it", () => vehicle(first.application_id, { source: "QUOTATION", quote_date: new Date().toISOString().slice(0, 10), dealer_name: "Any Dealer", sales_officer_name: "Ravi", sales_officer_mobile: "9812345678", colour: "White" }));
  const cur2 = (await one("select fn_customer_current() as v")).v;
  t.equal("draft shows the car; the quote file is still owed",
    [cur2.draft.quote_pending, cur2.draft.vehicle.model, Number(cur2.draft.vehicle.on_road), cur2.draft.documents.find((d) => d.doc_type === "QUOTE").status],
    [false, "Creta", 1710000, "MISSING"]);

  // Someone else's draft
  await asCustomer(OTHER, "other@example.com");
  await t.rejects("another customer cannot touch this draft", () => vehicle(first.application_id), /application not found/);
  // Staff cannot apply
  await asCustomer("22222222-2222-2222-2222-222222222222", "o@t.in");
  await t.rejects("a staff login cannot apply as a customer", () => start(), /staff accounts cannot apply/);
  await asCustomer(OTHER, "other@example.com");
  t.equal("customers read nothing from the tables directly", (await one("select count(*)::int as n from vehicle_quotations")).n, 0);
  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  t.equal("consent is recorded with its wording hash", (await one("select count(*)::int as n, min(length(body_sha256))::int as l from customer_consents")), { n: 2, l: 64 });
  t.equal("mobile is stored encrypted, not in plain text", (await one("select mobile, mobile_last4 from customers where email = 'asha.r@example.com'")), { mobile: null, mobile_last4: "3210" });
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 24. Customer document uploads (044)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("customer documents");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  const OTHER = "c2c2c2c2-0000-0000-0000-0000000000c2";
  const asCustomer = async (sub, email) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated" })]);
  };
  await db.query("set role authenticated");
  await asCustomer(CUST, "asha.r@example.com");
  const app = (await one("select fn_customer_current()->'draft'->>'application_id' as v")).v;
  const sha = "a".repeat(64);
  const reg = (type, side, key, extra = {}) => db.query(
    "select fn_customer_register_document($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as v",
    [app, type, side, key, extra.name ?? "file.pdf", extra.mime ?? "application/pdf", extra.size ?? 120000, extra.sha ?? sha, extra.backend ?? "s3", extra.locked ?? false]);

  t.equal("the owner may upload", (await one("select fn_customer_can_upload($1) as v", [app])).v, true);
  const types = (await one("select fn_document_upload_types() as v")).v;
  t.equal("upload types come from the document map", [types.PAN.upload_type, types.PAN.folder, types.QUOTE.folder], ["pan_card", "uploads/kyc", "uploads/other/quote"]);

  await t.rejects("a key outside this application is refused", () => reg("PAN", "front", `uploads/kyc/APP-OTHER/x.pdf`), /does not belong/);
  await t.rejects("a key in the wrong folder is refused", () => reg("PAN", "front", `uploads/form16/${app}/x.pdf`), /does not belong/);
  await t.rejects("a path trick is refused", () => reg("PAN", "front", `uploads/kyc/${app}/../other/x.pdf`), /does not belong/);
  await t.rejects("one-sided documents take no front or back", () => reg("FORM16_B", "front", `uploads/form16/${app}/a.pdf`), /wrong side/);
  await t.rejects("a spreadsheet is refused", () => reg("PAN", "front", `uploads/kyc/${app}/a.xls`, { mime: "application/vnd.ms-excel" }), /PDF, JPG or PNG/);
  await t.rejects("a file over the limit is refused", () => reg("PAN", "front", `uploads/kyc/${app}/a.pdf`, { size: 50 * 1024 * 1024 }), /under 10 MB/);

  const front = (await reg("AADHAAR", "front", `uploads/kyc/${app}/1-front.jpg`, { mime: "image/jpeg" })).rows[0].v;
  t.equal("one side of Aadhaar is not enough", front.status, "MISSING");
  const back = (await reg("AADHAAR", "back", `uploads/kyc/${app}/2-back.jpg`, { mime: "image/jpeg" })).rows[0].v;
  t.equal("both sides mark Aadhaar received", back.status, "RECEIVED");
  await reg("AADHAAR", "front", `uploads/kyc/${app}/3-front.jpg`, { mime: "image/jpeg" });
  const cur = (await one("select fn_customer_current() as v")).v;
  const aad = cur.draft.documents.find((d) => d.doc_type === "AADHAAR");
  t.equal("a new front replaces the old one", aad.files.map((f) => f.side).sort(), ["back", "front"]);

  await reg("SALARY_SLIP", "single", `uploads/salary-slips/${app}/jun.pdf`, { locked: true });
  await reg("SALARY_SLIP", "single", `uploads/salary-slips/${app}/jul.pdf`);
  const slips = (await one("select fn_customer_current() as v")).v.draft.documents.find((d) => d.doc_type === "SALARY_SLIP");
  t.equal("salary slips keep every file", [slips.files.length, slips.status], [2, "RECEIVED"]);

  await asCustomer(OTHER, "other@example.com");
  t.equal("another customer may not upload here", (await one("select fn_customer_can_upload($1) as v", [app])).v, false);
  await t.rejects("another customer cannot register a file here", () => reg("FORM16_B", "single", `uploads/form16/${app}/f.pdf`), /application not found/);
  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  t.equal("replaced files are kept, marked superseded", (await one("select count(*) filter (where superseded_at is not null)::int as n from documents where doc_type = 'AADHAAR'")).n, 1);
  t.equal("locked PDFs are flagged, the password never stored", (await one("select count(*) filter (where was_password_protected)::int as n from documents")).n, 1);
  t.equal("every upload is audited", (await one("select count(*)::int as n from audit_events where event_type = 'DOCUMENT_UPLOADED'")).n, 5);
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 25. How documents are captured (045)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("document capture");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  await db.query("set role authenticated");
  await asApi("authenticated", CUST);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: CUST, email: "asha.r@example.com", role: "authenticated" })]);
  const app = (await one("select fn_customer_current()->'draft'->>'application_id' as v")).v;
  const reg = (type, side, key, extra = {}) => db.query(
    "select fn_customer_register_document($1, $2, $3, $4, $5, $6, $7, $8, 's3', $9, $10, $11) as v",
    [app, type, side, key, "file", extra.mime ?? "application/pdf", 90000, "b".repeat(64), extra.locked ?? false, extra.unlocked ?? false, extra.masked ?? false]);
  const docOf = async (code) => (await one("select fn_customer_current() as v")).v.draft.documents.find((d) => d.doc_type === code);

  const types = (await one("select fn_document_upload_types() as v")).v;
  t.equal("password asked only where files come locked", Object.keys(types).filter((k) => types[k].ask_password && types[k].stage === "APPLICATION").sort(), ["AADHAAR", "BANK_STMT", "ITR", "SALARY_SLIP"]);
  t.equal("ITR is optional and takes several files", [types.ITR.required, types.ITR.multi_file, types.ITR.folder], ["OPTIONAL", true, "uploads/other/itr"]);
  t.equal("open drafts get the live photo on the checklist", (await docOf("LIVE_PHOTO"))?.required, "ALWAYS");

  await t.rejects("the live photo must come from the camera", () => reg("LIVE_PHOTO", "single", `uploads/other/live-photo/${app}/s.png`, { mime: "image/png" }), /camera/);
  t.equal("a live photo is received", (await reg("LIVE_PHOTO", "single", `uploads/other/live-photo/${app}/s.jpg`, { mime: "image/jpeg" })).rows[0].v.status, "RECEIVED");

  t.equal("PAN front alone is enough", (await reg("PAN", "front", `uploads/kyc/${app}/p-front.jpg`, { mime: "image/jpeg" })).rows[0].v.status, "RECEIVED");
  await reg("PAN", "single", `uploads/kyc/${app}/p-digilocker.pdf`);
  t.equal("a DigiLocker PDF replaces the card photos", (await docOf("PAN")).files.map((f) => f.side), ["single"]);
  await reg("AADHAAR", "single", `uploads/kyc/${app}/e-aadhaar.pdf`, { locked: true, unlocked: true, masked: true });
  const aad = await docOf("AADHAAR");
  t.equal("e-Aadhaar as one PDF, opened and masked", [aad.status, aad.files.length, aad.files[0].unlocked, aad.files[0].masked], ["RECEIVED", 1, true, true]);

  const locked = (await reg("BANK_STMT", "single", `uploads/bank-statements/${app}/b.pdf`, { locked: true })).rows[0].v;
  t.equal("a locked file we could not open is not received", [locked.status, (await docOf("BANK_STMT")).note.startsWith("We could not open")], ["MISSING", true]);
  await reg("ITR", "single", `uploads/other/itr/${app}/ay2025.pdf`, { locked: true, unlocked: true });
  await reg("ITR", "single", `uploads/other/itr/${app}/ay2026.pdf`);
  t.equal("ITR keeps both years", (await docOf("ITR")).files.length, 2);
  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 26. Details, submit, tracking, returning customers (046)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("details and submit");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  // Sections 26-29 walk the manual path; the automatic checks (052) have their own section.
  await db.query("update document_auto_settings set enabled = false");
  const claims = (extra = {}) => db.query("select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({ sub: CUST, email: "asha.r@example.com", role: "authenticated", ...extra })]);
  await db.query("set role authenticated");
  await asApi("authenticated", CUST);
  await claims();
  const app = (await one("select fn_customer_current()->'draft'->>'application_id' as v")).v;
  const save = (group, p, shown = {}) => db.query("select fn_customer_save_details($1, $2, $3, $4) as v", [app, group, JSON.stringify(p), JSON.stringify(shown)]);
  const submit = () => db.query("select fn_customer_submit($1, '2026-09-v1', 'test') as v", [app]);
  const addr = { line1: "12, 3rd Cross, Indiranagar", city: "bengaluru", state_code: "KA", pincode: "560038" };

  const d = (await one("select fn_customer_details($1) as v", [app])).v;
  t.equal("details start empty, with the state list", [Object.keys(d.groups).length, d.states.some((s) => s.code === "KA")], [0, true]);

  const personal = { dob: "1991-06-02", father_name: "Ramesh Rao", gender: "FEMALE", marital_status: "MARRIED", pan: "ABCPR1234F" };
  await t.rejects("a company PAN is refused", () => save("PERSONAL", { ...personal, pan: "ABCCR1234F" }), /personal PAN/);
  await t.rejects("an under-18 date of birth is refused", () => save("PERSONAL", { ...personal, dob: "2015-01-01" }), /between 18 and 75/);
  const p1 = (await save("PERSONAL", personal, { dob: "1991-06-02", father_name: "Ramesh Rau", pan: "ABCPR1234F" })).rows[0].v;
  t.equal("changes to pre-filled fields are listed; the PAN is kept masked", [p1.edited, p1.values.pan], [["father_name"], "XXXXXX234F"]);
  await save("PERSONAL", { ...personal, pan: "XXXXXX234F" });
  t.equal("re-saving with the masked PAN keeps the PAN", (await one("select fn_customer_details($1) as v", [app])).v.customer.pan_last4, "234F");

  await t.rejects("a rented home needs the owner's mobile", () => save("ADDRESS", { permanent: addr, current_same: true, residence: "RENTED", owner_name: "K Das", years_at_current: 2 }), /owner's 10-digit mobile/);
  await t.rejects("a bad PIN is refused", () => save("ADDRESS", { permanent: { ...addr, pincode: "056003" }, current_same: true, residence: "OWNED", years_at_current: 5 }), /PIN code/);
  await save("ADDRESS", { permanent: addr, current_same: false, current: { ...addr, line1: "Flat 4B, Palm Grove, HSR Layout", pincode: "560102" },
                          residence: "RENTED", owner_name: "K Das", owner_mobile: "98450 12345", years_at_current: 2 }, { permanent: addr });
  const eb = (await one("select fn_customer_details($1) as v", [app])).v.eb_bill;
  t.equal("a different current address makes the electricity bill needed", [eb.required, eb.status], ["ALWAYS", "MISSING"]);

  await t.rejects("the EMIs they pay now are asked", () => save("EMPLOYMENT", { employer_name: "Acme Motors Pvt Ltd", employer_category: "PRIVATE_LTD", date_of_joining: "2019-04-01", net_monthly_salary: 85000 }), /EMIs you pay/);
  await save("EMPLOYMENT", { employer_name: "Acme Motors Pvt Ltd", employer_category: "PRIVATE_LTD", designation: "Engineer", date_of_joining: "2019-04-01", net_monthly_salary: 85000, existing_emis: 4500 },
             { employer_name: "Acme Motors Pvt Ltd", net_monthly_salary: 85000 });
  await t.rejects("submit waits for every needed document", () => submit(), /still needed: .*Form 16.*Bank statement.*Electricity bill/);

  const reg = (type, key) => db.query("select fn_customer_register_document($1, $2, 'single', $3, 'f.pdf', 'application/pdf', 9000, $4) as v", [app, type, key, "c".repeat(64)]);
  await reg("FORM16_B", `uploads/form16/${app}/f16.pdf`);
  await reg("BANK_STMT", `uploads/bank-statements/${app}/b2.pdf`);
  await reg("EB_BILL", `uploads/other/eb-bill/${app}/eb.pdf`);
  await t.rejects("submit needs a fresh email code", () => submit(), /code we email you/);
  await claims({ amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) - 3600 }] });
  await t.rejects("a code from an hour ago is not enough", () => submit(), /code we email you/);
  await claims({ amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) - 60 }] });
  const done = (await submit()).rows[0].v;
  t.equal("submitted for in-principle approval without a quotation", [done.status, done.approval_stage], ["SUBMITTED", "IN_PRINCIPLE"]);
  t.equal("the draft is closed", (await one("select fn_customer_current()->'draft' as v")).v, null);
  const tr = (await one("select fn_customer_track() as v")).v;
  t.equal("tracking shows it, received, with the quotation still to come",
    [tr.applications.length, tr.applications[0].events[0].stage, tr.applications[0].attention[0].name], [1, "RECEIVED", "Vehicle quotation"]);

  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  t.equal("customer changes are kept with what we showed", (await one("select edited_fields from application_detail_groups where group_code = 'PERSONAL'")).edited_fields, []);
  t.equal("the bureau consent is recorded", (await one("select count(*)::int as n from customer_consents where purpose = 'BUREAU_PULL'")).n, 1);
  const mob = (await one("select fn_mask_email('asha.r@example.com') as v")).v;
  t.equal("emails are masked for the continue screen", mob, "a•••@example.com");
  t.equal("every customer has a mobile blind index", (await one("select count(*) filter (where mobile_hash is null)::int as n from customers")).n, 0);
  await db.query("set role authenticated");
  await t.rejects("customers cannot look up a mobile", () => db.query("select fn_customer_resume_lookup('9876543210')"), /permission denied/);
  await t.rejects("customers cannot record a face match", () => db.query("select fn_record_face_match($1, 'PAN', 'front', 95, 'MATCH')", [app]), /permission denied/);
  await db.query("reset role");
  await db.query("select fn_record_face_match($1, 'PAN', 'front', 96.5, 'MATCH')", [app]);
  t.equal("face match results are kept", (await one("select result, similarity::text from kyc_face_matches")).result, "MATCH");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 27. The staff side of customer applications (047)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("staff customer cases");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  const OFFICER = "22222222-2222-2222-2222-222222222222"; // credit_officer, section 3
  const VIEWER = "11111111-1111-1111-1111-111111111111"; // viewer, section 3
  const as = async (sub, email) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated" })]);
  };
  await db.query("set role authenticated");
  await as(OFFICER, "o@t.in");
  const q = (await one("select fn_staff_customer_queue('OPEN') as v")).v;
  const row = q.rows[0];
  const app = row?.application_id;
  t.equal("the submitted customer application is in the officer's queue",
    [q.rows.length, row?.status, row?.face, row?.docs_to_check > 0], [1, "SUBMITTED", "MATCH", true]);
  const act = (action, p = {}) => db.query("select fn_staff_customer_action($1, $2, $3) as v", [app, action, JSON.stringify(p)]);
  const c = (await one("select fn_staff_customer_case($1) as v", [app])).v;
  t.equal("the case has details, files with their keys, and masked PII",
    [Object.keys(c.groups).sort(), c.documents.find((d) => d.doc_type === "PAN").files[0].key.startsWith("uploads/kyc/"), /^X+/.test(c.customer.pan)],
    [["ADDRESS", "EMPLOYMENT", "PERSONAL"], true, true]);

  await t.rejects("documents must be accepted before the credit check", () => act("DOCS_VERIFIED"), /accept these first/);
  await t.rejects("asking again needs a reason for the customer", () => act("REQUEST_DOC", { doc_type: "BANK_STMT", reason: "x" }), /tell the customer/);
  await act("REQUEST_DOC", { doc_type: "BANK_STMT", reason: "The last page is missing. Upload the full 6 months." });

  await as(CUST, "asha.r@example.com");
  const tr = (await one("select fn_customer_track() as v")).v.applications[0];
  t.equal("the customer sees what to upload again, and why",
    [tr.attention.map((a) => a.doc_type), tr.attention.find((a) => a.doc_type === "BANK_STMT").note],
    [["QUOTE", "BANK_STMT"], "The last page is missing. Upload the full 6 months."]);
  const reg = (type, key) => db.query("select fn_customer_register_document($1, $2, 'single', $3, 'f.pdf', 'application/pdf', 9000, $4) as v", [app, type, key, "d".repeat(64)]);
  t.equal("the customer can upload the document asked for", (await reg("BANK_STMT", `uploads/bank-statements/${app}/full.pdf`)).rows[0].v.status, "RECEIVED");
  await t.rejects("but nothing else after submitting", () => reg("FORM16_B", `uploads/form16/${app}/again.pdf`), /application not found/);

  await as(OFFICER, "o@t.in");
  await act("ASSIGN_TO_ME");
  for (const d of (await one("select fn_staff_customer_case($1) as v", [app])).v.documents) {
    if (d.status === "RECEIVED") await act("ACCEPT_DOC", { doc_type: d.doc_type });
  }
  t.equal("documents checked: on to the credit check", (await act("DOCS_VERIFIED")).rows[0].v.status, "UNDER_ASSESSMENT");

  await as(VIEWER, "v@t.in");
  await t.rejects("a viewer cannot decide", () => act("DECIDE", { decision: "APPROVE" }), /permission denied/);
  await as(OFFICER, "o@t.in");
  await t.rejects("a rejection needs a reason", () => act("DECIDE", { decision: "REJECT", note: "no" }), /reason/);
  await t.rejects("approving needs the credit checks", () => act("DECIDE", { decision: "APPROVE" }), /credit checks before approving/);
  const read = { slip_net_salary: 85400, form16_annual: 1020000, bank: { avg_monthly_balance: 62000, avg_salary: 85400, salary_count: 6, months: 6, emi_total: 4500, bounce_count: 0 } };
  const run = (await one("select fn_staff_customer_run_checks($1, $2) as v", [app, JSON.stringify(read)])).v;
  const checks = (await one("select fn_staff_customer_checks($1) as v", [app])).v;
  t.equal("credit checks: simulated bureau, bank and income from the readers, engine recommendation",
    [checks.bureau.bureau_name, checks.bank.salary_regularity, Number(checks.income.eligible_net_salary), Number(checks.declared_existing_emis), ["APPROVE", "MAYBE", "REJECT"].includes(checks.recommendation?.recommendation)],
    ["CIBIL-SIMULATED", "REGULAR", 85000, 4500, true]);
  t.equal("the case stays with the officer after the checks", (await one("select status from applications where application_id = $1", [app])).status, "UNDER_ASSESSMENT");
  const again = (await one("select fn_staff_customer_run_checks($1, $2) as v", [app, JSON.stringify(read)])).v;
  t.equal("the same PAN always gets the same simulated report",
    (await one("select count(distinct score)::int as n, count(*)::int as c from bureau_reports b join applications a on a.id = b.application_id where a.application_id = $1", [app])), { n: 1, c: 1 });
  const ok = (await act("DECIDE", { decision: "APPROVE" })).rows[0].v;
  t.equal("approved in principle (no quotation yet)", [ok.status, ok.approval_stage], ["APPROVED", "IN_PRINCIPLE"]);
  await t.rejects("final needs the quotation first", () => act("MOVE_TO_FINAL"), /quotation/);

  await as(CUST, "asha.r@example.com");
  await reg("QUOTE", `uploads/other/quote/${app}/quote.pdf`);
  const stages = (await one("select fn_customer_track() as v")).v.applications[0].events.map((e) => e.stage);
  t.equal("the customer's tracking shows each step", stages, ["RECEIVED", "DOCS_VERIFIED", "CREDIT_CHECK", "DECISION"]);

  await as(OFFICER, "o@t.in");
  await act("MOVE_TO_FINAL");
  await t.rejects("moving to final happens once", () => act("MOVE_TO_FINAL"), /only an in-principle approval/);
  const fin = (await act("DECIDE", { decision: "APPROVE" })).rows[0].v;
  t.equal("final approval", [fin.status, fin.approval_stage], ["APPROVED", "FINAL"]);
  t.equal("closed cases leave the open queue", (await one("select fn_staff_customer_queue('OPEN') as v")).v.rows.length, 0);

  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  t.equal("each decision is audited with its outcome", (await one("select count(*)::int as n from audit_events where event_type = 'OFFICER_DECIDE' and event_detail->>'decision' = 'APPROVE'")).n, 2);
  t.equal("with checks run, the decision goes through the shared decision path", (await one("select count(*)::int as n from credit_decisions cd join applications a on a.id = cd.application_id where a.application_id = $1", [app])).n > 0, true);
  const dist = (await one(`select count(*) filter (where (v->>'hit')::boolean is false)::int as nohit, round(avg((v->>'score')::int))::int as avg, min((v->>'score')::int) as lo, max((v->>'score')::int) as hi
                           from (select fn_simulated_bureau(id) as v from customers) x`));
  t.equal("simulated scores sit in the bureau range", dist.lo >= 300 && dist.hi <= 900, true);
  t.equal("every officer step is audited with who did it",
    (await one("select count(*) filter (where actor_id is null)::int as anon, count(*)::int as n from audit_events where event_type like 'OFFICER\\_%' and event_type <> 'OFFICER_DECISION'")).anon, 0);
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 28. After approval: offer and KFS, agreement, mandate, disbursement (049)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("after approval");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const as = async (sub, email, extra = {}) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated", ...extra })]);
  };
  const fresh = { amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) - 30 }] };

  t.equal("working days skip the weekend", (await one("select fn_add_working_days('2026-10-02', 3)::text as v")).v, "2026-10-07");
  t.equal("APR with no charges is the interest rate", Number((await one("select fn_apr(1000000, fn_emi(1000000, 9, 60), 60) as v")).v), 9);
  t.equal("first EMI is the 5th, at least 15 days out",
    await one("select fn_first_emi_date('2026-10-25')::text as a, fn_first_emi_date('2026-10-10')::text as b"), { a: "2026-12-05", b: "2026-11-05" });

  await db.query("set role authenticated");
  await as(OFFICER, "o@t.in");
  const app = (await one("select application_id from applications where origin = 'CUSTOMER' and status = 'APPROVED'")).application_id;
  await db.query("select fn_staff_issue_offer($1)", [app]);
  const o = (await one("select fn_staff_after_approval($1) as v", [app])).v.offer;
  t.equal("the offer carries fees, an APR above the rate, and a few working days to accept",
    [o.status, Number(o.apr_pct) > Number(o.rate_pct), Number(o.net_disbursal) === Number(o.sanctioned_amount) - Number(o.total_upfront), o.valid_until > new Date().toISOString().slice(0, 10)],
    ["ISSUED", true, true, true]);

  await as(CUST, "asha.r@example.com");
  await t.rejects("accepting needs the KFS version they saw", () => db.query("select fn_customer_accept_offer($1, 'x', 't')", [app]), /changed since you opened/);
  await t.rejects("accepting needs a fresh email code", () => db.query("select fn_customer_accept_offer($1, $2, 't')", [app, o.kfs_hash]), /code we email you/);
  await as(CUST, "asha.r@example.com", fresh);
  await db.query("select fn_customer_accept_offer($1, $2, 't')", [app, o.kfs_hash]);
  let cv = (await one("select fn_customer_after_approval($1) as v", [app])).v;
  t.equal("accepted: the agreement is ready and the dealer's papers are asked for",
    [cv.offer.status, cv.agreement.status, cv.documents.map((d) => d.doc_type)], ["ACCEPTED", "READY", ["MARGIN_RECEIPT", "VEHICLE_INVOICE", "INSURANCE"]]);

  await t.rejects("the signature must be the customer's name", () => db.query("select fn_customer_sign_agreement($1, $2, 'Someone Else', 't')", [app, cv.agreement.content_hash]), /type your full name exactly/);
  await db.query("select fn_customer_sign_agreement($1, $2, '  asha   r ', 't')", [app, cv.agreement.content_hash]);
  await t.rejects("a bad IFSC is refused", () => db.query("select fn_customer_set_mandate($1, $2)", [app, JSON.stringify({ holder_name: "Asha Rao", bank_name: "HDFC Bank", ifsc: "HDFC123", account_number: "50100123456789" })]), /IFSC/);
  await db.query("select fn_customer_set_mandate($1, $2)", [app, JSON.stringify({ holder_name: "Asha Rao", bank_name: "HDFC Bank", ifsc: "hdfc0001234", account_number: "5010 0123 4567 89", account_type: "savings" })]);
  cv = (await one("select fn_customer_after_approval($1) as v", [app])).v;
  t.equal("signed, and the mandate shows only the last 4 digits",
    [cv.agreement.status, cv.agreement.sign_method, cv.mandate.account, cv.mandate.umrn.startsWith("SIM")], ["SIGNED", "EMAIL_CODE_DEMO", "XXXXXX6789", true]);
  t.equal("tracking lists the dealer's papers to upload",
    (await one("select fn_customer_track() as v")).v.applications[0].attention.map((a) => a.doc_type).includes("VEHICLE_INVOICE"), true);

  await as(OFFICER, "o@t.in");
  await t.rejects("disbursing waits for the dealer's papers", () => db.query("select fn_staff_disburse($1)", [app]), /Down payment receipt.*Vehicle invoice.*Motor insurance/);
  await as(CUST, "asha.r@example.com");
  for (const [code, folder] of [["MARGIN_RECEIPT", "margin-receipt"], ["VEHICLE_INVOICE", "invoice"], ["INSURANCE", "insurance"]]) {
    await db.query("select fn_customer_register_document($1, $2, 'single', $3, 'f.pdf', 'application/pdf', 9000, $4)", [app, code, `uploads/other/${folder}/${app}/abcd1234-f.pdf`, "e".repeat(64)]);
  }
  await as(OFFICER, "o@t.in");
  for (const code of ["MARGIN_RECEIPT", "VEHICLE_INVOICE", "INSURANCE"]) {
    await db.query("select fn_staff_customer_action($1, 'ACCEPT_DOC', $2)", [app, JSON.stringify({ doc_type: code })]);
  }
  await t.rejects("other documents stay closed after approval", () => db.query("select fn_staff_customer_action($1, 'REQUEST_DOC', $2)", [app, JSON.stringify({ doc_type: "PAN", reason: "Please send it again" })]), /closed/);
  const d = (await one("select fn_staff_disburse($1, '{}') as v", [app])).v;
  cv = (await one("select fn_staff_after_approval($1) as v", [app])).v;
  const sched = cv.loan.schedule;
  t.equal("disbursed: loan account, a schedule that repays exactly the loan, RC asked for",
    [cv.application.status, d.loan_account_no.startsWith("CL"), sched.length, Math.round(sched.reduce((s, r) => s + Number(r.principal), 0)), cv.documents.find((x) => x.doc_type === "RC")?.status],
    ["DISBURSED", true, Number(cv.offer.tenure_months), Math.round(Number(cv.offer.sanctioned_amount)), "MISSING"]);
  await as(CUST, "asha.r@example.com");
  const tr = (await one("select fn_customer_track() as v")).v.applications[0];
  t.equal("the customer sees their loan account and the RC to send", [tr.loan.account, tr.attention.map((a) => a.doc_type)], [d.loan_account_no, ["RC"]]);
  t.equal("the RC can be uploaded after disbursement",
    (await one("select fn_customer_register_document($1, 'RC', 'single', $2, 'rc.pdf', 'application/pdf', 9000, $3) as v", [app, `uploads/other/rc/${app}/abcd1234-rc.pdf`, "f".repeat(64)])).v.status, "RECEIVED");
  const types = (await one("select fn_document_upload_types() as v")).v;
  t.equal("step 3 can tell application documents from the later ones", [types.PAN.stage, types.INSURANCE.stage, types.RC.stage], ["APPLICATION", "BEFORE_DISBURSAL", "AFTER_DISBURSAL"]);
  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  t.equal("the account number is stored encrypted", (await one("select count(*)::int as n from repayment_mandates where account_enc is not null and account_last4 = '6789'")).n, 1);
  t.equal("new applications never start with the dealer's papers on the checklist",
    (await one("select count(*)::int as n from application_document_requirements r join applications a on a.id = r.application_id where a.status = 'DRAFT' and r.doc_type in ('MARGIN_RECEIPT','VEHICLE_INVOICE','INSURANCE','RC')")).n, 0);
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 29. Real customers are hidden from the public demo login (050)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("customer privacy");
  const DEMO = "dddddddd-0000-0000-0000-00000000dd01";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('demo-viewer@t.in', 'Demo', 'demo_viewer', $1)", [DEMO]);
  const app = (await one("select application_id from applications where origin = 'CUSTOMER' and status <> 'DRAFT' limit 1")).application_id;
  const as = async (sub) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  };
  await db.query("set role authenticated");

  await as(DEMO);
  t.equal("the demo login is not allowed real customers", (await one("select fn_sees_real_customers() as v")).v, false);
  const dq = (await one("select fn_staff_customer_queue('ALL') as v")).v;
  t.equal("its customer queue is empty", [dq.rows.length, dq.restricted], [0, true]);
  await t.rejects("it cannot open a real customer's case", () => db.query("select fn_staff_customer_case($1)", [app]), /application not found/);
  await t.rejects("or the loan documents", () => db.query("select fn_staff_after_approval($1)", [app]), /application not found/);
  await t.rejects("or the credit checks", () => db.query("select fn_staff_customer_checks($1)", [app]), /application not found/);
  t.equal("customer-journey applications are not in the old list", (await one("select count(*)::int as n from fn_list_applications() l join applications a on a.application_id = l.application_id where a.origin = 'CUSTOMER'")).n, 0);
  t.equal("reading the tables directly shows no real customer",
    [(await one("select count(*)::int as n from customers where auth_user_id is not null")).n,
     (await one("select count(*)::int as n from applications where origin = 'CUSTOMER'")).n,
     (await one("select count(*)::int as n from documents d join applications a on a.id = d.application_id where a.application_id = $1", [app])).n],
    [0, 0, 0]);
  t.equal("sample cases stay visible to the demo", (await one("select count(*)::int as n from applications where origin = 'STAFF'")).n > 0, true);

  await as(OFFICER);
  t.equal("an officer still sees them", [(await one("select fn_sees_real_customers() as v")).v, (await one("select fn_staff_customer_queue('ALL') as v")).v.rows.length > 0], [true, true]);
  await db.query("reset role");
  await asOperator();
  await db.query("select set_config('request.jwt.claims', '', false)");
  // 051: a customer who has submitted is still found by mobile.
  const mob = (await one("select fn_pii_decrypt(mobile_enc) as m from customers where auth_user_id = 'c1c1c1c1-0000-0000-0000-0000000000c1'")).m;
  const found = (await one("select fn_customer_resume_lookup($1) as v", [mob])).v;
  t.equal("a returning customer is found by mobile at any stage", [found?.email, found?.status !== "DRAFT"], ["asha.r@example.com", true]);
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 30. Automatic document checks (052)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("automatic document checks");
  await db.query("update document_auto_settings set enabled = true");
  t.equal("names: an initial matches its word; different people do not",
    await one("select fn_doc_name_score('Sameer M', 'SAMEER S MITTIMANI') as a, fn_doc_name_score('Asha R', 'Priya Sharma') as b, fn_doc_name_score('M S', 'Mohan Sharma') as c"),
    { a: "1.00", b: "0", c: "0" });
  t.equal("employers: Pvt Ltd and Private Limited are the same company",
    (await one("select fn_doc_org_score('Acme Motors Pvt Ltd', 'ACME MOTORS PRIVATE LIMITED') as v")).v, "1.00");
  t.equal("pay months and dates in the ways documents print them",
    await one("select fn_doc_month('Sep-26')::text as a, fn_doc_month('Pay slip for August 2026')::text as b, fn_doc_month('09/2026')::text as c, fn_doc_date('02-06-1991')::text as d"),
    { a: "2026-09-01", b: "2026-08-01", c: "2026-09-01", d: "1991-06-02" });

  const CUST = "c3c3c3c3-0000-0000-0000-0000000000c3";
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const PM = "a5a5a5a5-0000-0000-0000-0000000000a5";
  const DEMO = "dddddddd-0000-0000-0000-00000000dd01";
  const as = async (sub, email, extra = {}) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated", ...extra })]);
  };
  const operator = async () => {
    await db.query("reset role");
    await asOperator();
    await db.query("select set_config('request.jwt.claims', '', false)");
  };
  await db.query("insert into users (email, full_name, role, auth_user_id) values ('pm5@t.in', 'Rules Owner', 'policy_manager', $1)", [PM]);

  // A clean customer, start to submit.
  await db.query("set role authenticated");
  await as(CUST, "ravi.k@example.com");
  const version = (await one("select fn_consent_text('APPLICATION_PROCESSING')->>'version' as v")).v;
  const app = (await one("select fn_customer_start('Ravi', '', 'Kumar', '9876500030', 'SIMULATED', $1, 't') as v", [version])).v.application_id;
  await db.query("select fn_customer_save_vehicle($1, $2::jsonb)", [app, JSON.stringify({
    source: "MANUAL", make: "Maruti", model: "Brezza", variant: "ZXi", fuel_type: "PETROL",
    ex_showroom: 1100000, road_tax: 110000, insurance: 45000, loan_amount: 900000, tenure_months: 60 })]);
  const reg = (type, key, mime = "application/pdf", masked = false) => db.query(
    "select fn_customer_register_document($1, $2, 'single', $3, 'f', $4, 90000, $5, 's3', false, false, $6)",
    [app, type, key, mime, "9".repeat(64), masked]);
  await reg("LIVE_PHOTO", `uploads/other/live-photo/${app}/abcd1234-me.jpg`, "image/jpeg");
  await reg("PAN", `uploads/kyc/${app}/abcd1234-pan.pdf`);
  await reg("AADHAAR", `uploads/kyc/${app}/abcd1234-aadhaar.pdf`, "application/pdf", true);
  for (const m of ["jul", "aug", "sep"]) await reg("SALARY_SLIP", `uploads/salary-slips/${app}/abcd1234-${m}.pdf`);
  await reg("FORM16_B", `uploads/form16/${app}/abcd1234-f16.pdf`);
  await reg("BANK_STMT", `uploads/bank-statements/${app}/abcd1234-bank.pdf`);
  const save = (group, p) => db.query("select fn_customer_save_details($1, $2, $3, '{}')", [app, group, JSON.stringify(p)]);
  await save("PERSONAL", { dob: "1990-04-15", father_name: "Suresh Kumar", gender: "MALE", marital_status: "SINGLE", pan: "BKRPK4321L" });
  await save("ADDRESS", { permanent: { line1: "8, 2nd Main, Jayanagar", city: "Bengaluru", state_code: "KA", pincode: "560041" }, current_same: true, residence: "OWNED", years_at_current: 6 });
  await save("EMPLOYMENT", { employer_name: "Acme Motors Pvt Ltd", employer_category: "PRIVATE_LTD", designation: "Analyst", date_of_joining: "2018-06-01", net_monthly_salary: 85000, existing_emis: 0 });

  // What the readers found (the readers use the service key).
  await operator();
  const month = (await one("select to_char(current_date - interval '10 days', 'Mon YYYY') as v")).v;
  const ay = (await one("select extract(year from current_date - interval '3 months')::int as v")).v;
  const read = (type, fields) => db.query("select fn_record_document_reading($1, $2, $3)", [app, type,
    JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, confidence: 0.95 }])))]);
  await read("pan_card", { name: "RAVI KUMAR", dob: "15/04/1990", pan_number: "BKRPK4321L" });
  await read("aadhaar_card", { name: "Ravi Kumar", address: "C/O: Suresh Kumar, 8, 2nd Main, Jayanagar, Bengaluru, Karnataka - 560041", aadhaar_number: "XXXX-XXXX-4321" });
  await read("salary_slip", { employer_name: "ACME MOTORS PRIVATE LIMITED", net_salary: "60,000.00", pay_period: month });
  await read("form16", { employer_name: "Acme Motors Pvt. Ltd.", pan: "BKRPK4321L", assessment_year: `${ay}-${String(ay + 1).slice(2)}` });
  await read("bank_statement", { months_analyzed: 6, salary_count: 6, avg_salary: 85000, bounce_count: 0, emi_total: 0, avg_monthly_balance: 90000 });
  await db.query("select fn_record_face_match($1, 'PAN', 'single', 96.4, 'MATCH')", [app]);
  t.equal("readings are saved in the database (R20); nothing is decided on a draft",
    [(await one("select count(*)::int as n from document_readings r join applications a on a.id = r.application_id where a.application_id = $1", [app])).n,
     (await one("select count(*)::int as n from application_document_requirements r join applications a on a.id = r.application_id where a.application_id = $1 and r.status = 'ACCEPTED'", [app])).n],
    [5, 0]);

  // Submit: the payslip says 60,000 but the customer said 85,000.
  await db.query("set role authenticated");
  await as(CUST, "ravi.k@example.com", { amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) - 30 }] });
  await db.query("select fn_customer_submit($1, '2026-09-v1', 't')", [app]);
  await as(OFFICER, "o@t.in");
  let c = (await one("select fn_staff_document_checks($1) as v", [app])).v;
  const status = async () => (await one("select status from applications where application_id = $1", [app])).status;
  t.equal("on submit, every clean document is accepted and the payslip waits for a person",
    [c.auto_accepted.sort(), c.summary.for_a_person, await status()],
    [["AADHAAR", "BANK_STMT", "FORM16_B", "LIVE_PHOTO", "PAN"], ["SALARY_SLIP"], "SUBMITTED"]);
  const slip = c.documents.SALARY_SLIP.find((x) => x.check === "SALARY_MATCH");
  t.equal("staff see which check failed and by how much, not the values", [slip.result, slip.detail], ["FAIL", "29.4% below what the customer gave"]);
  const q = (await one("select fn_staff_customer_queue('OPEN') as v", [])).v.rows.find((r) => r.application_id === app);
  t.equal("the queue shows how many were accepted automatically", [q.docs_auto_accepted, q.docs_to_check, q.fast_lane], [5, 1, false]);

  // The rules are data: an officer cannot change them; the rules owner can.
  const rule = (p) => db.query("select fn_staff_set_auto_rule($1) as v", [JSON.stringify(p)]);
  await t.rejects("an officer cannot change the rules", () => rule({ doc_type: "SALARY_SLIP", check: "SALARY_MATCH", threshold: 40 }), /permission denied/);
  await as(PM, "pm5@t.in", { aal: "aal2" });
  await t.rejects("asking the customer needs the words they will see", () => rule({ doc_type: "SALARY_SLIP", check: "EMPLOYER_MATCH", on_fail: "ASK_CUSTOMER" }), /what the customer is told/);
  await rule({ doc_type: "SALARY_SLIP", check: "SALARY_MATCH", threshold: 40 });
  const rules = (await one("select fn_staff_auto_rules() as v")).v;
  t.equal("the new threshold is in force", rules.documents.find((d) => d.doc_type === "SALARY_SLIP").checks.find((k) => k.check === "SALARY_MATCH").threshold, 40);

  // Run again: the payslip passes, the documents are verified and the credit check runs by itself.
  await as(OFFICER, "o@t.in");
  const r = (await one("select fn_staff_rerun_document_checks($1) as v", [app])).v;
  t.equal("with every document accepted the case moves on and the credit check runs itself",
    [r.accepted_now, r.docs_verified_automatically, r.credit_checks, await status(), ["APPROVE", "MAYBE", "REJECT"].includes(r.recommendation)],
    [["SALARY_SLIP"], true, "RUN", "UNDER_ASSESSMENT", true]);
  t.equal("fast lane only for an APPROVE recommendation", r.fast_lane, r.recommendation === "APPROVE");
  const checks = (await one("select fn_staff_customer_checks($1) as v", [app])).v;
  t.equal("the credit check used what the readers saved", [checks.bureau.bureau_name, checks.bank.months_covered, Number(checks.income.salary_slip_salary)], ["CIBIL-SIMULATED", 6, 60000]);

  await as(CUST, "ravi.k@example.com");
  t.equal("the customer's tracking shows the automatic steps in order",
    (await one("select fn_customer_track() as v")).v.applications[0].events.map((e) => e.stage), ["RECEIVED", "DOCS_VERIFIED", "CREDIT_CHECK"]);
  await t.rejects("customers cannot see the checks", () => db.query("select fn_staff_document_checks($1)", [app]), /permission denied|not authenticated|no active cercit user/);
  await as(DEMO, "demo@t.in");
  await t.rejects("nor can the demo login", () => db.query("select fn_staff_document_checks($1)", [app]), /application not found|permission denied/);

  await operator();
  t.equal("every automatic step is audited as the system; the rule change as the person",
    await one(`select count(*) filter (where event_type = 'AUTO_DOC_ACCEPTED' and actor_type = 'SYSTEM')::int as accepted,
                      count(*) filter (where event_type = 'AUTO_DOCS_VERIFIED')::int as verified,
                      count(*) filter (where event_type = 'AUTO_RUN_CHECKS' and actor_id is null)::int as checks
               from audit_events e join applications a on a.id = e.application_id where a.application_id = $1`, [app]),
    { accepted: 6, verified: 1, checks: 1 });
  t.equal("the rule change is audited with who made it", (await one("select count(*)::int as n from audit_events where event_type = 'AUTO_RULE_CHANGED' and actor_id is not null")).n, 1);
  t.equal("customers cannot read the rules or readings tables", await (async () => {
    await db.query("set role authenticated");
    await as(CUST, "ravi.k@example.com");
    try { await db.query("select * from document_readings"); return "read"; } catch { return "refused"; } finally { await operator(); }
  })(), "refused");
  failures += t.report();
}

// ---------------------------------------------------------------------------
// 31. Two bureaus, worst-of (053)
// ---------------------------------------------------------------------------
{
  const t = makeChecker("two bureaus, worst-of");
  const CUST = "c1c1c1c1-0000-0000-0000-0000000000c1"; // section 26/27 customer, PAN ABCPR1234F
  const OFFICER = "22222222-2222-2222-2222-222222222222";
  const DEMO = "dddddddd-0000-0000-0000-00000000dd01";
  const as = async (sub, email) => {
    await asApi("authenticated", sub);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, email, role: "authenticated" })]);
  };
  const operator = async () => {
    await db.query("reset role");
    await asOperator();
    await db.query("select set_config('request.jwt.claims', '', false)");
  };
  await operator();
  const appOf = (pan) => one(`select a.id, a.application_id, a.customer_id from applications a join customers c on c.id = a.customer_id
                              where c.pan_hash = fn_pii_hash($1) and exists (select 1 from bureau_reports b where b.application_id = a.id)`, [pan]);
  const app27 = await appOf("ABCPR1234F"); // both bureaus have a record (CIBIL + CRIF)
  const app30 = await appOf("BKRPK4321L"); // CIBIL only
  const combined = (id) => one("select * from bureau_summary where application_id = $1 and bureau = 'COMBINED'", [id]);

  // Fixtures go through the same maths path as a stored pull.
  const grid = (cells = {}) => Array.from({ length: 24 }, (_, i) => cells[i + 1] ?? 0);
  const acct = (o) => ({ seq: 1, merged_seq: null, lender_raw: "x", lender_code: "X", product_raw: "Personal Loan", product: "PERSONAL",
    secured: false, revolving: false, corporate: false, account_masked: null, ownership: "INDIVIDUAL", status: "ACTIVE", asset_class: "STD",
    restructured: false, suit_filed: false, sanctioned: null, credit_limit: null, cash_limit: null, outstanding: 0, overdue: 0, emi: null,
    frequency: "M", rate_pct: null, tenure_months: null, collateral: null, collateral_value: null, opened_on: "2024-01-10",
    last_payment_on: null, last_payment_amount: null, closed_on: null, reported_on: "2026-09-30", writeoff_amount: null, settled_amount: null,
    grid_month: "2026-09-01", dpd: grid(), dpd_max_25_36m: 0, ...o });
  const fixture = async (heads, accts, enqs = []) => (await db.query(
    `select s.* from fn_bureau_combine_arrays(
       array(select x from jsonb_populate_recordset(null::bureau_summary, $1) x),
       array(select x from jsonb_populate_recordset(null::bureau_accounts, $2) x),
       array(select x from jsonb_populate_recordset(null::bureau_enquiries, $3) x), '2026-10-01') c
     cross join lateral unnest(c.summaries) s`, [JSON.stringify(heads), JSON.stringify(accts), JSON.stringify(enqs)])).rows;
  const groups = async (accts) => (await one(
    "select count(distinct m.merged_seq)::int as n from unnest(fn_bureau_match(array(select x from jsonb_populate_recordset(null::bureau_accounts, $1) x))) m",
    [JSON.stringify(accts)])).n;
  const seedRun = async (seed) => (await db.query(
    `select s.* from fn_bureau_sim_raw($1, current_date, 75000) r
     cross join lateral fn_bureau_combine_arrays(r.heads, r.accounts, r.enquiries, current_date) c
     cross join lateral unnest(c.summaries) s`, [seed])).rows;

  // The simulation over 400 literal seeds, kept for the shape and worst-of checks.
  await db.query(`create temp table sim31 as
    select g, s.* from generate_series(1, 400) g
    cross join lateral fn_bureau_sim_raw('dist-' || g, current_date, 75000) r
    cross join lateral fn_bureau_combine_arrays(r.heads, r.accounts, r.enquiries, current_date) c
    cross join lateral unnest(c.summaries) s`);

  t.equal("two bureaus pulled, CIBIL plus one other, and a combined row",
    (await db.query("select bureau from bureau_summary where application_id = $1 order by bureau = 'COMBINED', bureau <> 'CIBIL', bureau", [app27.id])).rows.map((r) => r.bureau),
    ["CIBIL", "CRIF", "COMBINED"]);
  t.equal("still one engine row, named as before",
    await one("select count(*)::int as n, min(bureau_name) as name, min(report_raw_path) as path, min(bureau_count)::int as bureaus from bureau_reports where application_id = $1", [app27.id]),
    { n: 1, name: "CIBIL-SIMULATED", path: "simulated:bureau-sim-v2", bureaus: 2 });

  const engineCols = `score, active_accounts, total_outstanding::int, total_monthly_emi::int, dpd_max_12m, dpd_max_24m, dpd_30_count_24m,
    dpd_60_plus_flag, enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct::text, oldest_account_months,
    no_hit, score_source, bureau_count, report_ref, consent_id, valid_until::text`;
  const combinedCols = `score, active_accounts, total_outstanding, monthly_obligation, dpd_max_12m, dpd_max_24m, dpd_30_count_24m,
    dpd_60_plus_flag, enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct::text, oldest_account_months,
    no_hit, score_source, bureau_count, report_ref, consent_id, valid_until::text`;
  for (const app of [app27, app30]) {
    const e = await one(`select ${engineCols} from bureau_reports where application_id = $1`, [app.id]);
    const c = await one(`select ${combinedCols} from bureau_summary where application_id = $1 and bureau = 'COMBINED'`, [app.id]);
    t.equal(`the engine row is the COMBINED summary (${app.application_id})`, Object.values(e), Object.values(c));
  }

  const c27 = await combined(app27.id);
  const c30 = await combined(app30.id);
  const scoreOf = async (id, cibil) => (await one(`select score from bureau_summary where application_id = $1 and ${cibil ? "bureau = 'CIBIL'" : "bureau not in ('CIBIL', 'COMBINED')"}`, [id])).score;
  const noCibil = (await one("select g from generate_series(1, 400) g where (fn_sim_bytes('cibil-none-' || g, 'c0'))[1] between 8 and 12 limit 1")).g;
  const nc = await seedRun(`cibil-none-${noCibil}`);
  const ncOther = nc.find((s) => s.bureau !== "CIBIL" && s.bureau !== "COMBINED");
  const ncComb = nc.find((s) => s.bureau === "COMBINED");
  t.equal("the score is CIBIL's when CIBIL has a record, else the other bureau's",
    [c27.score === (await scoreOf(app27.id, true)), c27.score_source, c30.score === (await scoreOf(app30.id, true)), c30.score_source,
     nc.find((s) => s.bureau === "CIBIL").no_hit, ncComb.score === ncOther.score, ncComb.score_source === ncOther.bureau],
    [true, "CIBIL", true, "CIBIL", true, true, true]);

  // COMBINED is never better than either bureau, on stored pulls and the 400 simulated ones.
  const worstOf = (src, key) => one(`
    with per as (
      select ${key} as k, max(dpd_max_3m) d3, max(dpd_max_6m) d6, max(dpd_max_12m) d12, max(dpd_max_24m) d24, max(dpd_max_36m) d36,
             max(dpd_30_count_24m) c30, bool_or(dpd_60_plus_flag) f60, max(writeoff_count_5y) wo, max(settled_count_5y) st,
             max(enquiry_count_90d) e90, sum(enquiry_count_90d) e90s, max(active_accounts) aa, sum(active_accounts) aas
      from ${src} where bureau <> 'COMBINED' and not no_hit group by 1)
    select count(*)::int as n,
           count(*) filter (where not (c.dpd_max_3m >= p.d3 and c.dpd_max_6m >= p.d6 and c.dpd_max_12m >= p.d12 and c.dpd_max_24m >= p.d24
                                       and c.dpd_max_36m >= p.d36 and c.dpd_30_count_24m >= p.c30 and (c.dpd_60_plus_flag or not p.f60)
                                       and c.writeoff_count_5y >= p.wo and c.settled_count_5y >= p.st
                                       and c.enquiry_count_90d between p.e90 and p.e90s and c.active_accounts between p.aa and p.aas))::int as worse
    from per p join ${src} c on ${key.replace(/^/, "c.")} = p.k and c.bureau = 'COMBINED'`);
  const ws = await worstOf("bureau_summary", "application_id");
  const wsim = await worstOf("sim31", "g");
  t.equal("the combined row is never better than either bureau", [ws.n >= 2, ws.worse, wsim.n > 300, wsim.worse], [true, 0, true, 0]);

  const oblig = await one(`select
      count(*) filter (where monthly_obligation is distinct from instalment_emi + revolving_obligation)::int as bad_sum,
      count(*) filter (where s.bureau <> 'COMBINED' and not s.no_hit and (
        s.revolving_obligation is distinct from (select round(0.05 * coalesce(sum(a.outstanding), 0)) from bureau_accounts a
          where a.application_id = s.application_id and a.bureau = s.bureau and a.revolving and not a.corporate
            and a.status = 'ACTIVE' and a.ownership in ('INDIVIDUAL', 'JOINT'))
        or s.instalment_emi is distinct from (select coalesce(sum(fn_bureau_monthly_emi(a.emi, a.frequency)), 0) from bureau_accounts a
          where a.application_id = s.application_id and a.bureau = s.bureau and not a.revolving
            and a.status = 'ACTIVE' and a.ownership in ('INDIVIDUAL', 'JOINT'))))::int as bad_parts,
      (select count(*) from sim31 where monthly_obligation is distinct from instalment_emi + revolving_obligation)::int as bad_sim
    from bureau_summary s`);
  t.equal("monthly obligation = EMIs + 5% of card and overdraft balances", oblig, { bad_sum: 0, bad_parts: 0, bad_sim: 0 });

  await t.rejects("every account carries a 24-month grid", () => db.query(
    `insert into bureau_accounts select * from jsonb_populate_record(null::bureau_accounts,
       (select to_jsonb(a) || jsonb_build_object('seq', 99, 'dpd', to_jsonb((a.dpd)[1:23])) from bureau_accounts a where a.application_id = $1 limit 1))`,
    [app27.id]), /ck_bureau_accounts_dpd/);

  const snap = (id) => one(`select (select count(*) from bureau_summary where application_id = $1)::int as s,
      (select count(*) from bureau_accounts where application_id = $1)::int as a,
      (select count(*) from bureau_enquiries where application_id = $1)::int as e,
      (select count(*) from bureau_reports where application_id = $1)::int as b,
      (select md5(string_agg(b::text, '' order by b.id)) from bureau_reports b where application_id = $1) as h`, [id]);
  const before = await snap(app30.id);
  await db.query("set role authenticated");
  await as(OFFICER, "o@t.in");
  await db.query("select fn_staff_customer_run_checks($1, '{}'::jsonb)", [app30.application_id]);
  await operator();
  t.equal("re-running the credit checks adds nothing", [before.s > 0, await snap(app30.id)], [true, before]);

  await t.rejects("a second v2 engine row is refused", () => db.query(
    "insert into bureau_reports (application_id, customer_id, bureau_name, report_raw_path) select application_id, customer_id, 'CIBIL-SIMULATED', 'simulated:bureau-sim-v2' from bureau_reports where application_id = $1",
    [app27.id]), /ux_bureau_reports_one_v2/);

  const pv = (await one("select fn_simulated_bureau($1) as v", [app27.customer_id])).v;
  t.equal("the preview matches what was stored", [pv.hit, pv.score, pv.version, pv.bureaus.length, pv.score_source], [true, c27.score, 2, 2, "CIBIL"]);

  t.equal("lender names match through aliases",
    await one(`select fn_lender_key('HDFC Bank Ltd.') as a, fn_lender_key('Bankers Trust') as b, fn_lender_code('Housing Development Finance Corporation') as c,
                      fn_lender_code('UTI Bank') as d, left(fn_lender_code('Shiny New Lender'), 1) as e`),
    { a: "hdfc", b: "bankerstrust", c: "HDFC", d: "AXIS", e: "~" });

  // The same HDFC car loan on both bureaus, an Experian-only consumer loan, a corporate card and a loan the customer only guarantees.
  const twoHeads = [{ bureau: "CIBIL", no_hit: false, score: 760 }, { bureau: "EXPERIAN", no_hit: false, score: 748 }];
  const autoC = acct({ bureau: "CIBIL", seq: 1, lender_raw: "HDFC Bank", lender_code: "HDFC", product_raw: "Auto Loan (Personal)", product: "AUTO",
    secured: true, sanctioned: 500000, outstanding: 400000, emi: 10400, tenure_months: 60, opened_on: "2024-01-10" });
  const autoE = acct({ bureau: "EXPERIAN", seq: 1, lender_raw: "HDFC Bk", lender_code: "HDFC", product_raw: "Auto Loan", product: "AUTO",
    secured: true, sanctioned: 504000, outstanding: 401000, emi: 10450, tenure_months: 60, opened_on: "2024-01-25", dpd: grid({ 3: 30 }) });
  const merged = (await fixture(twoHeads, [autoC, autoE,
    acct({ bureau: "EXPERIAN", seq: 2, lender_raw: "Bajaj Finance", lender_code: "BAJAJ", product_raw: "Consumer Durable Loan", product: "CONSUMER",
      sanctioned: 60000, outstanding: 20000, emi: 5400, tenure_months: 12, opened_on: "2026-03-05" }),
    acct({ bureau: "CIBIL", seq: 2, lender_raw: "ICICI Bank", lender_code: "ICICI", product_raw: "Corporate Credit Card", product: "CORP_CARD",
      revolving: true, corporate: true, credit_limit: 200000, outstanding: 80000, opened_on: "2023-05-01" }),
    acct({ bureau: "CIBIL", seq: 3, lender_raw: "SBI", lender_code: "SBI", ownership: "GUARANTOR", sanctioned: 300000, outstanding: 150000,
      emi: 9000, tenure_months: 48, opened_on: "2023-02-01", dpd: grid({ 5: 60 }) }),
  ])).find((s) => s.bureau === "COMBINED");
  t.equal("the same loan on two bureaus counts once",
    [merged.active_loans, merged.dpd_max_3m, merged.dpd_60_plus_flag, merged.guarantor_accounts, merged.one_bureau_accounts,
     merged.corporate_cards, merged.monthly_obligation, merged.revolving_obligation],
    [2, 30, true, 1, 3, 1, 10450 + 5400, 0]);

  const cardA = acct({ bureau: "CIBIL", lender_code: "AXIS", product: "CARD", revolving: true, credit_limit: 100000, opened_on: "2022-03-01" });
  const cardB = acct({ bureau: "CRIF", lender_code: "AXIS", product: "CARD", revolving: true, credit_limit: 150000, opened_on: "2022-03-11" });
  t.equal("matching tolerances",
    [await groups([autoC, { ...autoE, opened_on: "2024-02-19" }]),
     await groups([autoC, { ...autoE, sanctioned: 515000 }]),
     await groups([cardA, cardB]),
     await groups([{ ...autoC, account_masked: "XXXXXXXX1234" }, { ...autoE, account_masked: "XXXXXXXX9999" }]),
     await groups([autoC, autoE])],
    [2, 2, 1, 2, 1]);

  t.equal("a microfinance personal loan is a personal loan",
    await one(`select (select product from fn_bureau_product('CRIF', 'Microfinance  Personal Loan')) as mf,
                      (select product || ':' || corporate || ':' || revolving from fn_bureau_product('CIBIL', 'Corporate Credit Card')) as corp,
                      (select product from fn_bureau_product('EXPERIAN', 'Something Unheard Of')) as other`),
    { mf: "PERSONAL", corp: "CORP_CARD:true:true", other: "OTHER" });
  t.equal("the 5% is one named number", [Number((await one("select fn_bureau_revolving_rate() as r")).r), (await one("select fn_bureau_revolving_in_foir() as v")).v], [0.05, true]);

  const older = (await fixture([{ bureau: "CIBIL", no_hit: false, score: 720 }],
    [acct({ bureau: "CIBIL", lender_code: "SBI", sanctioned: 200000, outstanding: 50000, emi: 6000, dpd_max_25_36m: 60 })])).find((s) => s.bureau === "COMBINED");
  t.equal("the 36-month window comes from the older months", [older.dpd_max_36m, older.dpd_max_24m, older.dpd_60_plus_flag], [60, 0, true]);

  // A loan still open on one bureau is still owed when the other reports it settled or written off;
  // the settlement and the write-off still count as bad marks.
  const liveHeads = [{ bureau: "CIBIL", no_hit: false, score: 705 }, { bureau: "EXPERIAN", no_hit: false, score: 690 }];
  const live = await fixture(liveHeads, [
    acct({ bureau: "CIBIL", seq: 1, lender_code: "HDFC", product_raw: "Auto Loan (Personal)", product: "AUTO", secured: true,
      sanctioned: 500000, outstanding: 300000, emi: 9000, tenure_months: 60, opened_on: "2024-01-10" }),
    acct({ bureau: "EXPERIAN", seq: 1, lender_code: "HDFC", product_raw: "Auto Loan", product: "AUTO", secured: true, status: "SETTLED",
      asset_class: "SUB", sanctioned: 500000, outstanding: 0, emi: 9000, tenure_months: 60, opened_on: "2024-01-12",
      closed_on: "2026-06-30", settled_amount: 250000 }),
    acct({ bureau: "CIBIL", seq: 2, lender_code: "AXIS", product_raw: "Credit Card", product: "CARD", revolving: true,
      credit_limit: 100000, outstanding: 40000, opened_on: "2022-03-01" }),
    acct({ bureau: "EXPERIAN", seq: 2, lender_code: "AXIS", product_raw: "Credit Card", product: "CARD", revolving: true, status: "WRITTEN_OFF",
      asset_class: "LSS", credit_limit: 100000, outstanding: 45000, opened_on: "2022-03-05", closed_on: "2026-05-31", writeoff_amount: 45000 }),
  ]);
  const liveC = live.find((s) => s.bureau === "COMBINED");
  const liveCibil = live.find((s) => s.bureau === "CIBIL");
  t.equal("a loan open on one bureau stays owed when the other says settled or written off",
    [liveC.active_loans, liveC.active_cards, liveC.active_accounts, liveC.total_outstanding, liveC.instalment_emi, liveC.revolving_obligation,
     liveC.monthly_obligation, liveC.settled_count_5y, liveC.writeoff_count_5y, liveC.dpd_60_plus_flag,
     liveC.active_accounts >= liveCibil.active_accounts && liveC.monthly_obligation >= liveCibil.monthly_obligation],
    [1, 1, 2, 345000, 9000, 2250, 11250, 1, 1, true, true]);

  // One bureau, two accounts reported to different months: the older grid's last months are not lost.
  const lag = await fixture([{ bureau: "CIBIL", no_hit: false, score: 730 }], [
    acct({ bureau: "CIBIL", seq: 1, lender_code: "SBI", sanctioned: 200000, outstanding: 50000, emi: 6000 }),
    acct({ bureau: "CIBIL", seq: 2, lender_code: "ICICI", sanctioned: 100000, outstanding: 20000, emi: 3000, grid_month: "2026-07-01",
      reported_on: "2026-07-31", dpd: grid({ 23: 30, 24: 60 }) }),
  ]);
  const lagCibil = lag.find((s) => s.bureau === "CIBIL");
  const lagC = lag.find((s) => s.bureau === "COMBINED");
  t.equal("a lagging grid's oldest months still count",
    [lagCibil.dpd_max_24m, lagCibil.dpd_max_36m, lagCibil.dpd_60_plus_flag, lagC.dpd_max_36m, lagC.dpd_60_plus_flag],
    [0, 60, true, 60, true]);

  // Cards with no limit stay out of utilisation; same-day enquiries on one bureau stay two;
  // the combined on-time share is never better than a bureau's.
  const misc = await fixture(liveHeads, [
    acct({ bureau: "CIBIL", seq: 1, lender_code: "AXIS", product_raw: "Credit Card", product: "CARD", revolving: true,
      credit_limit: 100000, outstanding: 50000, opened_on: "2022-03-01", dpd: grid(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 13, 30]))) }),
    acct({ bureau: "CIBIL", seq: 2, lender_code: "SBI", product_raw: "Credit Card", product: "CARD", revolving: true,
      credit_limit: null, outstanding: 30000, opened_on: "2023-06-01" }),
    acct({ bureau: "EXPERIAN", seq: 1, lender_code: "KOTAK", product_raw: "Personal Loan", product: "PERSONAL",
      sanctioned: 100000, outstanding: 40000, emi: 4000, opened_on: "2025-02-01" }),
  ], [
    { bureau: "CIBIL", seq: 1, enquired_on: "2026-09-10", lender_raw: "HDFC Bank", lender_code: "HDFC", purpose: "AUTO" },
    { bureau: "CIBIL", seq: 2, enquired_on: "2026-09-10", lender_raw: "HDFC Bank", lender_code: "HDFC", purpose: "AUTO" },
    { bureau: "EXPERIAN", seq: 1, enquired_on: "2026-09-10", lender_raw: "HDFC Bk", lender_code: "HDFC", purpose: "AUTO" },
  ]);
  const miscC = misc.find((s) => s.bureau === "COMBINED");
  const miscCibil = misc.find((s) => s.bureau === "CIBIL");
  t.equal("cards with no limit stay out of utilisation",
    [miscCibil.card_balance, miscCibil.card_limit, Number(miscCibil.credit_utilization_pct), miscCibil.total_outstanding, miscCibil.revolving_obligation],
    [50000, 100000, 50, 80000, 4000]);
  t.equal("the same enquiry on both bureaus counts once, two on one bureau stay two",
    [miscCibil.enquiry_count_90d, miscC.enquiry_count_90d], [2, 2]);
  t.equal("the combined on-time share is never better than a bureau's",
    [Number(miscCibil.on_time_pct_24m), Number(misc.find((s) => s.bureau === "EXPERIAN").on_time_pct_24m), Number(miscC.on_time_pct_24m)],
    [75, 100, 75]);

  // A bare application: no consent, then a stored per-bureau fixture combined in place (as a real bureau feed would).
  const bare = (await one(`insert into applications (application_id, customer_id, status, origin, declared_net_salary)
                           select 'T31-BARE-0001', customer_id, 'SUBMITTED', 'STAFF', 50000 from applications where origin = 'STAFF' order by created_at limit 1
                           returning id`)).id;
  await t.rejects("no consent, no pull", () => db.query("select fn_bureau_pull_simulated($1, null)", [bare]), /consent/);
  await db.query(`insert into customer_consents (customer_id, application_id, purpose, version, body_sha256)
                  select customer_id, id, 'BUREAU_PULL', '2026-09-v1', repeat('a', 64) from applications where id = $1`, [bare]);
  await db.query(`insert into bureau_summary (application_id, bureau, report_ref, pulled_at, raw_key, grid_month, no_hit, score, computed_at)
                  values ($1, 'CIBIL', 'TEST-ZEN-1', now(), 'simulated:bureau-sim-v2', '2026-09-01', false, 712, now())`, [bare]);
  await db.query("insert into bureau_accounts select * from jsonb_populate_record(null::bureau_accounts, $1)", [JSON.stringify(acct({
    application_id: bare, bureau: "CIBIL", lender_raw: "Zenith Microcredit Pvt Ltd", lender_code: "~zenithmicrocred", product_raw: "Consumer Loan",
    product: "CONSUMER", status: "CLOSED", closed_on: "2026-08-15", sanctioned: 40000, emi: 3600, tenure_months: 12, opened_on: "2025-08-10",
    dpd: grid({ 2: 30 }) }))]);
  // An open loan whose EMI the bureau left out.
  await db.query("insert into bureau_accounts select * from jsonb_populate_record(null::bureau_accounts, $1)", [JSON.stringify(acct({
    application_id: bare, bureau: "CIBIL", seq: 2, lender_raw: "SBI", lender_code: "SBI", sanctioned: 150000, outstanding: 90000, emi: null }))]);
  const zc = (await one("select fn_bureau_combine($1) as v", [bare])).v;
  const zd = (await one("select fn_bureau_detail_json($1) as v", [bare])).v;
  const zComb = zd.summaries[zd.summaries.length - 1];
  t.equal("a cancelled-licence lender is flagged, its bad marks still count",
    [zc.engine_row_written, zd.accounts[0].lender_code, zd.accounts[0].licence_cancelled, zComb.stale_lender_accounts, zComb.dpd_max_12m,
     zd.engine.dpd_max_12m, zd.flags.map((f) => f.code).includes("LICENCE_CANCELLED_LENDER")],
    [true, "ZENFIN", true, 1, 30, 30, true]);
  t.equal("an open loan with no EMI reported is pointed out",
    [zd.flags.map((f) => f.code).includes("EMI_NOT_REPORTED"), zd.accounts.find((a) => a.lender_code === "SBI")?.emi_not_reported,
     zd.accounts.find((a) => a.lender_code === "ZENFIN")?.emi_not_reported, zComb.active_loans, zComb.instalment_emi],
    [true, true, false, 1, 0]);
  await db.query("delete from customer_consents where application_id = $1", [bare]);
  await db.query("delete from bureau_reports where application_id = $1", [bare]);
  await db.query("delete from applications where id = $1", [bare]);
  t.equal("deleting the application clears its bureau detail",
    await one(`select (select count(*) from bureau_summary where application_id = $1)::int as s, (select count(*) from bureau_accounts where application_id = $1)::int as a,
                      (select count(*) from bureau_enquiries where application_id = $1)::int as e`, [bare]),
    { s: 0, a: 0, e: 0 });

  const noHit = (await one("select g from generate_series(1, 400) g where (fn_sim_bytes('nohit-' || g, 'c0'))[1] < 8 limit 1")).g;
  const nh = (await seedRun(`nohit-${noHit}`)).find((s) => s.bureau === "COMBINED");
  t.equal("no record on both bureaus leaves every engine field empty",
    [nh.no_hit, nh.bureau_count, nh.score, nh.monthly_obligation, nh.dpd_max_12m], [true, 2, null, null, null]);

  const shape = await one(`select
      100.0 * count(*) filter (where bureau = 'COMBINED' and no_hit) / count(*) filter (where bureau = 'COMBINED') as nohit,
      avg(score) filter (where bureau = 'CIBIL' and not no_hit) as cibil_mean,
      100.0 * count(*) filter (where bureau = 'COMBINED' and score_gap > 50) / nullif(count(*) filter (where bureau = 'COMBINED' and score_gap is not null), 0) as gap,
      (select 100 * percentile_cont(0.5) within group (order by monthly_obligation / 75000.0) from sim31 where bureau = 'COMBINED' and not no_hit) as share
    from sim31`);
  const [nohit, mean, gap, share] = [shape.nohit, shape.cibil_mean, shape.gap, shape.share].map(Number);
  t.equal("the simulation's shape",
    [nohit >= 1 && nohit <= 6, mean >= 712 && mean <= 738, gap >= 1 && gap <= 10, share >= 3 && share <= 25],
    [true, true, true, true]);

  const staffApp = (await one(`select a.application_id from applications a join bureau_reports b on b.application_id = a.id
                               where a.origin = 'STAFF' and b.bureau_name = 'CIBIL' order by a.created_at limit 1`)).application_id;
  await db.query("set role authenticated");
  await as(DEMO, "demo@t.in");
  await t.rejects("the demo login cannot read a real customer's bureau detail", () => db.query("select fn_staff_bureau_detail($1)", [app27.application_id]), /application not found/);
  const sample = (await one("select fn_staff_bureau_detail($1) as v", [staffApp])).v;
  t.equal("the demo login still sees sample applications", [sample.detail, sample.engine.bureau_name, sample.summaries.length], [false, "CIBIL", 0]);

  await as(OFFICER, "o@t.in");
  const d = (await one("select fn_staff_bureau_detail($1) as v", [app27.application_id])).v;
  t.equal("officers read both bureaus side by side",
    [d.detail, d.summaries.length, d.summaries[0].bureau, d.summaries[2].bureau, d.accounts.length > 0, d.accounts.every((a) => a.dpd.length === 24),
     Array.isArray(d.differences), Array.isArray(d.flags), d.engine.bureau_name, d.rules.revolving_rate],
    [true, 3, "CIBIL", "COMBINED", true, true, true, true, "CIBIL-SIMULATED", 0.05]);
  await t.rejects("internal bureau functions are closed to the website roles (pull)", () => db.query("select fn_bureau_pull_simulated($1, null)", [app27.id]), /permission denied/);
  await t.rejects("internal bureau functions are closed to the website roles (preview)", () => db.query("select fn_simulated_bureau($1)", [app27.customer_id]), /permission denied/);

  await as(CUST, "asha.r@example.com");
  await t.rejects("customers cannot call the detail function", () => db.query("select fn_staff_bureau_detail($1)", [app27.application_id]), /permission denied|no active cercit user/);

  const tables = ["bureau_lenders", "lender_aliases", "bureau_product_map", "bureau_summary", "bureau_accounts", "bureau_enquiries"];
  const direct = [];
  for (const [sub, email] of [[CUST, "asha.r@example.com"], [OFFICER, "o@t.in"]]) {
    for (const tb of tables) {
      await db.query("set role authenticated");
      await as(sub, email);
      try { await db.query(`select * from ${tb} limit 1`); direct.push("read"); } catch { direct.push("refused"); } finally { await operator(); }
    }
  }
  t.equal("nobody reads the bureau tables directly", direct, Array(12).fill("refused"));
  await operator();

  // Turning the 5% off: stored rows keep the switch they were worked out under, so they still
  // pass their check (and can be restored); anything worked out afterwards leaves the 5% out.
  {
    const cardOnly = [acct({ bureau: "CIBIL", lender_code: "AXIS", product_raw: "Credit Card", product: "CARD", revolving: true,
      credit_limit: 100000, outstanding: 60000, opened_on: "2022-03-01" }),
      acct({ bureau: "CIBIL", seq: 2, lender_code: "SBI", sanctioned: 200000, outstanding: 50000, emi: 6000 })];
    let flipped;
    await db.query("begin");
    try {
      await db.query("create or replace function fn_bureau_revolving_in_foir() returns boolean language sql immutable parallel safe set search_path = public as $$ select false $$");
      const kept = await one(`select count(*)::int as n, count(*) filter (where revolving_counted and monthly_obligation > instalment_emi)::int as with5
                              from bureau_summary where monthly_obligation is not null`);
      await db.query("update bureau_summary set computed_at = computed_at");
      await db.query("create temp table bs31 as select * from bureau_summary where application_id = $1 and bureau = 'COMBINED'", [app27.id]);
      await db.query("delete from bureau_summary where application_id = $1 and bureau = 'COMBINED'", [app27.id]);
      await db.query("insert into bureau_summary select * from bs31");
      const fresh = (await fixture([{ bureau: "CIBIL", no_hit: false, score: 760 }], cardOnly)).find((s) => s.bureau === "COMBINED");
      await db.query("select fn_bureau_combine($1)", [app27.id]);
      const redone = await one("select revolving_counted, monthly_obligation = instalment_emi as without5 from bureau_summary where application_id = $1 and bureau = 'COMBINED'", [app27.id]);
      flipped = [kept.n > 0, kept.with5 > 0, fresh.revolving_counted, fresh.revolving_obligation, fresh.monthly_obligation, redone];
    } catch (e) {
      flipped = ["error", e.message.split("\n")[0]];
    } finally {
      await db.query("rollback");
    }
    const back = (await fixture([{ bureau: "CIBIL", no_hit: false, score: 760 }], cardOnly)).find((s) => s.bureau === "COMBINED");
    t.equal("turning the 5% off keeps stored rows valid and leaves it out of new figures",
      [flipped, back.revolving_counted, back.monthly_obligation],
      [[true, true, false, 3000, 6000, { revolving_counted: false, without5: true }], true, 9000]);
  }

  // No record at either bureau: the engine runs (it used to stop on an unset rate row) and a person decides.
  {
    const nh = (await one(`insert into applications (application_id, customer_id, status, origin, declared_net_salary)
                           select 'T31-NOHIT-0001', customer_id, 'SUBMITTED', 'STAFF', 60000 from applications where origin = 'STAFF' order by created_at limit 1
                           returning id`)).id;
    await db.query(`insert into bureau_summary (application_id, bureau, report_ref, pulled_at, raw_key, grid_month, no_hit, score, computed_at)
                    values ($1, 'CIBIL', 'TEST-NH-1', now(), 'simulated:bureau-sim-v2', '2026-09-01', true, null, now()),
                           ($1, 'EXPERIAN', 'TEST-NH-2', now(), 'simulated:bureau-sim-v2', '2026-09-01', true, null, now())`, [nh]);
    const pulled = (await one("select fn_bureau_combine($1) as v", [nh])).v;
    let assessed;
    await t.ok("a no-hit application assesses without error", async () => {
      assessed = (await one("select fn_assess_application($1) as v", [nh])).v;
    });
    const after = await one(`select a.status, (select recommendation from recommendations where application_id = a.id order by generated_at desc limit 1) as rec,
                                    (select decision from credit_decisions where application_id = a.id and decided_by = 'SYSTEM' order by decided_at desc limit 1) as dec
                             from applications a where a.id = $1`, [nh]);
    t.equal("a no-hit application is referred to a person, never approved",
      [pulled.no_hit, assessed?.policy?.decision, assessed?.recommendation?.decision,
       (assessed?.recommendation?.risk_factors ?? []).some((f) => f.rule_id === "MISSING_DATA" && f.reason_code === "MISSING_DATA"),
       after.status, after.rec, after.dec],
      [true, "MAYBE", "MAYBE", true, "UNDER_REVIEW", "MAYBE", "MAYBE"]);
  }

  // 053 on a database that stopped at 052, twice.
  {
    const { readFileSync } = await import("node:fs");
    const { db: old } = await migratedDb({ upTo: 52 });
    const q1 = async (sql) => (await old.query(sql)).rows[0];
    // Two v1-style simulated reports (one with no record), as 048/052 wrote them.
    await old.query(`update bureau_reports set bureau_name = 'CIBIL-SIMULATED', report_raw_path = 'simulated',
                       score = case when id = (select min(id::text)::uuid from bureau_reports) then null else score end
                     where id in (select id from bureau_reports order by id limit 2)`);
    const cols = `id, application_id, customer_id, bureau_name, score, score_date, active_accounts, total_outstanding, total_monthly_emi, dpd_max_12m,
                  dpd_max_24m, dpd_30_count_24m, dpd_60_plus_flag, enquiry_count_90d, writeoff_count_5y, settled_count_5y, credit_utilization_pct,
                  oldest_account_months, report_raw_path, extracted_at, created_at`;
    const md5 = `select md5(string_agg(row(${cols})::text, '|' order by id)) as h, count(*)::int as n from bureau_reports`;
    const pre = await q1(md5);
    const sql053 = readFileSync(new URL("../../sql/053_bureau_detail.sql", import.meta.url), "utf8");
    await old.exec(sql053);
    await old.exec(sql053);
    const post = await q1(md5);
    const seeds = await q1("select (select count(*) from bureau_lenders)::int as l, (select count(*) from lender_aliases)::int as a, (select count(*) from bureau_product_map)::int as p");
    const flags = await q1(`select count(*) filter (where no_hit is not null)::int as flagged, count(*) filter (where report_raw_path = 'simulated')::int as v1,
                                   count(*) filter (where no_hit is distinct from (score is null) and report_raw_path = 'simulated')::int as wrong from bureau_reports`);
    t.equal("053 is safe to re-run on a 052 database", [post, seeds, flags], [pre, { l: 13, a: 38, p: 20 }, { flagged: 2, v1: 2, wrong: 0 }]);
    await old.close();
  }
  await db.query("drop table sim31");
  failures += t.report();
}

await db.close();
if (failures) {
  console.log(`\n${failures} SQL test(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll SQL tests passed");
}
