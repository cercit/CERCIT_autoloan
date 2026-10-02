// Dev aid: portfolio JSON from a local synthetic book, for checking the page without a live login.
import { writeFileSync } from "node:fs";
import { migratedDb } from "../../tests/sql/harness.mjs";
const { db } = await migratedDb();
const op = () => db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false)");
await op();
for (let b = 1; b <= 3; b++) await db.query("select fn_synthetic_generate($1, 500)", [b]);
for (let i = 0; i < 5; i++) await db.query("select fn_synthetic_disburse(1000)");
const ADMIN = "abababab-0000-0000-0000-0000000000ab";
await db.query("insert into users (email, full_name, role, auth_user_id) values ('adm@t.in','Admin','admin',$1)", [ADMIN]);
await db.query("set role authenticated");
await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [ADMIN, JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
const v = (await db.query("select fn_staff_loan_portfolio() as v")).rows[0].v;
writeFileSync(process.argv[2], JSON.stringify(v));
console.log(JSON.stringify(v.totals), JSON.stringify(v.buckets), JSON.stringify(v.by_score_band));
await db.close();
