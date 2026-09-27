import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCharacter } from "@/components/character/companion";
import { OnboardingShell } from "@/components/onboarding/shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCustomerState,
  getUploadTypes,
  type CustomerState,
  type DraftDocument,
  type UploadType,
} from "@/lib/customer-api";
import { isLockedPdf, prepareImage, storageReady, uploadCustomerFile } from "@/lib/document-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding/documents")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    typeof s["app"] === "string" ? { app: s["app"] } : {},
  head: () => ({ meta: [{ title: "Documents — cercit" }] }),
  component: DocumentsStep,
});

// What to tell the customer for each document (document map, 27–28 Sep 2026).
const HINTS: Record<string, string> = {
  QUOTE: "Photo or PDF of the dealer's quotation.",
  PAN: "A photo of the card (front; the back is optional), or the PAN PDF from DigiLocker.",
  AADHAAR:
    "A photo of both sides, or the e-Aadhaar PDF from UIDAI or DigiLocker. If the full number shows, we black out the first 8 digits before keeping it.",
  SALARY_SLIP: "Your last 3 months. One PDF with all three, or one file per month.",
  FORM16_B: "Part B of your latest Form 16, the PDF your employer sent.",
  BANK_STMT:
    "The bank's own PDF e-statement for your salary account, last 6 months. Screenshots or spreadsheets can't be accepted.",
  EB_BILL:
    "Only if you live somewhere other than your Aadhaar address. If rented, we'll ask for the owner's details next.",
  COMPANY_ID: "Optional — your office ID card helps confirm your employment.",
  ITR: "Optional — if you file income tax returns, the ITR-V acknowledgement for the last 2 years.",
};
const PASSWORD_HINTS: Record<string, string> = {
  AADHAAR:
    "e-Aadhaar: the first 4 letters of your name in capitals + your year of birth, e.g. ASHA1990.",
  ITR: "ITR-V: your PAN in small letters + date of birth as DDMMYYYY, e.g. abcde1234f01011990.",
  SALARY_SLIP:
    "Set by your employer, often your PAN or date of birth. The email the slip came with usually says.",
  BANK_STMT:
    "Set by your bank, often your customer ID or date of birth. The bank's email usually says.",
};
const TWO_WAY = new Set(["PAN", "AADHAAR"]); // card photo, or one downloaded PDF
const IMAGE_TYPES = ["image/jpeg", "image/png"];

