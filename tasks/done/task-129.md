---
type: new
target: src/components/document-upload-zone.tsx
context: src/lib/format.ts
---

## Instructions

Create a React drag-and-drop document upload component for loan application documents.

Requirements:
- Named export `DocumentUploadZone`
- Props interface `DocumentUploadZoneProps`:
  - `documentType: string` — e.g. "Salary Slip", "Bank Statement", "PAN Card", "Aadhaar"
  - `acceptedFormats: string[]` — e.g. [".pdf", ".jpg", ".png"]
  - `maxSizeMB: number` — default 10
  - `required: boolean`
  - `existingFile?: {name: string; size: number; uploadedAt: string} | null`
  - `onFileSelect?: (file: File) => void`
  - `onRemove?: () => void`
  - `className?: string`
- Layout:
  - When no file: a dashed-border drop zone with an upload icon (simple SVG arrow-up), the document type as heading, accepted formats listed below, and "Drag & drop or click to browse" text. Max size shown as "Up to 10 MB".
  - Required indicator: a small red asterisk next to the document type if required.
  - Drag-over state: border color changes to primary blue, light blue background.
  - When file selected/existing: show file name, formatted file size (e.g. "1.2 MB"), upload date if available, and a remove/replace button (small X icon or "Replace" text link).
  - Validation: check file extension against acceptedFormats and size against maxSizeMB. Show inline red error text if invalid: "File must be PDF, JPG, or PNG" or "File exceeds 10 MB limit".
- Use `useState` for drag-over state and selected file state.
- Use `useRef` for the hidden file input element.
- Handle both drag-drop (onDragOver, onDragLeave, onDrop) and click-to-browse (hidden input with onClick trigger).
- Import `cn` from `@/lib/utils`
