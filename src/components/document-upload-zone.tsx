import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { cn } from "@/lib/utils";

export interface DocumentUploadZoneProps {
  documentType: string;
  acceptedFormats?: string[];
  maxSizeMB?: number;
  required?: boolean;
  existingFile?: File;
  onFileSelect: (file: File) => void;
  onRemove?: () => void;
  className?: string;
}

export function DocumentUploadZone({
  documentType,
  acceptedFormats = [".pdf", ".jpg", ".jpeg", ".png", ".tif"],
  maxSizeMB = 5,
  required = false,
  existingFile,
  onFileSelect,
  onRemove,
  className,
}: DocumentUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError("");
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!acceptedFormats.some((f) => f.toLowerCase() === ext)) {
      setError(`File must be one of: ${acceptedFormats.join(", ")}`);
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File exceeds ${maxSizeMB} MB`);
      return;
    }
    onFileSelect(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const formatList = acceptedFormats.join(", ").toUpperCase();

  return (
    <div className={cn("panel p-0 overflow-hidden", className)}>
      <div className="p-4 border-b">
        <h4 className="font-semibold text-sm">Upload {documentType}</h4>
        {required && <span className="text-xs text-red-600 font-medium">Required</span>}
      </div>

      {!existingFile ? (
        <div
          className={cn(
            "m-4 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-6 text-center transition-colors",
            dragOver && "border-primary bg-primary/5"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <svg className="mx-auto mb-3 text-muted-foreground" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p className="text-sm font-medium text-foreground mb-1">Drag and drop or click to browse</p>
          <p className="text-xs text-muted-foreground mb-3">Supported: {formatList} • Max {maxSizeMB} MB</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Select file
          </button>
          <input ref={inputRef} type="file" className="hidden" accept={acceptedFormats.join(",")} onChange={onInputChange} />
        </div>
      ) : (
        <div className="m-4 rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{existingFile.name}</p>
              <p className="text-xs text-muted-foreground">{(existingFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button onClick={onRemove} className="text-xs text-red-600 hover:text-red-700 underline shrink-0">Remove</button>
          </div>
        </div>
      )}

      {error && <p className="mx-4 mb-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
