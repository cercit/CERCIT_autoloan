import { useState, useEffect } from "react";
import { FileText, Upload, Check, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDocuments, uploadDocument } from "@/lib/api";
import { DocumentPreview } from "@/components/document-preview";
import type { Document } from "@/lib/api";

const docTypes = [
  { value: "ID_PROOF", label: "ID Proof" },
  { value: "ADDRESS_PROOF", label: "Address Proof" },
  { value: "INCOME_PROOF", label: "Income Proof" },
  { value: "VEHICLE_INVOICE", label: "Vehicle Invoice" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "OTHER", label: "Other" },
];

const docStatusTone = {
  Uploaded: "muted",
  Extracted: "primary",
  Verified: "success",
  Failed: "destructive",
} as const;

export function DocumentList({
  applicationId,
  refreshKey = 0,
}: {
  applicationId: string;
  refreshKey?: number;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedType, setSelectedType] = useState("OTHER");
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDocuments(applicationId).then((list) => {
      setDocs(list);
      setLoading(false);
    });
  }, [applicationId, refreshKey]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setMessage("");
    // Simulate progress ticks since storage-js upload doesn't expose progress easily
    const tick = setInterval(() => {
      setUploadProgress((prev) => (prev < 90 ? prev + 15 : prev));
    }, 200);
    const result = await uploadDocument(applicationId, file, selectedType);
    clearInterval(tick);
    setUploadProgress(100);
    setUploading(false);
    if (!result.error) {
      setMessage("Uploaded: " + file.name);
      const updated = await getDocuments(applicationId);
      setDocs(updated);
    } else {
      setMessage("Upload failed: " + (result.error ?? "please try again."));
    }
    e.target.value = "";
  }

  return (
    <SectionCard title="Documents" description={`${docs.length} file${docs.length !== 1 ? "s" : ""}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              {docTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={uploading}
            asChild
          >
            <label className="cursor-pointer flex items-center gap-2">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              <span>{uploading ? "Uploading..." : "Upload"}</span>
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
          </Button>
        </div>
        {uploading && (
          <div className="w-full rounded-full h-2 bg-muted overflow-hidden">
            <div
              className="h-full bg-success transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        {message && (
          <p className={`text-sm flex items-center gap-2 ${message.startsWith("Uploaded") ? "text-success" : "text-destructive"}`}>
            {message.startsWith("Uploaded") ? <Check className="size-4" /> : null}
            {message}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                <button
                  type="button"
                  className="flex items-center gap-2 min-w-0 text-left hover:underline"
                  onClick={() => setPreviewDoc(doc)}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm truncate font-medium">{doc.fileName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="uppercase tracking-wide">{doc.type}</span>
                      <span>·</span>
                      <span>{doc.uploadedAt}</span>
                    </div>
                  </div>
                </button>
                <Pill tone={docStatusTone[doc.status]}>{doc.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DocumentPreview
        open={previewDoc !== null}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
        fileName={previewDoc?.fileName ?? ""}
        storagePath={previewDoc?.url ?? ""}
      />
    </SectionCard>
  );
}
