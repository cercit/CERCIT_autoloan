# B3 — Document Pipeline Deploy (SAM / Textract Lambdas)

Status: INTERRUPTED in subagent B3; produced manually in hermes2.

## Source references
- `docs/week1_document_pipeline.md` — pipeline design (Textract, OCR, cross-check).
- `aws/` folder — SAM template (`template.yaml`), Lambda functions (`salary-slip`, `form-16`, `kyc`, `cross-validator`, `presigned-url`, `get-extractions`).
- `docs/application_flow.md` — upload step in customer flow.
- `Lov_cercit/src/lib/supabase.ts` + `.env` — Supabase connection variables.

## What must be done (manual — Claude)
1. Ensure `aws/template.yaml` is valid SAM definition.
2. Build Lambda packages (`sam build`).
3. Deploy: `sam deploy --stack-name cercit-pipeline --region ap-south-1 --capabilities CAPABILITY_IAM`.
4. Configure Lambda environment variables in AWS console or `.env` (`AWS_BUCKET_NAME`, `SUPABASE_URL`, `VITE_SUPABASE_KEY`).
5. Wire upload endpoint into application form (`src/routes/applications/new/` or upload component): upload file → trigger Lambda → read extractions → populate form fields.

## Assumptions / Risks
- `AWS_BUCKET_NAME` must exist and have write/read permissions for Lambda.
- Lambda timeout may need to be increased for large PDFs (Textract OCR on multi-page salary slips).
- No fraud/authenticity checks included (existing workflow handles verification separately per `PRD.md`).
