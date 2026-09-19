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

await db.close();
if (failures) {
  console.log(`\n${failures} SQL test(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll SQL tests passed");
}
