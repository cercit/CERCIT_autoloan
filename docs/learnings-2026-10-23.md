# What we learned, 9–23 Oct 2026

This stretch covered market sizing, an Aadhaar and RBI compliance check, the audit trail and encryption, the name matcher, model governance, sample documents, and a Kaggle notebook. It continues the numbering from `learnings-2026-10-09.md` (37–48).

## Checking before trusting

**49. Check outside research against the original rules.**
A deep-research report on Aadhaar masking was right in its main answer, but:
- its citations were broken markers nobody could follow;
- it never mentioned the QR code, which carries the full number on older cards;
- it cited court cases that couldn't be checked.

*Now:* every claim gets a primary source, or a mark saying it is unverified, before anyone quotes it.

**50. A log that nobody reads isn't a control.**
The audit log had recorded an Aadhaar upload kept unmasked (28 Sep, `masked = false`). Nothing flagged it.

*Now:* a file that can't be masked is refused (G9), not just logged.

**51. Check every way into a system, not just the main one.**
Customer uploads went through masking, but staff uploads went straight to storage and skipped it. This was found only by reading the upload path end to end.

**52. Probe each piece of a combined SQL run.**
"240 lines done" meant only 093 had run; 091 and 092 hadn't. A live probe of each migration caught it.

*Now:* never assume a RUN-ME ran in full.

## Building safely

**53. One rule, two copies, drift.**
The name match lived in the database (initials counted, bar 0.80) and in an AWS function (no initials, bar 0.85). The same customer passed one check and failed the other.

*Now:* one definition, ported line for line, with the same test cases in both the SQL and the Python tests.

**54. Before removing a function, search for every caller.**
Replacing the old name matcher would have crashed the employer check, which still called it. A search found it before deploy.

**55. Test generated documents with the real reader.**
The sample pack read perfectly except one thing: a capital I in a mixed-case name came back as a lower-case l ("Iyer" became "lyer"). That led to 094: the matcher now treats I/l, 0/o and 1/i as the same letter. Real documents would have hit this sooner or later.

**56. A tamper check has to tell legitimate deletions from tampering.**
The synthetic purge and erasure requests delete audit events on purpose. So the hash chain lives in its own add-only table. A purge shows as "removed"; an edit shows as "altered" or "broken".

**57. Never delete the only copy of a key.**
The PII key moved into Vault in two steps. Step 1 copies it, checks it is identical and switches over. Step 2, deleting the old copy, waits until the key is saved outside Supabase.

**58. Unattended deploys must not prompt.**
`sam deploy` stopped at a hidden "Deploy? [y/N]" and aborted. `deploy.ps1` now passes `--no-confirm-changeset`.

**59. Holding a deploy means not pushing.**
Any push to main redeploys the website. To keep work pending overnight, commit locally and push only after the SQL and AWS steps are approved.

## Product and data

**60. Pick the metric before training, from how the number is used.**
The challenger had the lower AUC (0.741 against 0.754), but its percentages were closer to the truth. The grades are cut on those percentages, so calibration decided it.

*Also:* PR-AUC favoured the challenger, and Kaggle's library versions moved the numbers slightly (0.749 / 0.740). The notebook quotes what readers see and says why.

**61. Disclose synthetic labels up front.**
The outcomes come from a formula. Saying so first makes it method, not a hidden flaw.

**62. Market sizing: keep sourced figures and guesses apart.**
- The salaried share was worked out from a lender table in an HSIE report (59%).
- The Rs 250 fee was tested against cercit's own running cost: about Rs 80 per file, plus Rs 99 lakh a year fixed.
- At 4 lenders the margin is thin (13%), and the fee is above the officer's own cost per file, so it has to be sold on speed, fraud and losses.

**63. "RBI compliant" can't be claimed by software.**
Compliance belongs to the regulated lender. The honest line is "designed with RBI's rules in mind", backed by a compliance map that shows the gaps (`docs/compliance-map.md`).

## Where things are (23 Oct)

| What | Where |
|---|---|
| Market sizing and cost per file | `docs/market-sizing-2026-10-09.md` |
| Compliance map | `docs/compliance-map.md` |
| Model governance and the live champion/challenger plan | `docs/model-governance.md`, Risk models page |
| Migrations | `docs/migration-run-log.md`: 001–094 live |
| Plan and decisions of 22 Oct | `docs/plan-next-builds-2026-10-22.md` |
| Sample documents | `src/lib/sample-pack.ts` |
| Kaggle | kaggle.com/code/cercit/why-we-picked-the-credit-model-with-the-lower-auc |
| Open | 091b (delete the old key copy, after saving it); model validation and drift check need real data; G10 full browser masking (Phase 2); R6–R8 need partners |
