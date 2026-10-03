// H7: save the newest settings backup (taken weekly in the database by 079) to a file outside the database.
//
// Reads fn_settings_backup_latest() with the service key and writes
// backups/settings-<date>.json. The weekly GitHub job (.github/workflows/settings-backup.yml)
// runs this and keeps the file for 90 days as a downloadable artifact.
//
// Run:  SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-settings.mjs
// Restore: each key of "tables" is a table, each element one row (as written by to_jsonb).
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set: nothing exported");
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/rpc/fn_settings_backup_latest`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!res.ok) throw new Error(`backup read failed: ${res.status} ${await res.text()}`);
const backup = await res.json();
if (!backup) throw new Error("no backup in the database yet: run SELECT fn_settings_backup_take('MANUAL'); first");

const ageDays = (Date.now() - new Date(backup.taken_at).getTime()) / 86400000;
if (ageDays > 8) console.warn(`warning: the newest backup is ${Math.round(ageDays)} days old (is the weekly job running?)`);

mkdirSync("backups", { recursive: true });
const file = `backups/settings-${backup.taken_at.slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(backup, null, 1));
console.log(`${file}: ${Object.keys(backup.tables).length} tables, ${backup.rows} rows, taken ${backup.taken_at}`);
