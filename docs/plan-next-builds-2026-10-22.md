# Plan: next builds (22 Oct 2026)

Sameer's decisions on 22 Oct: **yes to all** open items, **G5 (welcome-email password) parked**.

## Decisions recorded

| Item | Decision |
|---|---|
| Sample documents (L1 + L2) | Approved: the per-visitor "Make sample documents" design from 9 Oct |
| KYC-NAME rule | Feed it: score from the document name matcher, with Indian name variants; cross-document check uses the same matcher |
| The 5 bureau defaults | Keep the cautious options as built (CIBIL score; 5% of card balances in FOIR; cards as active accounts; guarantor late payments count; late payments at cancelled lenders count) |
| P2 Document checks rules | Signed off as built |
| G5 welcome-email users | Parked |

## Build order

Each step is committed on its own. AWS deploys and live SQL wait for Sameer's OK at the time.

1. **Aadhaar masking (G9, R1).** In `document_finalize`:
   - refuse an Aadhaar upload where no number was found and hidden (unless it is already a UIDAI masked Aadhaar, `XXXX XXXX 1234`), and delete every version of the upload;
   - check every page (up to 10; a longer file isn't an Aadhaar);
   - record the masker version and "original deleted" on the stored file (S3 metadata) and in the function log, never the number.
   Test: `test_finalize_rules.py`. Deploy: Sameer's OK.
2. **Compliance map (R5).** `docs/compliance-map.md`: each RBI area, what cercit does, status, source.
3. **KYC-NAME fed.** The engine's name rule reads the document name-match score; the cross-document check uses the same matcher (initials count, Indian variants). SQL + Lambda, with tests.
4. **CloudTrail (R4).** One trail, log file validation, its own bucket. AWS, Sameer's OK.
5. **Encryption key out of the database (R2).** Supabase Vault for the PII key. SQL, Sameer runs it.
6. **Tamper-evident audit log (R3).** Hash chain on `audit_events`, daily copy to S3 with Object Lock.
7. **AI model governance (R9).** Save the challenger's score on every decision; model inventory and a monthly comparison.
8. **Sample documents (L1 + L2).** Browser-made pack, fill-from-sample, demo banner.
9. **Browser-side Aadhaar masking (G10).** Phase 2.
