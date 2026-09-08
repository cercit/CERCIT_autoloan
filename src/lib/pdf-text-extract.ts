/**
 * PDF text extraction utility - placeholder implementation
 * Replace with pdfjs-dist or server-side extraction in production
 */

/**
 * Checks if a file is a PDF by MIME type or extension
 * @param file - File to check
 * @returns true if PDF, false otherwise
 */
export function isPdfFile(file: File): boolean {
  if (!file) return false;
  const mimeType = file.type.toLowerCase();
  const extension = file.name.toLowerCase().split('.').pop();
  return mimeType === 'application/pdf' || extension === 'pdf';
}

/**
 * Formats file size in human-readable format
 * @param bytes - Size in bytes
 * @returns Formatted string like "1.2 MB", "340 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Extracts text from PDF file - placeholder implementation
 * Returns mock data for now. Replace with pdfjs-dist in production.
 * @param file - PDF File object
 * @returns Promise resolving to array of strings (one per page)
 */
export async function extractPdfText(file: File): Promise<string[]> {
  if (!isPdfFile(file)) {
    throw new Error('File is not a PDF');
  }

  // Read file as ArrayBuffer for potential future use
  const buffer = await file.arrayBuffer();
  
  // Placeholder implementation - replace with pdfjs-dist or server-side extraction
  // Example of how to use with pdfjs-dist:
  // import * as pdfjsLib from 'pdfjs-dist';
  // const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  // const pages: string[] = [];
  // for (let i = 1; i <= pdf.numPages; i++) {
  //   const page = await pdf.getPage(i);
  //   const textContent = await page.getTextContent();
  //   pages.push(textContent.items.map((item: any) => item.str).join(' '));
  // }
  // return pages;

  return [
    `[PDF text extraction placeholder - page 1] File: ${file.name}, Size: ${formatFileSize(file.size)}`,
    `[PDF text extraction placeholder - page 2] Replace with pdfjs-dist or server-side extraction in production`,
  ];
}

/**
 * Extracts text from ArrayBuffer - placeholder implementation
 * @param buffer - PDF file as ArrayBuffer
 * @returns Promise resolving to array of strings (one per page)
 */
export async function extractPdfTextFromArrayBuffer(buffer: ArrayBuffer): Promise<string[]> {
  // Placeholder implementation - replace with pdfjs-dist or server-side extraction in production
  return [
    `[PDF text extraction placeholder - page 1] Buffer size: ${formatFileSize(buffer.byteLength)}`,
    `[PDF text extraction placeholder - page 2] Replace with pdfjs-dist or server-side extraction in production`,
  ];
}