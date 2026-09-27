import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, Loader2, Lock, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCharacter } from "@/components/character/companion";
import { OnboardingShell } from "@/components/onboarding/shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  getCustomerState,
  getUploadTypes,
  registerDocument,
  type CustomerState,
  type DraftDocument,
  type UploadType,
} from "@/lib/customer-api";
import { isLockedPdf, putDocument, sha256Hex, STORAGE_BACKEND, storageReady } from "@/lib/document-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding/documents")({
  validateSearch: (s: Record<string, unknown>): { app?: string } => (typeof s["app"] === "string" ? { app: s["app"] } : {}),
  head: () => ({ meta: [{ title: "Documents — cercit" }] }),
  component: DocumentsStep,
});

// What to tell the customer for each document (document map, 27 Sep 2026).
const HINTS: Record<string, string> = {
  QUOTE: "Photo or PDF of the dealer's quotation.",
  PAN: "Both sides, flat, all four corners visible, no glare.",
  AADHAAR: "The masked Aadhaar (only the last 4 digits showing) — both sides. Download it from the UIDAI site or DigiLocker.",
  SALARY_SLIP: "Your last 3 months. One PDF with all three, or one file per month.",
  FORM16_B: "Part B of your latest Form 16, the PDF your employer sent.",
  BANK_STMT: "The bank's own PDF e-statement for your salary account, last 6 months. Screenshots or spreadsheets can't be accepted.",
  EB_BILL: "Only if you live somewhere other than your Aadhaar address. If rented, we'll ask for the owner's details next.",
  COMPANY_ID: "Optional — your office ID card helps confirm your employment.",
};
const MULTI_FILE = new Set(["SALARY_SLIP", "BANK_STMT"]);

function DocumentsStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<CustomerState | null>(null);
  const [types, setTypes] = useState<Record<string, UploadType>>({});

  const load = useCallback(async () => {
    const s = await getCustomerState();
    if (!s.draft || (app && s.draft.application_id !== app)) {
      navigate({ to: "/login", search: { as: "customer" } });
      return;
    }
    setState(s);
  }, [app, navigate]);

  useEffect(() => {
    void load().catch(() => navigate({ to: "/login", search: { as: "customer" } }));
    void getUploadTypes().then(setTypes).catch(() => setTypes({}));
  }, [load, navigate]);

  const docs = (state?.draft?.documents ?? []).filter((d) => d.doc_type !== "LIVE_PHOTO");
  const needed = docs.filter((d) => d.required === "ALWAYS");
  const done = needed.filter((d) => d.status === "RECEIVED" || d.status === "ACCEPTED").length;

  return (
    <OnboardingShell
      step={3}
      applicationId={app}
      title="Your documents"
      lead="Upload a clear photo or the PDF of each. You can leave and come back; everything you upload is saved."
    >
      {!storageReady() ? (
        <p className="panel p-6 text-sm text-muted-foreground">Uploads aren't connected on this copy of the site.</p>
      ) : !state ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <span className="font-semibold tabular-nums">{done} of {needed.length}</span> needed documents received
          </p>
          <ul className="space-y-3">
            {docs.map((d) => (
              <DocumentRow key={d.doc_type} app={app ?? state.draft!.application_id} doc={d} type={types[d.doc_type]} onDone={load} />
            ))}
            {types["COMPANY_ID"] && !docs.some((d) => d.doc_type === "COMPANY_ID") && (
              <DocumentRow
                app={app ?? state.draft!.application_id}
                doc={{ doc_type: "COMPANY_ID", name: "Company ID card", required: "OPTIONAL", status: "MISSING", note: null, sides: 2, files: [] }}
                type={types["COMPANY_ID"]}
                onDone={load}
              />
            )}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate({ to: "/onboarding/car", search: app ? { app } : {} })}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button size="lg" onClick={() => navigate({ to: "/onboarding/details", search: app ? { app } : {} })}>
              {done < needed.length ? "Continue — upload the rest later" : "Continue"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </OnboardingShell>
  );
}

