import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/api";

const docTypeOptions = [
  { value: "salary_slip", label: "Salary Slip" },
  { value: "form_16", label: "Form 16" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "pan_card", label: "PAN Card" },
  { value: "aadhaar", label: "Aadhaar" },
  { value: "other", label: "Other" },
];

export function DocumentUpload({
  applicationId,
  onUpload,
}: {
  applicationId: string;
  onUpload?: () => void;
}) {
  const [docType, setDocType] = useState("salary_slip");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0] ?? null;
      setFile(selected);
    },
    []
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    const result = await uploadDocument(applicationId, file, docType);
    setUploading(false);
    if (result.error) {
      toast.error("Upload failed: " + result.error);
    } else {
      toast.success("Document uploaded: " + file.name);
      setFile(null);
      onUpload?.();
    }
  }, [applicationId, file, docType, onUpload]);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Upload Document</h3>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          {docTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="cursor-pointer">
          <Button variant="outline" asChild disabled={uploading}>
            <span className="flex items-center gap-2">
              <Upload className="size-4" />
              <span>Choose file</span>
            </span>
          </Button>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
          />
        </label>
        <Button onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : null}
          Upload
        </Button>
      </div>
      {file && (
        <p className="text-xs text-muted-foreground">
          Selected: {file.name} ({
            Math.round(file.size / 1024)
          } KB)
        </p>
      )}
    </div>
  );
}
