"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ExtractedField {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  editable?: boolean;
}

export interface DocumentExtractionReviewProps {
  documentName: string;
  documentType: string;
  fields: ExtractedField[];
  onFieldChange?: (index: number, newValue: string) => void;
  onConfirm?: () => void;
  onReject?: () => void;
  className?: string;
}

export function DocumentExtractionReview({
  documentName,
  documentType,
  fields,
  onFieldChange,
  onConfirm,
  onReject,
  className,
}: DocumentExtractionReviewProps) {
  const [localValues, setLocalValues] = useState<string[]>(
    fields.map((f) => f.value)
  );

  const highConfidenceCount = fields.filter(
    (f) => f.confidence === "high"
  ).length;

  const confidenceColors = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-red-500",
  };

  const confidenceLabels = {
    high: "High confidence",
    medium: "Medium confidence",
    low: "Low confidence",
  };

  const handleInputChange = (index: number, value: string) => {
    setLocalValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    onFieldChange?.(index, value);
  };

  return (
    <div className={cn("panel", className)}>
      <header className="mb-4 border-b pb-3">
        <p className="text-sm text-muted-foreground">{documentType}</p>
        <h3 className="font-semibold truncate">{documentName}</h3>
      </header>

      <div className="space-y-4">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-3">
            <span className="w-40 flex-shrink-0 text-sm text-muted-foreground">
              {field.label}
            </span>
            <div className="flex-1 flex items-center gap-3">
              {field.editable !== false ? (
                <input
                  type="text"
                  value={localValues[index]}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  className={cn(
                    "flex-1 rounded-md border bg-background px-3 py-2 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                />
              ) : (
                <span className="flex-1 text-sm">{localValues[index]}</span>
              )}
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  confidenceColors[field.confidence]
                )}
                title={confidenceLabels[field.confidence]}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {highConfidenceCount} of {fields.length} fields extracted with high confidence
        </p>
        <div className="flex gap-2">
          <button
            onClick={onReject}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              "border-destructive text-destructive hover:bg-destructive/10"
            )}
          >
            Reject / re-upload
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
              "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            Confirm extraction
          </button>
        </div>
      </div>
    </div>
  );
}