function DocumentRow({ app, doc, type, onDone }: { app: string; doc: DraftDocument; type: UploadType | undefined; onDone: () => Promise<void> }) {
  const { emit } = useCharacter();
  const files = doc.files ?? [];
  const received = doc.status === "RECEIVED" || doc.status === "ACCEPTED";
  const slots: ("front" | "back" | "single")[] = doc.sides === 2 ? ["front", "back"] : ["single"];

  return (
    <li className="panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {received ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Received" />
        ) : (
          <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Missing" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{doc.name}</p>
            <Pill tone={doc.required === "ALWAYS" ? "primary" : "muted"}>
              {doc.required === "ALWAYS" ? "Needed" : doc.required === "OPTIONAL" ? "Optional" : "If applicable"}
            </Pill>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{HINTS[doc.doc_type] ?? doc.note}</p>
          {doc.note && doc.note !== HINTS[doc.doc_type] && !received && <p className="mt-1 text-xs text-warning-foreground dark:text-warning">{doc.note}</p>}

          <div className={cn("mt-3 grid gap-2", slots.length === 2 && "sm:grid-cols-2")}>
            {slots.map((side) => (
              <UploadSlot
                key={side}
                app={app}
                doc={doc}
                side={side}
                type={type}
                files={files.filter((f) => f.side === side)}
                multi={MULTI_FILE.has(doc.doc_type)}
                onUploaded={async (locked) => {
                  emit(locked ? "DOCUMENT_REUPLOAD_NEEDED" : "DOCUMENT_UPLOAD_DONE");
                  await onDone();
                }}
                onFailed={() => emit("DOCUMENT_REUPLOAD_NEEDED")}
                onStart={() => emit("DOCUMENT_UPLOAD_STARTED")}
              />
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function UploadSlot({
  app,
  doc,
  side,
  type,
  files,
  multi,
  onUploaded,
  onFailed,
  onStart,
}: {
  app: string;
  doc: DraftDocument;
  side: "front" | "back" | "single";
  type: UploadType | undefined;
  files: NonNullable<DraftDocument["files"]>;
  multi: boolean;
  onUploaded: (locked: boolean) => Promise<void>;
  onFailed: () => void;
  onStart: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedNote, setLockedNote] = useState(false);
  const label = side === "front" ? "Front" : side === "back" ? "Back" : multi && files.length ? "Add another file" : "Choose file";

  async function upload(file: File) {
    setError(null);
    setLockedNote(false);
    if (!type) return setError("Uploads are not ready yet. Try again in a minute.");
    if (!type.allowed_mime.includes(file.type)) return (setError("Upload a PDF, JPG or PNG."), onFailed());
    if (file.size > type.max_mb * 1024 * 1024) return (setError(`The file must be under ${type.max_mb} MB.`), onFailed());
    setBusy(true);
    onStart();
    try {
      const locked = await isLockedPdf(file);
      const [key, sha] = await Promise.all([
        putDocument({ applicationId: app, uploadType: type.upload_type, folder: type.folder }, file),
        sha256Hex(file),
      ]);
      await registerDocument({ applicationId: app, docType: doc.doc_type, side, key, file, sha256: sha, backend: STORAGE_BACKEND, wasLocked: locked });
      setLockedNote(locked);
      await onUploaded(locked);
    } catch (e) {
      setError((e as Error).message || "The upload didn't go through. Try again.");
      onFailed();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-md border border-dashed border-border p-3">
      {side !== "single" && <p className="mb-1.5 text-xs font-medium">{side === "front" ? "Front" : "Back"}</p>}
      {files.length > 0 && (
        <ul className="mb-2 space-y-1">
          {files.map((f) => (
            <li key={f.uploaded_at + f.file_name} className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{f.file_name}</span>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept={(type?.allowed_mime ?? ["application/pdf", "image/jpeg", "image/png"]).join(",")}
        className="sr-only"
        id={`file-${doc.doc_type}-${side}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
        {busy ? "Uploading…" : files.length && !multi ? `Replace ${side === "single" ? "file" : side}` : label}
      </Button>
      {lockedNote && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground dark:text-warning">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          This PDF is password-protected. We've saved it; if we can't open it, we'll ask you for an unlocked copy. Never send us the password by email.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