const isPhone = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function DocumentsStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<CustomerState | null>(null);
  const [types, setTypes] = useState<Record<string, UploadType>>({});
  const [photoSkipped, setPhotoSkipped] = useState(false);

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
    void getUploadTypes()
      .then(setTypes)
      .catch(() => setTypes({}));
  }, [load, navigate]);

  const appId = app ?? state?.draft?.application_id ?? "";
  const checklist = state?.draft?.documents ?? [];
  const live = checklist.find((d) => d.doc_type === "LIVE_PHOTO");
  // Optional documents (company ID, ITR) join the list before anything is uploaded.
  const optional: DraftDocument[] = Object.entries(types)
    .filter(
      ([code, t]) =>
        t.required === "OPTIONAL" &&
        code !== "LIVE_PHOTO" &&
        !checklist.some((d) => d.doc_type === code),
    )
    .map(([code, t]) => ({
      doc_type: code,
      name: t.name,
      required: "OPTIONAL",
      status: "MISSING",
      note: t.note,
      sides: t.sides,
      back_required: t.back_required,
      multi_file: t.multi_file,
      ask_password: t.ask_password,
      files: [],
    }));
  const sortOf = (d: DraftDocument) => types[d.doc_type]?.sort ?? 99;
  const docs = [...checklist.filter((d) => d.doc_type !== "LIVE_PHOTO"), ...optional].sort(
    (a, b) => sortOf(a) - sortOf(b),
  );
  const needed = checklist.filter((d) => d.required === "ALWAYS");
  const done = needed.filter((d) => d.status === "RECEIVED" || d.status === "ACCEPTED").length;
  const photoDone = !live || live.status === "RECEIVED" || live.status === "ACCEPTED";

  return (
    <OnboardingShell
      step={3}
      applicationId={app}
      title="Your documents"
      lead="A quick photo of you first, then your documents. You can leave and come back; everything you upload is saved."
    >
      {!storageReady() ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          Uploads aren't connected on this copy of the site.
        </p>
      ) : !state ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <span className="font-semibold tabular-nums">
              {done} of {needed.length}
            </span>{" "}
            needed items received
          </p>
          {live && types["LIVE_PHOTO"] && (
            <LivePhoto
              app={appId}
              doc={live}
              type={types["LIVE_PHOTO"]}
              onDone={load}
              onSkip={() => setPhotoSkipped(true)}
            />
          )}
          <ul className="mt-3 space-y-3">
            {docs.map((d) => (
              <DocumentRow
                key={d.doc_type}
                app={appId}
                doc={d}
                type={types[d.doc_type]}
                locked={TWO_WAY.has(d.doc_type) && !photoDone && !photoSkipped}
                onDone={load}
              />
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/onboarding/car", search: app ? { app } : {} })}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              size="lg"
              onClick={() => navigate({ to: "/onboarding/details", search: app ? { app } : {} })}
            >
              {done < needed.length ? "Continue — upload the rest later" : "Continue"}{" "}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </OnboardingShell>
  );
}

// ---------------------------------------------------------------------------
// Live photo — taken first, matched later with the PAN and Aadhaar photos
// ---------------------------------------------------------------------------

function LivePhoto({
  app,
  doc,
  type,
  onDone,
  onSkip,
}: {
  app: string;
  doc: DraftDocument;
  type: UploadType;
  onDone: () => Promise<void>;
  onSkip: () => void;
}) {
  const { emit, setCameraOpen } = useCharacter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = doc.status === "RECEIVED" || doc.status === "ACCEPTED";

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOpen(false);
    setCameraOpen(false);
  }, [setCameraOpen]);
  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      setOpen(true);
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (video.current && stream.current) {
          video.current.srcObject = stream.current;
          void video.current.play();
        }
      });
    } catch {
      if (isPhone()) fallback.current?.click();
      else
        setError(
          "We couldn't use a camera here. Allow camera access in your browser, or open this page on your phone.",
        );
    }
  }

  async function send(file: File) {
    setBusy(true);
    emit("DOCUMENT_UPLOAD_STARTED");
    try {
      const r = await uploadCustomerFile({
        applicationId: app,
        docType: "LIVE_PHOTO",
        side: "single",
        target: { applicationId: app, uploadType: type.upload_type, folder: type.folder },
        file,
      });
      if (r.status !== "OK") throw new Error("The photo didn't save. Try again.");
      emit("DOCUMENT_UPLOAD_DONE");
      await onDone();
    } catch (e) {
      setError((e as Error).message || "The photo didn't save. Try again.");
      emit("DOCUMENT_REUPLOAD_NEEDED");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0); // save it the way the customer saw it (mirrored preview)
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    stop();
    if (blob) await send(new File([blob], "live-photo.jpg", { type: "image/jpeg" }));
  }

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="live-photo-title">
      <div className="flex items-start gap-3">
        {taken ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
        ) : (
          <Camera className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="live-photo-title" className="text-sm font-semibold">
              A photo of you
            </h2>
            <Pill tone="primary">Needed first</Pill>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We match it with the photos on your PAN and Aadhaar. Face the camera in good light, no
            cap or dark glasses.
          </p>
          {open && (
            <div className="relative mt-3 w-full max-w-xs overflow-hidden rounded-lg bg-black">
              <video
                ref={video}
                playsInline
                muted
                className="aspect-[3/4] w-full -scale-x-100 object-cover"
              />
              <div
                className="pointer-events-none absolute inset-[12%_18%] rounded-[50%] border-2 border-white/80"
                aria-hidden="true"
              />
            </div>
          )}
          <input
            ref={fallback}
            type="file"
            accept="image/jpeg"
            capture="user"
            className="sr-only"
            id="live-photo-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void prepareImage(f).then(send);
              e.target.value = "";
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {open ? (
              <>
                <Button type="button" size="sm" onClick={() => void capture()}>
                  <Camera className="size-4" /> Take photo
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={stop}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={taken ? "outline" : "default"}
                disabled={busy}
                onClick={() => void start()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                {busy ? "Saving…" : taken ? "Retake photo" : "Open camera"}
              </Button>
            )}
            {!taken && !open && error && (
              <button
                type="button"
                className="text-xs underline underline-offset-2"
                onClick={onSkip}
              >
                Skip for now, I'll take it on my phone
              </button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------------

function DocumentRow({
  app,
  doc,
  type,
  locked,
  onDone,
}: {
  app: string;
  doc: DraftDocument;
  type: UploadType | undefined;
  locked: boolean;
  onDone: () => Promise<void>;
}) {
  const { emit } = useCharacter();
  const files = doc.files ?? [];
  const received = doc.status === "RECEIVED" || doc.status === "ACCEPTED";
  const twoWay = TWO_WAY.has(doc.doc_type);
  const [mode, setMode] = useState<"card" | "pdf">(
    files.some((f) => f.side === "single") ? "pdf" : "card",
  );
  const slots: ("front" | "back" | "single")[] =
    doc.sides === 2 && mode === "card" ? ["front", "back"] : ["single"];
  const backOptional = doc.back_required === false;

  return (
    <li className={cn("panel p-4 sm:p-5", locked && "opacity-60")}>
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
              {doc.required === "ALWAYS"
                ? "Needed"
                : doc.required === "OPTIONAL"
                  ? "Optional"
                  : "If applicable"}
            </Pill>
            {files.some((f) => f.masked) && <Pill tone="muted">Number masked</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{HINTS[doc.doc_type] ?? doc.note}</p>
          {doc.note && doc.note !== HINTS[doc.doc_type] && !received && doc.note !== type?.note && (
            <p className="mt-1 text-xs text-warning-foreground dark:text-warning">{doc.note}</p>
          )}
          {locked && <p className="mt-1 text-xs font-medium">Take the photo of you above first.</p>}

          {twoWay && (
            <div
              className="mt-3 inline-flex rounded-md border border-border p-0.5 text-xs"
              role="radiogroup"
              aria-label={`How you have your ${doc.name}`}
            >
              {(["card", "pdf"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={locked}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded px-2.5 py-1",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "card"
                    ? "Photo of the card"
                    : doc.doc_type === "PAN"
                      ? "DigiLocker PDF"
                      : "e-Aadhaar / DigiLocker PDF"}
                </button>
              ))}
            </div>
          )}

          <div className={cn("mt-3 grid gap-2", slots.length === 2 && "sm:grid-cols-2")}>
            {slots.map((side) => (
              <UploadSlot
                key={`${mode}-${side}`}
                app={app}
                doc={doc}
                side={side}
                label={
                  side === "front"
                    ? "Front"
                    : side === "back"
                      ? backOptional
                        ? "Back (optional)"
                        : "Back"
                      : null
                }
                type={type}
                accept={twoWay && mode === "pdf" ? ["application/pdf"] : type?.allowed_mime}
                disabled={locked}
                files={files.filter((f) => f.side === side)}
                multi={!!doc.multi_file}
                askPassword={!!doc.ask_password && !(twoWay && mode === "card")}
                onUploaded={async () => {
                  emit("DOCUMENT_UPLOAD_DONE");
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
  label,
  type,
  accept,
  disabled,
  files,
  multi,
  askPassword,
  onUploaded,
  onFailed,
  onStart,
}: {
  app: string;
  doc: DraftDocument;
  side: "front" | "back" | "single";
  label: string | null;
  type: UploadType | undefined;
  accept: string[] | undefined;
  disabled: boolean;
  files: NonNullable<DraftDocument["files"]>;
  multi: boolean;
  askPassword: boolean;
  onUploaded: () => Promise<void>;
  onFailed: () => void;
  onStart: () => void;
}) {
  const { privateField } = useCharacter();
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<"no" | "yes">("no");
  const [password, setPassword] = useState("");
  // A locked file waiting for its password: either not sent yet, or already in incoming/.
  const [waiting, setWaiting] = useState<{ file: File; stagedKey?: string } | null>(null);
  const allowed = accept ?? ["application/pdf", "image/jpeg", "image/png"];
  const canPhoto = isPhone() && allowed.some((m) => IMAGE_TYPES.includes(m));
  const showPassword = hasPassword === "yes" || waiting !== null;
  const fid = `file-${doc.doc_type}-${side}`;

  async function send(file: File, stagedKey?: string) {
    if (!type) return setError("Uploads are not ready yet. Try again in a minute.");
    setBusy(true);
    setError(null);
    onStart();
    try {
      const r = await uploadCustomerFile({
        applicationId: app,
        docType: doc.doc_type,
        side,
        file,
        stagedKey,
        target: { applicationId: app, uploadType: type.upload_type, folder: type.folder },
        password: showPassword ? password : undefined,
      });
      if (r.status === "OK") {
        setWaiting(null);
        setPassword("");
        setHasPassword("no");
        await onUploaded();
        return;
      }
      setWaiting({ file, stagedKey: r.stagedKey });
      setHasPassword("yes");
      setError(
        r.status === "WRONG_PASSWORD"
          ? "That password didn't open the file. Check it and try again."
          : "This PDF is locked. Type its password, then press Open file.",
      );
      onFailed();
    } catch (e) {
      setError((e as Error).message || "The upload didn't go through. Try again.");
      onFailed();
    } finally {
      setBusy(false);
    }
  }

  async function choose(raw: File) {
    setError(null);
    if (!type) return setError("Uploads are not ready yet. Try again in a minute.");
    if (!allowed.includes(raw.type))
      return (
        setError(allowed.length === 1 ? "Choose the PDF file." : "Upload a PDF, JPG or PNG."),
        onFailed()
      );
    const file = await prepareImage(raw);
    if (file.size > type.max_mb * 1024 * 1024)
      return (setError(`The file must be under ${type.max_mb} MB.`), onFailed());
    if (!password && (await isLockedPdf(file))) {
      setWaiting({ file });
      setHasPassword("yes");
      setError("This PDF is locked. Type its password, then press Open file.");
      return;
    }
    await send(file);
  }

  const pick = (input: HTMLInputElement | null) => {
    setWaiting(null);
    input?.click();
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void choose(f);
  };

  return (
    <div className="rounded-md border border-dashed border-border p-3">
      {label && <p className="mb-1.5 text-xs font-medium">{label}</p>}
      {files.length > 0 && (
        <ul className="mb-2 space-y-1">
          {files.map((f) => (
            <li
              key={f.uploaded_at + f.file_name}
              className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{f.file_name}</span>
              {f.unlocked && (
                <Lock className="size-3 shrink-0" aria-label="Opened with your password" />
              )}
            </li>
          ))}
        </ul>
      )}

      {askPassword && !waiting && (
        <fieldset className="mb-2 text-xs" disabled={disabled || busy}>
          <legend className="mb-1 text-muted-foreground">Is the file password-protected?</legend>
          <div className="flex gap-3">
            {(["no", "yes"] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${fid}-pw`}
                  value={v}
                  checked={hasPassword === v}
                  onChange={() => setHasPassword(v)}
                />
                {v === "no" ? "No" : "Yes"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {showPassword && (
        <div className="mb-2 space-y-1">
          <label
            htmlFor={`${fid}-password`}
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <KeyRound className="size-3.5" aria-hidden="true" /> File password
          </label>
          <Input
            id={`${fid}-password`}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={privateField.onFocus}
            onBlur={privateField.onBlur}
            className="h-8 text-sm"
          />
          {PASSWORD_HINTS[doc.doc_type] && (
            <p className="text-xs text-muted-foreground">{PASSWORD_HINTS[doc.doc_type]}</p>
          )}
          <p className="text-xs text-muted-foreground">
            We use it once to open the file. It isn't saved.
          </p>
        </div>
      )}

      <input
        ref={picker}
        type="file"
        accept={allowed.join(",")}
        className="sr-only"
        id={fid}
        onChange={onChange}
      />
      {canPhoto && (
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          id={`${fid}-camera`}
          onChange={onChange}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {waiting ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || !password}
            onClick={() => void send(waiting.file, waiting.stagedKey)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}{" "}
            {busy ? "Opening…" : "Open file"}
          </Button>
        ) : (
          <>
            {canPhoto && (
              <Button
                type="button"
                size="sm"
                disabled={disabled || busy || (hasPassword === "yes" && !password)}
                onClick={() => pick(camera.current)}
              >
                <Camera className="size-4" /> Take photo
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy || (hasPassword === "yes" && !password)}
              onClick={() => pick(picker.current)}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              {busy
                ? "Uploading…"
                : files.length && !multi
                  ? "Replace file"
                  : multi && files.length
                    ? "Add another file"
                    : "Choose file"}
            </Button>
          </>
        )}
        {waiting && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => (setWaiting(null), setError(null), setPassword(""))}
          >
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
