# Morning checklist, 28 Sep 2026

Pushed last night: commit 38d4cac (live photo first, PDF passwords, Aadhaar masking, DigiLocker PDFs, ITR).
The website works before and after these steps. Passwords and Aadhaar masking switch on once steps 1 and 2 are done.

## Pending, do in this order

1. **Supabase: run migration 045**
   - File: `Lov_cercit\sql\045_document_capture.sql` (Supabase, then SQL Editor, paste, Run)
   - Check: `SELECT code, required, back_required, multi_file, ask_password FROM document_types ORDER BY sort_order;` should show 10 rows, with LIVE_PHOTO first and ITR included.

2. **AWS deploy** (one command in PowerShell):
   ```
   powershell -ExecutionPolicy Bypass -File "C:\Users\samsm\OneDrive\Desktop\Claude\PM Projects\AI-Credit-Underwriter\Lov_cercit\aws\deploy.ps1"
   ```
   What it ships:
   - **New:** `cercit-document-finalize`, which opens locked PDFs with the password, masks Aadhaar and registers the file. It adds the `POST /finalize` address.
   - **Changed:** `cercit-presigned-url`. Customers now upload into `incoming/` first.
   - **Changed:** `cercit-kyc-extractor`. It now tells PAN from Aadhaar by the new file names.
   - **Changed:** the S3 bucket. Anything left in `incoming/` is deleted after 1 day.

   First deploy note: the new service downloads a PDF library of about 20 MB, so the build takes a few minutes longer. If you see "Access is denied" from OneDrive, pause OneDrive sync and run it again.

3. **Test on your phone:** go to https://cercit.github.io/CERCIT_autoloan/login?as=customer, then:
   - take the live photo
   - upload a PAN card photo
   - upload the e-Aadhaar PDF with its password
   - upload a locked salary slip

4. **Migration 046 (step 4):** run it if it's in the folder by morning. The step 4 notes are at the bottom of this file.

## Step 4 notes
(filled in overnight)
