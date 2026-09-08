---
type: new
target: src/lib/pdf-text-extract.ts
model: inkling
context: src/lib/format.ts
---

## Instructions

Create a utility module that extracts text content from a PDF file in the browser.

Requirements:
- Named export `extractPdfText`
- Signature: `async function extractPdfText(file: File): Promise<string[]>` — returns an array of strings, one per page
- Use the browser-native approach: read the File as ArrayBuffer, then use a simple text extraction
- Since we cannot import pdfjs-dist (no bundler guarantee), implement a lightweight approach:
  - Export a second function `extractPdfTextFromArrayBuffer(buffer: ArrayBuffer): Promise<string[]>` for flexibility
  - For now, return a mock implementation that reads the file name and size, and returns `["[PDF text extraction placeholder - page 1]", "[PDF text extraction placeholder - page 2]"]`
  - Add a clear comment: `// Replace with pdfjs-dist or server-side extraction in production`
- Named export `isPdfFile(file: File): boolean` — checks if the file is a PDF by MIME type or extension
- Named export `formatFileSize(bytes: number): string` — returns human-readable size like "1.2 MB", "340 KB"
- All functions must be pure TypeScript, no React imports
- No external dependencies
