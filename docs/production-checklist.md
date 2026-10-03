# Production checklist: before real customers

What the demo has switched on, or made up, that a real lender's database must not keep. Started 3 Oct 2026 with the daily simulation (fix list G7); add to it as the demo grows.

## Remove before real use

| What | Why it is there | How to remove |
|---|---|---|
| **Daily simulation** (`sql/075`, job `cercit-simulation-daily`) | Makes 10 synthetic leads a day, disburses them, and makes their payments, so the demo's book keeps moving | `SELECT cron.unschedule('cercit-simulation-daily');` and `UPDATE simulation_settings SET simulation_enabled = false;` |
| **All synthetic data** (`sql/055`, `056`, `075`: SYN… cases, SYNL… loans, `@synthetic.invalid` emails, `5550` mobiles) | The demo's book | `SELECT fn_synthetic_purge();` |
| **Practice logins** (`sql/072`, `073`) | Visitors practise on synthetic cases | Suspend the three `cercit+practice.*@gmail.com` users; remove the `VITE_PRACTICE_PASSWORD` secret |
| **Public demo login** (`sql/042`) | Read-only visitor login | Suspend `cercit+demo@gmail.com`; remove the `VITE_DEMO_*` secrets |
| **Simulated checks**: bureau (053), income (054), employer checks (069, provider `SIMULATED`) | No live providers yet | Switch each to its live provider before deciding real cases |
| **Admin's waiver** (`role_conflict_waivers`, admin decide + user.manage) | Decision 0.3, build only | Delete the waiver row; give the admin role back its separate duties |

## Check before going live

- Every migration in `docs/migration-run-log.md` is ticked as run and checked.
- `SELECT jobname FROM cron.job;` shows no simulation job.
- `SELECT count(*) FROM applications WHERE origin = 'SYNTHETIC';` is 0.
