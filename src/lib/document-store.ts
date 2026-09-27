import { getPresignedUrl, isAwsConfigured, uploadToS3, type DocType } from "./aws-doc-api";
import { supabase } from "./supabase";

// Where customer documents are stored (decision 27 Sep 2026): Amazon S3 in
// Mumbai while it is free, with Supabase storage kept ready as the backup for an
// account change. Pick with VITE_DOC_STORE ("s3" default, or "supabase"). Both
// use the same key layout — <folder>/<application>/<random>-<name> — so the
// database check in sql/044 is the same and files can be copied across.
// The Supabase bucket is set up by sql/optional/supabase-storage-backup.sql.

export type StorageBackend = "s3" | "supabase";

export const STORAGE_BACKEND: StorageBackend = import.meta.env["VITE_DOC_STORE"] === "supabase" ? "supabase" : "s3";
const SUPABASE_BUCKET = "customer-docs";

export interface UploadTarget {
  applicationId: string;
  uploadType: string; // document_types.upload_type
  folder: string; // document_types.storage_folder
}

export function storageReady(): boolean {
  return STORAGE_BACKEND === "supabase" || isAwsConfigured();
}

function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(-80) || "document";
}

/** Puts the file in storage and returns its key. */
export async function putDocument(target: UploadTarget, file: File): Promise<string> {
  if (STORAGE_BACKEND === "supabase") {
    const key = `${target.folder}/${target.applicationId}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    return key;
  }
  const { uploadUrl, key } = await getPresignedUrl(target.applicationId, target.uploadType as DocType, file.name, file.type);
  await uploadToS3(uploadUrl, file);
  return key;
}

/** SHA-256 of the file, hex — lets the database spot the same file reused. */
export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when a PDF is password-protected (it declares an /Encrypt dictionary). */
export async function isLockedPdf(file: File): Promise<boolean> {
  if (file.type !== "application/pdf") return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes);
  return /\/Encrypt\b/.test(text);
}
