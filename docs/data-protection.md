# Data protection: erasing a customer's data, and how long data is kept

Fix list H6 (database part, `sql/080_data_erasure.sql`). Written 3 Oct 2026.

## The rules this follows

- **DPDP Act 2023**: a customer may ask for their personal data to be erased; data is not kept once its purpose is served, unless a law requires it.
- **RBI KYC Master Direction and the PMLA rules**: a borrower's records are kept for **5 years after the loan ends**. So a customer with a live loan, or a loan closed less than 5 years ago, can't be erased yet; the check says from when it is possible.
- **No loan made** (rejected, withdrawn, or a draft never sent): kept **180 days** after the last activity, then listed for erasure. *This 180 days is a default to confirm* (setting `no_loan_retention_days` in `data_protection_settings`, 30 to 3,650).

## Erasing a customer, on request

Everything runs in the Supabase SQL editor. No step shows the customer's name, PAN, mobile or address: the functions return ids and counts only.

```sql
-- 1. find them (ids only)
SELECT fn_erasure_find('their@email');

-- 2. what would go, and whether the law says keep it
SELECT fn_erasure_check('<customer id>');
--   "erasable": false lists why, e.g. an open application (decide or reject it first)
--   or a loan inside the retention period (and from when erasure is possible)

-- 3. record the request (EMAIL, PHONE, LETTER, IN_PERSON, RETENTION or OTHER)
SELECT fn_erasure_record('<customer id>', 'EMAIL', 'asked on 3 Oct');

-- 4. erase (can't be undone), or refuse with a reason
SELECT fn_erasure_execute('<request id>', 'ERASE');
SELECT fn_erasure_refuse('<request id>', 'loan still live');

-- 5. delete the stored files, then mark them done
SELECT * FROM fn_erasure_storage_queue();
SELECT fn_erasure_storage_done(ARRAY['<storage key>', '<storage key>']);
```

**Step 5 by hand, for now:** open the S3 bucket (AWS console → S3 → the documents bucket), delete each `storage_key` the queue lists (and any Supabase storage copy), then mark them done. Doing this automatically is the AWS part of H6, not built yet.

### What erasure does

| | |
|---|---|
| **Deleted** | Documents (files queued for deletion from storage), what the readers read, face matches, document check results, bank transactions, bank month summaries, salary slips, Form 16, bureau accounts and enquiries, obligations, the step-4 groups, addresses |
| **Blanked** | The customer's name, email, PAN, mobile, Aadhaar digits, date of birth, address, employer and the rest of the customer row (the row stays, as "Erased customer"); the name on the quotation and the dealer's contact; the agreement's signer, snapshot and browser; the mandate's account holder, account number, IFSC and UMRN; bank account details; the raw bureau report link; the browser line on consents; the sign-in account (deleted, so they can't sign in again) |
| **Kept** | The applications, recommendations, decisions, policy results, loan accounts and payments, the proof of consent (its hash and date) and the audit log: the record of what was decided and why, now about an anonymous customer |

One audit entry (`PERSONAL_DATA_ERASED`) records the request and the counts, nothing personal.

## Data past the retention period

```sql
SELECT * FROM fn_retention_due();   -- customer ids, the reason, and since when
```

Nothing is erased by itself: for each customer listed, record a request with `received_via = 'RETENTION'` and erase as above. A good habit: run it on the first of each month.

## Sameer's test documents (to-do item 7)

The 4 customer-journey applications are real people's data, so they are handled like any request:

1. `SELECT fn_erasure_find('<the email used for each test>');` for each test sign-up.
2. `SELECT fn_erasure_check(...)`: an application still open must first be rejected on the case screen ("test application").
3. Record, erase, then delete the queued files from S3 and mark them done.

## Not done yet

- Deleting the files from S3 automatically (the AWS part of H6).
- A screen for requests; for now this is SQL-editor only, which suits how rare requests are.
- Old audit entries are kept as written; none should hold personal data, but this wasn't checked entry by entry.
