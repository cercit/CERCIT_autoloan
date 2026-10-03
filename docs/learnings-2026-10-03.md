# What we learned, 3 Oct 2026

This day covered fix list batch 1, a cloud session that built batches 2–9, migrations 060–080 going live, the FAQs and founders section, and the launch video. The earlier lessons (1–20) are in `learnings-2026-09-27-to-10-02.md`; this file continues the numbering.

## How we work

**21. A big batch of work can run in a cloud session, if the brief travels with it.**
The cloud session only sees the git repository: no Vault, no memory notes, no CLAUDE.md. So we wrote `docs/cloud-session-brief.md` into the repo. It covers:
- the 4-line replies;
- one commit per item;
- tests first;
- never touch the live database;
- no AWS, no sub-agents;
- the open decisions with their defaults.

It built 31 items in one run, and everything passed review.
*Now:* any long cloud job starts from a brief in the repo.

**22. Keep the live site safe while a build runs: branch, collect the SQL, merge last.**
The cloud work went on a branch (`fix-list-build`), pushed after every item so nothing could be lost. All 20 migrations were combined into one `RUN-ME-fix-list.sql`, and the pull request stayed unmerged until the SQL had run. Merging site code that calls database functions that don't exist yet would have broken the live pages.
*Now:* SQL first, verified live, then merge.

**23. Review another session's work with the same tests, in a separate copy.**
Before Sameer ran anything, the branch was checked out separately and checked:
- 57 SQL test sections;
- type check;
- build;
- that the combined SQL file contained every migration;
- a search for anything risky (deletes, drops, hard-coded passwords).

One test failed only because Windows line endings broke a regex in the test itself; it passed with normal endings.
*Now:* tell a real failure from a test-method failure (see lesson 16) before raising the alarm.

**24. A pull request opened as a draft has to be marked ready before it can merge.** Check the PR state, not just the checks.

**25. Give the user one place for tasks.** `TASKS.md` (Active / Waiting On / Someday / Done) in the Claude folder is now the single task list, with a visual board in `dashboard.html`. Everything open after 3 Oct is there.

## Technical lessons

**26. Check read rights before building a page that reads a table.**
Signed-in staff can't read `applications`, `customers`, `audit_events` or `obligation_details` directly (the privacy rules keep them behind functions). Pages that read those tables directly showed nothing, spun forever, or fell back to sample data:
- Application Review;
- the dashboard figures;
- the Audit Log;
- the old badge.

*Now:* a page reads through a `SECURITY DEFINER` function that checks rights and honours `fn_sees_real_customers()`. Quick test: `has_table_privilege('authenticated', '<table>', 'SELECT')`. Pattern: `sql/060_staff_frame_summary.sql` + `src/lib/shell-api.ts`.

**27. Read-only live checks through the Supabase connector.** To see what a function returns for a given login without changing anything:
1. Set the login in a `DO` block.
2. Call the function.
3. `raise exception` with the result; the error message carries the answer.
4. Nothing is written, because the block rolls back.

**28. Lambda has a 250 MB limit, including layers.** OpenCV took the finalise function to 246 MB, so the QR finder uses zxing-cpp instead (1 MB, no numpy), and the function is 47 MB. Measure the built package before deploying.

**29. Don't run a formatter over whole files.** Prettier turned a 10-line change into 300 changed lines. Edit only the lines that change.

**30. In the dev server on OneDrive, new Tailwind arbitrary classes may not appear until a restart.** A fresh build picks them up; inline styles avoid the question.

## Video (Hyperframes)

**31. Video for phones needs big text.**
v1 used 20–32 px body text and was unreadable on a phone. v2 uses:
- headlines of 100 px or more;
- sub-lines of about 46 px, a few words each;
- labels of at least 26–28 px.

Fewer words per scene beats smaller text.

**32. The music bed was too quiet, not just the wrong track.** At volume 0.32 the mix averaged −27 dB. v2 runs at 0.5 (the allowed maximum) with the punchier loop played twice, about 5 dB louder. A volume fade goes in the `data-automation` lane as valid JSON (HTML-escaped in the attribute), not in a script.

**33. Look at a still from every scene before rendering.** The contact sheet caught three layout problems the automatic check missed: a squeezed title, the stamp covering a row, tiny text. A long render takes 4–7 minutes, so fix before rendering.

## Product and launch

**34. Before inviting the public, stop real personal data from coming in.**
The customer journey is open, so a LinkedIn visitor could upload their real Aadhaar. Two steps come before posting:
- a sample document pack (made-up, watermarked, invalid numbers);
- a "use the samples, not your own" banner.

**35. A tester needs somewhere to send feedback.** Asking people to "tell us what to fix" without a feedback form loses most of the answers.

**36. Credit everyone honestly.** The founders section names Claude as chief architect and lists the wider team (Lovable, Google Stitch, ChatGPT, Gemini, Microsoft Copilot, Hermes, Inkling, MiniMax M3, DeepSeek, Qwen), with what each did and the note that none of them saw customer data.

## Where things are (3 Oct)

| What | Where |
|---|---|
| Task list | `Desktop/Claude/TASKS.md` (board: `dashboard.html`) |
| Fix list, incl. pre-launch L1–L6 | `docs/fix-list.md` |
| Live migrations | `docs/migration-run-log.md` (001–080 run; 075/079 schedules on since 3 Oct) |
| How cercit works | `behind-the-scenes/how-it-works/` (flows, schema, functions, where things live) |
| Launch video | `AI-Credit-Underwriter/brag-output-2026-10-03-150942/brag-v2.mp4` (1:53) + `brag.mp4` (2:42) |
| Cloud session brief | `docs/cloud-session-brief.md` |
