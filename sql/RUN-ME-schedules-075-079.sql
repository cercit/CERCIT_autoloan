-- RUN-ME: schedules for 075 (daily simulation) and 079 (weekly settings backup)
-- The functions are already live (fix list run, 3 Oct). This only switches on
-- pg_cron (if the dashboard toggle hasn't taken) and creates the two jobs.
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 075: daily simulation, 06:00 India time (00:30 UTC)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cercit-simulation-daily';
SELECT cron.schedule('cercit-simulation-daily', '30 0 * * *', 'SELECT fn_sim_daily()');

-- 079: settings backup, Sundays 01:00 India time (19:30 UTC Saturday)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cercit-settings-backup-weekly';
SELECT cron.schedule('cercit-settings-backup-weekly', '30 19 * * 6', 'SELECT fn_settings_backup_take(''WEEKLY'')');

-- Result: should show 2 rows
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname LIKE 'cercit-%' ORDER BY jobname;
