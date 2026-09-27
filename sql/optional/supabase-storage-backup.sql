-- cercit — OPTIONAL: Supabase storage as the backup for customer documents.
--
-- Not a numbered migration: run it only when switching documents from Amazon S3
-- to Supabase storage (set VITE_DOC_STORE=supabase in the build as well).
-- Same key layout as S3: <folder>/<application id>/<random>-<name>.
--
-- A customer may add files only under their own draft application's folders;
-- nobody reads files through the API (staff screens will use signed links later).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-docs', 'customer-docs', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "customer uploads own draft" ON storage.objects;
CREATE POLICY "customer uploads own draft" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-docs'
    AND public.fn_customer_can_upload(split_part(name, '/', array_length(string_to_array(name, '/'), 1) - 1))
    AND EXISTS (SELECT 1 FROM public.document_types t
                WHERE name LIKE t.storage_folder || '/%')
  );
