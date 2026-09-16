import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  isAwsConfigured,
  uploadDocument as awsUploadDocument,
  pollForExtraction,
} from "@/lib/aws-doc-api";

interface BureauUploadFormProps {
  applicationId: string;
  applicationPan: string;
  onUploadComplete?: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function BureauUploadForm({
  applicationId,
  applicationPan,
  onUploadComplete,
}: BureauUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSet(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) validateAndSet(selected);
  }

  function validateAndSet(f: File) {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Only PDF, JPEG, and PNG files are accepted.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error("File must be under 10 MB.");
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file || !isAwsConfigured()) return;
    setUploading(true);

    try {
      await awsUploadDocument(applicationId, "bureau_report", file);
      toast.success(`${file.name} uploaded -- extracting bureau data...`);

      const extracted = await pollForExtraction(
        applicationId,
        "bureau_report",
        45000,
        5000
      );

      if (extracted) {
        const pan = extracted["pan"]?.value as string | undefined;
        if (pan && applicationPan && pan !== applicationPan) {
          toast.warning(
            `PAN mismatch: report shows ${pan}, application has ${applicationPan}. Verify before proceeding.`
          );
        }

        const reportDate = extracted["report_date"]?.value as string | undefined;
        if (reportDate) {
          const parsed = new Date(reportDate);
          const daysSince = Math.floor(
            (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSince > 30) {
            toast.warning(
              `Bureau report is ${daysSince} days old. Most lenders require a report within 30 days.`
            );
          }
        }

        toast.success("Bureau data extracted.");
        onUploadComplete?.();
      } else {
        toast.info(
          "Extraction still processing. Refresh the Bureau tab in a minute."
        );
        onUploadComplete?.();
      }
    } catch (err: any) {
      toast.error(err.message ?? "Bureau upload failed");
    } finally {
      setUploading(false);
      setFile(null);
    }
  }

  if (!isAwsConfigured()) {
    return (
      <p className="text-sm text-muted-foreground">
        AWS not configured. Bureau upload requires the API gateway to be
        deployed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </p>
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload & Extract"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFile(null)}
                disabled={uploading}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer space-y-1">
            <p className="text-sm text-muted-foreground">
              Drop a CIBIL/Experian PDF here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, JPEG, or PNG up to 10 MB
            </p>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>
        )}
      </div>
    </div>
  );
}
