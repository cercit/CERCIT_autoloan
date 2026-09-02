import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDocumentUrl } from "@/lib/api";

const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

function isImage(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return imageExts.some((ext) => lower.endsWith(ext));
}

export function DocumentPreview({
  open,
  onOpenChange,
  fileName,
  storagePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  storagePath: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl(null);
      return;
    }
    getDocumentUrl(storagePath).then(setUrl);
  }, [open, storagePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center min-h-[400px]">
          {!url ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : isImage(fileName) ? (
            <img src={url} alt={fileName} className="max-w-full max-h-[70vh] rounded" />
          ) : (
            <iframe src={url} title={fileName} className="w-full h-[70vh] rounded border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
