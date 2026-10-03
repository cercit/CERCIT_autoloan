# Customer side: audit, 3 Oct 2026 (fix list H2)

Same check as the staff-side audit of 2 Oct (`rights-and-visibility-audit-2026-10-02.md`), on the customer pages: onboarding steps 1–4, documents, the tracking page and My loan (offer, agreement, mandate). Findings are numbered **K1–K6**; the ones marked fixed were fixed in the H2 commit.

**Summary:** the customer side is sound on rights and data. Every read and write goes through a `fn_customer_*` database function that only ever returns the signed-in customer's own application; no customer page reads a table directly, and no customer page shows sample data outside sample mode. The problems were in how failures were shown.

## What each page reads

| Page | Reads / writes through | Own data only? | Sample data on the live site? |
|---|---|---|---|
| Step 1: start (name, email, mobile, sign-in link) | `fn_customer_start` | yes (creates the customer's own draft) | no |
| Step 2: car | `fn_customer_current`, `fn_customer_save_vehicle` | yes | no (the list of makes is reference data, not a case) |
| Step 3: documents | `fn_customer_current`, `fn_document_upload_types`, `fn_customer_register_document`, storage under the customer's own folder | yes | no |
| Step 4: details and consent | `fn_customer_details`, `fn_customer_save_details`, `fn_consent_text`, `fn_customer_submit` | yes | no |
| Tracking page | `fn_customer_track` | yes | only in sample mode, with a "Demo mode" note |
| My loan (offer, agreement, mandate, documents) | `fn_customer_after_approval` and the after-approval actions | yes | no |

## Problems found

| # | Problem | Where | Severity | Status |
|---|---|---|---|---|
| K1 | **Steps 2–4 sent the customer back to sign in on any error**, including a network drop or a database error, so a signed-in customer could be bounced to the sign-in page with no reason given. Now only a sign-in problem (no session, link not confirmed) goes to sign in; any other error is shown on the page with a Try again button | `onboarding.car.tsx`, `onboarding.details.tsx`, `onboarding.documents.tsx`, `isSignInError` in `customer-api.ts` | Medium | Fixed |
| K2 | **The upload boxes failed silently**: if the list of document types couldn't be read, step 3, the tracking page and My loan showed no upload boxes and no message. Now the error is shown | `onboarding.documents.tsx`, `application-status.tsx`, `my-loan.tsx` | Medium | Fixed |
| K3 | **Submit did nothing if the consent wording couldn't be loaded**: the button stayed disabled with no reason. Now the page says the consent wording could not be loaded and to try again | `onboarding.details.tsx` | Medium | Fixed |
| K4 | The tracking page's sample application shows only in sample mode and says so | `application-status.tsx` | — | OK as is |
| K5 | Customer-side errors from the database are passed through as written (e.g. "upload the quotation first"); they are already plain words | `customer-api.ts` | — | OK as is |
| K6 | Phone layout of these pages is checked under H4 | — | — | See H4 |

## Not checked here

- The sign-in email itself (Supabase sends it; its wording is set in Supabase, not in this code).
- Real customers' data: the 4 real customer-journey applications were not opened; this audit is from the code and the local test database.
