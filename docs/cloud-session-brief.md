# Brief for a cloud session: working through the fix list

Written 3 Oct 2026. A cloud session sees only this repository, not Sameer's laptop notes, so everything it needs is here.

## The job

Work through `docs/fix-list.md` in the order in its **Suggested order** section, starting after the **Done** table. Batch 1 is done.

## Who you're working for

Sameer: a product manager, not a developer. He reviews outcomes, not code.

- **Status replies:** always 4 short lines in plain words: **What it is / What I've done / What you have to do / What next.** No jargon.
- **No AI tells:** no "delve", "crucial", "robust" or "seamless"; no "it's not just X, it's Y"; no filler summaries.

## Rules

1. **Work on the branch `fix-list-build`, never on `main`.** `main` is the live site, and its pages would break if they called database functions Sameer hasn't run yet.
   - Commit after every item (one fix-list item = one commit) and push the branch, so a usage limit loses nothing.
   - Commit messages name the item (e.g. `fix(C5): …`) and end with the `Co-Authored-By` line.
   - At the very end, open a pull request from `fix-list-build` to `main`, but **don't merge it**. Sameer runs the SQL first, then it's merged.
2. **Never touch the live database.** Database changes go in a new `sql/NNN_name.sql` (next number after the highest in `sql/`). Each must be safe to re-run, with a header saying what it does and the run order. Add a row to `docs/migration-run-log.md` marked "☐ not yet run". Sameer runs SQL himself.
3. **Test every SQL change first.** Add a section to `tests/sql/run.mjs` and run `node tests/sql/run.mjs`. It loads every migration into a local Postgres (PGlite). All sections must pass before a push.
4. **Check the site code:** `npx tsc --noEmit -p .` (no new errors in files you touched) and `npx vite build --config vite.spa.config.ts`.
5. **Don't run prettier on whole files.** It reformats hundreds of unrelated lines. Keep diffs to the lines you change.
6. **Signed-in staff can't read most tables directly** (privacy rules). Applications, customers, audit events and obligations are all behind `SECURITY DEFINER` functions. That's why C5, C10 and the old badge failed. New screens read through a function that:
   - checks `fn_require_any_permission(...)`;
   - honours `fn_sees_real_customers()`, so the public demo login gets synthetic and staff cases only, never real customers.
7. **Real people's data:** the 4 customer-journey applications (origin `CUSTOMER`) are real people, so never print their details. Synthetic data is fine: origin `SYNTHETIC`, IDs `SYN…`, emails ending `@synthetic.invalid`.
8. **No sample data passed off as real.** Sample/mock data appears only in sample mode (`isDemoMode()` or no Supabase). On an error, show the error.
9. **No AWS changes.** AWS needs Sameer's credentials and his OK for each deploy. Skip **G5**, **H5** and the AWS part of **H6**, and say so.
10. **Don't spawn sub-agents or parallel agents.** Work through items yourself, one at a time.
11. **Ask Sameer only when a decision changes the build.** These are already open:
    - **G1:** reset of credit policy through approval, or the emergency route?
    - **G5:** temporary password, or a password in the email?
    - **B2:** should officers see unassigned cases?
    - **B5:** limits by amount, as a policy call?

    For everything else, pick the sensible default, state it in the commit and the reply, and carry on.
12. **Keep `docs/fix-list.md` current:** add each finished item to the **Done** table with its commit and whether SQL is waiting.

## Can't do from the cloud (leave for Sameer and the laptop)

- running SQL on Supabase, or checking it there;
- AWS deploys;
- signing in to the live site;
- putting SQL on his clipboard.

**At the very end (not per batch):**
- put every new migration, in order, into one file, `sql/RUN-ME-fix-list.sql`, with a header listing what it contains and a check query for each part;
- list the same files in your final reply;
- each `sql/NNN` file still stays on its own as well.

## Key places

| What | Where |
|---|---|
| Fix list (the work) | `docs/fix-list.md` |
| Audit behind items A–C | `docs/rights-and-visibility-audit-2026-10-02.md` |
| What's live, migration by migration | `docs/migration-run-log.md` |
| Recent lessons | `docs/learnings-2026-09-27-to-10-02.md` |
| Database migrations | `sql/` (001–060) |
| SQL tests | `tests/sql/run.mjs`, `tests/sql/harness.mjs` |
| Website | `src/routes/` (pages), `src/lib/` (data calls), `src/components/app-shell.tsx` (menu and top bar) |
| Example of the right pattern | `sql/060_staff_frame_summary.sql` + `src/lib/shell-api.ts` |
