# What we learned, 4–9 Oct 2026

This stretch covered the outside audit, the credit team's logins and rights, the Admin's undo, sign-out feedback, the audit fixes, a Tech deck and the third launch video. It continues the numbering from `learnings-2026-10-03.md` (1–36).

## Checking before fixing

**37. Verify an outside audit finding by finding.**
About a third of the 4 Oct audit was wrong or already fixed. Examples:
- **search_path:** the report said security-definer functions lacked a `search_path`; a live check showed all 197 had one.
- **Wrong direction:** one real finding (the browser invents income tax) had its effect backwards. It made FOIR look worse, not better.

*Now:* every finding gets a code or live check before it reaches the fix list (`docs/audit-review-2026-10-04.md`).

**38. Look at live data before changing how decisions are made.**
The first fix for "missing data counts as a pass" would have sent almost every case to a person. The name-match rule (KYC-NAME) is skipped on 1,740 of 1,748 cases, because nothing fills its score. A quick count of skipped rules on the live database caught it, and 088 was narrowed to missing bank or income data, the actual gap.

*Now:* before changing the engine, count how many live cases the change would affect (088 affects 188 cases' future runs, and no already-approved case).

**39. A changed rule can quietly break old tests.**
082 and 083 (merging roles; the Head proposes, the Admin approves) broke seven older test sections, written for the old team. Nobody noticed until a new test was added two days later.

*Now:* when roles or rights change, run the full SQL suite in the same step and update the tests that encode the old set-up.

## Building safely

**40. Patch a live function in place when only a few lines change.**
088 and 089 read the live function's text, make small checked replacements, and run it again. Everything else stays exactly as it is, and the migration stops loudly if the text it expects has moved.

**41. Patch scripts go in files, not shell heredocs.**
This rule already existed and was broken again on 9 Oct: a heredoc patch failed halfway. Writing the script as a file and running it worked first time.

**42. Secrets added after a deploy need a fresh deploy.**
The team-login passwords were added three minutes after the last deploy, so the buttons didn't appear. Comparing the secret timestamps with the deploy time found it, and re-running the deploy fixed it.

**43. Public logins with real rights need a way back.**
The owner chose to put real Head, Manager and Officer logins on the sign-in page, against the advice to use the guarded practice logins. The safe way to do what he asked:
- **Passwords:** taken from build secrets, never printed on the page.
- **Undo:** a journal of every non-case change the three logins make, with one "Undo team changes" button for the Admin.
- **Admin:** stays private.

**44. Nobody approves their own change, so who writes and who approves must be different roles.**
Taking the Head's approve rights away without taking the Admin's write rights would have left the Admin's own changes, and all role changes, impossible to approve. The working split: the Head proposes rules, rates, models and roles; only the Admin approves.

## Product

**45. Ask where people got lost, not just whether they did.**
The first feedback form asked "could you find things?" A "no" told us nothing. The second asks "what couldn't you find?" after Mostly or No, and "which best describes you?", so a credit manager's answer can be weighed differently from a student's.

**46. Contact details only with consent, and say what they're for.**
The form takes a name and an email or LinkedIn link only with a tick: "used only for that, and deleted if I ask". The database refuses contact details without the tick.

**47. Cut the scenes that tell the wrong story.**
v3 of the video dropped the rate and EMI screens, because cercit is a product, not a lender selling loans. It also moved "Try it. Break it." before the credits, so the ask comes while people are still watching.

**48. One engine on the screen.**
The case screen had shown the database's recommendation next to a second, different calculation done in the browser. Now a real case shows only what the database decided, and the browser engine is kept for the sample cases.

## Where things are (9 Oct)

| What | Where |
|---|---|
| Audit report and its check | `docs/audits/cercit-audit-report-2026-10-04.md`, `docs/audit-review-2026-10-04.md` |
| Migrations | `docs/migration-run-log.md`: 001–087 live, 088 and 089 to run |
| Team logins and undo | `sql/082`–`085`, sign-in page, Users page |
| Sign-out feedback | `sql/086`, `sql/087`, `src/components/feedback-dialog.tsx`, Users page |
| Tech deck | `public/decks/tech.html`, `cercit-tech-deck.pdf`, made with `scripts/deck-pdf.mjs` |
| Video v3 and post | `AI-Credit-Underwriter/brag-output-2026-10-03-150942/brag-v3.mp4`, `linkedin-post-v3.txt` |
| Open decision | KYC-NAME name-match rule: feed it or retire it (`docs/fix-list.md`) |
