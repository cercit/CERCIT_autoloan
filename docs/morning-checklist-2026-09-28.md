# Morning checklist, 28 Sep 2026

## Done last night

- Migrations 044 and 045 ran on Supabase.
- The AWS deploy ran twice. The second run fixed the shared-code packing (commit 2de5d87). The upload, finalise and policy services all start and correctly refuse anyone who isn't signed in.
- Built overnight (commit after 2de5d87): step 4, submit with an email code, the tracking page, the returning-customer continue link, and face match. Tested with fake data in a real browser, end to end, with no errors.

## Your steps, in this order

1. **Supabase: run migration 046**
   - File: `Lov_cercit\sql\046_customer_details_submit.sql` (Supabase → SQL Editor → paste → Run).
   - Check: `SELECT count(*) FILTER (WHERE mobile_hash IS NULL) FROM customers;` should return 0.

1b. **Supabase: run migration 047** (right after 046)
   - File: `Lov_cercit\sql\047_staff_customer_cases.sql`. It adds the officer's queue and case view, the officer's actions, and customer re-uploads after submitting.
   - Check: `SELECT origin, status, count(*) FROM applications GROUP BY 1, 2;` shows your test applications with origin CUSTOMER.

2. **Supabase: the "Magic Link" email template** (Authentication → Emails → Magic Link)
   - The continue link uses this template. Make sure the body has a link as well as the code. For example:
     `<p><a href="{{ .ConfirmationURL }}">Continue your cercit application</a></p><p>Or enter this code: {{ .Token }}</p>`
   - Then open Authentication → URL Configuration → Redirect URLs. Check that `https://cercit.github.io/CERCIT_autoloan/**` is listed. If it isn't, add it.

3. **AWS deploy** (PowerShell):
   ```
   powershell -ExecutionPolicy Bypass -File "C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit\aws\deploy.ps1"
   ```
   What it ships:
   - **New:** `cercit-customer-resume` (POST /resume). It emails the continue link when a mobile number already has an application in progress.
   - **Changed:** `cercit-document-finalize`. After a live photo, PAN front or Aadhaar front is uploaded, it compares the faces (Amazon Rekognition).
   - **Changed:** `cercit-get-extractions`. A customer can now read back what was found in their own documents, limited to the fields step 4 uses. This is what pre-fills step 4.
   - **Changed:** the shared code, which gains the continue-link and face-match helpers.
   - **New:** `cercit-document-url` (POST /document-url). It lets staff open a customer's file for 5 minutes.
   - Cost: Rekognition's free tier is 5,000 face comparisons a month for the first 12 months. Each upload uses 1–2.

4. **Test on your phone:** start at https://cercit.github.io/CERCIT_autoloan/login?as=customer and work through:
   1. Take the live photo, then upload PAN and Aadhaar (try the e-Aadhaar PDF with its password).
   2. Upload a locked salary slip with its password, Form 16, and the bank statement.
   3. Step 4: check the pre-filled fields, correct anything wrong, and confirm all three parts.
   4. Tick the bureau consent, take the emailed code, and submit. You should land on the tracking page.
   5. Sign out, start again with the same mobile number, and check that the "you already started" message appears and the email arrives.
   6. As staff (your admin login): open **Customer applications** in the left menu, then open Asha's (your) case. Work through:
      - Open a file.
      - Accept three documents.
      - Ask again for one, giving a reason. The customer's tracking page shows the reason and an upload box.
      - Re-upload from the phone, then accept it.
      - Click "Documents OK", then "Approve in principle".
      - Upload the quotation as the customer, then "Move to final approval", then "Approve".
      - After each step, check the customer's tracking page.

## Open items added to the reconcile list (Vault/Policies/14-Build-Backlog.md)

- **R15:** decided. The customer types the password; it's used once and never stored.
- **R16:** the continue link shows a masked email. While the mobile OTP is simulated, anyone could check whether a number has an application in progress. OK for the demo; revisit when real SMS arrives.
- **R17:** face-match bands (90+ match, 70–90 review, below 70 mismatch) are provisional. Decide whether a mismatch blocks submit or only flags it.
- **R18:** the QR code on older Aadhaar cards still carries the full number. Only the printed digits are masked so far.
- **R19:** the PDF library is licensed AGPL. Fine for this build; commercial use needs a licence or a replacement.
- **R20:** the document readers' write to the `document_extractions` table fails because the columns don't match. Pre-fill and the staff screen read the readers' S3 files instead. The writer needs fixing.
- **R21:** customer applications have no bureau pull yet, so the policy engine can't recommend. The officer's decision is recorded without a recommendation. The shared decision path is used once a recommendation exists.
- **R22:** the older **Applications** list also shows customer applications, with blanks (no vehicle row, drafts show as "New"). Decide whether to hide them there, now that Customer applications has its own queue.
