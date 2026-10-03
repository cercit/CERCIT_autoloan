import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DocumentRow, LivePhoto, TWO_WAY } from "@/components/onboarding/document-upload";
import { OnboardingShell } from "@/components/onboarding/shell";
import { Button } from "@/components/ui/button";
import {
  getCustomerState,
  getUploadTypes,
  isSignInError,
  type CustomerState,
  type DraftDocument,
  type UploadType,
} from "@/lib/customer-api";
import { storageReady } from "@/lib/document-store";

export const Route = createFileRoute("/onboarding/documents")({
  validateSearch: (s: Record<string, unknown>): { app?: string } =>
    (typeof s["app"] === "string" || typeof s["app"] === "number") && String(s["app"])
      ? { app: String(s["app"]) }
      : {},
  head: () => ({ meta: [{ title: "Documents — cercit" }] }),
  component: DocumentsStep,
});

// What to tell the customer for each document (document map, 27–28 Sep 2026).

function DocumentsStep() {
  const { app } = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<CustomerState | null>(null);
  const [types, setTypes] = useState<Record<string, UploadType>>({});
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await getCustomerState();
    if (!s.draft || (app && s.draft.application_id !== app)) {
      navigate({ to: "/login", search: { as: "customer" } });
      return;
    }
    setState(s);
  }, [app, navigate]);

  useEffect(() => {
    // H2: only a sign-in problem goes back to sign in; anything else is shown
    void load().catch((e: Error) =>
      isSignInError(e) ? navigate({ to: "/login", search: { as: "customer" } }) : setLoadError(e.message),
    );
    void getUploadTypes()
      .then(setTypes)
      .catch((e: Error) => setLoadError(`the list of documents could not be read (${e.message})`));
  }, [load, navigate]);

  const appId = app ?? state?.draft?.application_id ?? "";
  const checklist = state?.draft?.documents ?? [];
  const live = checklist.find((d) => d.doc_type === "LIVE_PHOTO");
  // Optional documents (company ID, ITR) join the list before anything is uploaded.
  const optional: DraftDocument[] = Object.entries(types)
    .filter(
      ([code, t]) =>
        t.required === "OPTIONAL" &&
        (t.stage ?? "APPLICATION") === "APPLICATION" &&
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
      progress={needed.length ? done / needed.length : 0}
      applicationId={app}
      title="Your documents"
      lead="A quick photo of you first, then your documents. You can leave and come back; everything you upload is saved."
    >
      {loadError && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          We couldn't load your application: {loadError}{" "}
          <button type="button" className="font-medium underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}
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
