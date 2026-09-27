import {
  finalizeUpload,
  getPresignedUrl,
  isAwsConfigured,
  uploadToS3,
  type DocType,
} from "./aws-doc-api";
import { registerDocument } from "./customer-api";
import { supabase } from "./supabase";

// Where customer documents are stored (decision 27 Sep 2026): Amazon S3 in
// Mumbai while it is free, with Supabase storage kept ready as the backup for an
// account change. Pick with VITE_DOC_STORE ("s3" default, or "supabase"). Both
// use the same key layout — <folder>/<application>/<random>-<name> — so the
// database check in sql/044 is the same and files can be copied across.
// The Supabase bucket is set up by sql/optional/supabase-storage-backup.sql.

export type StorageBackend = "s3" | "supabase";

export const STORAGE_BACKEND: StorageBackend =
  import.meta.env["VITE_DOC_STORE"] === "supabase" ? "supabase" : "s3";
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
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(key, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    return key;
  }
  const { uploadUrl, key } = await getPresignedUrl(
    target.applicationId,
    target.uploadType as DocType,
    file.name,
    file.type,
  );
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

/**
 * Phone photos can be 5–12 MB. Anything over ~2.5 MB or wider than 2400 px is
 * redrawn as a JPEG at 2400 px, plenty for reading a card, and under the
 * document reader's 5 MB limit.
 */
export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 2.5 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
  return blob
    ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
    : file;
}

export type CustomerUploadResult =
  | { status: "OK"; wasLocked: boolean; unlocked: boolean; masked: boolean }
  | { status: "PASSWORD_NEEDED" | "WRONG_PASSWORD"; stagedKey: string };

/**
 * One customer file, start to finish. With the finalise service (sql/045) the
 * file goes to incoming/ and the service unlocks, masks and registers it. A
 * password retry passes stagedKey so the file is not uploaded twice.
 * Until the finalise service is deployed the upload service still hands out
 * final keys, and the file is registered from here as before (sql/044).
 */
export async function uploadCustomerFile(input: {
  applicationId: string;
  docType: string;
  side: "front" | "back" | "single";
  target: UploadTarget;
  file: File;
  password?: string | undefined;
  stagedKey?: string | undefined;
}): Promise<CustomerUploadResult> {
  const { applicationId, docType, side, file, password } = input;
  let key = input.stagedKey;
  if (!key) {
    const locked = await isLockedPdf(file);
    if (STORAGE_BACKEND === "supabase") {
      key = await putDocument(input.target, file);
      await register(key, locked);
      return { status: "OK", wasLocked: locked, unlocked: false, masked: false };
    }
    const presigned = await getPresignedUrl(
      applicationId,
      input.target.uploadType as DocType,
      file.name,
      file.type,
    );
    await uploadToS3(presigned.uploadUrl, file);
    key = presigned.key;
    if (!key.startsWith("incoming/")) {
      await register(key, locked);
      return { status: "OK", wasLocked: locked, unlocked: false, masked: false };
    }
  }
  const r = await finalizeUpload({
    applicationId,
    docType,
    side,
    key,
    fileName: file.name,
    password: password || undefined,
  });
  if (r.status !== "OK") return { status: r.status, stagedKey: key };
  return { status: "OK", wasLocked: r.wasLocked, unlocked: r.unlocked, masked: r.masked };

  async function register(k: string, locked: boolean) {
    await registerDocument({
      applicationId,
      docType,
      side,
      key: k,
      file,
      sha256: await sha256Hex(file),
      backend: STORAGE_BACKEND,
      wasLocked: locked,
    });
  }
}
