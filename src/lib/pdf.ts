import { toast } from "sonner";

let fontCssPromise: Promise<string> | null = null;

/**
 * html-to-image inlines @font-face rules by walking document.styleSheets, which
 * throws SecurityError on the cross-origin Google Fonts sheet. Without the
 * inlined faces the rasterised letter falls back to system fonts and stops
 * matching what is on screen. Fetching the same CSS over HTTP is allowed, so
 * hand it the text directly.
 */
async function remoteFontCss(): Promise<string | undefined> {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      const hrefs = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      )
        .map((link) => link.href)
        .filter((href) => href.startsWith("https://fonts.googleapis.com/"));

      const sheets = await Promise.all(
        hrefs.map(async (href) => {
          try {
            const response = await fetch(href);
            return response.ok ? await response.text() : "";
          } catch {
            return "";
          }
        }),
      );

      return sheets.join("\n");
    })().catch(() => "");
  }
  // Empty would still satisfy html-to-image's `!= null` check and embed no
  // fonts at all. Undefined lets it fall back to its own stylesheet walk.
  const css = await fontCssPromise;
  return css.trim() === "" ? undefined : css;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not decode the rendered letter"));
    img.src = src;
  });
}

export async function downloadLetterPdf(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("PDF download: element not found:", elementId);
    toast.error("Could not find the letter to export.");
    return;
  }

  try {
    const { toPng } = await import("html-to-image");
    const jsPDF = (await import("jspdf")).default;

    const fontCss = await remoteFontCss();
    const imgData = await toPng(element, {
      pixelRatio: 2,
      cacheBust: true,
      ...(fontCss ? { fontEmbedCSS: fontCss } : {}),
    });

    const img = await loadImage(imgData);

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (img.height * imgWidth) / img.width;

    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);

    while (position + pageHeight < imgHeight) {
      position += pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, -position, imgWidth, imgHeight);
    }

    pdf.save(filename);
  } catch (error) {
    console.error("PDF download failed:", error);
    toast.error("Could not generate the PDF. Use Print to save as PDF instead.");
  }
}
