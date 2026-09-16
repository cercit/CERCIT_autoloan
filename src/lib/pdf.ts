export async function downloadLetterPdf(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("PDF download: element not found:", elementId);
    return;
  }

  const { toPng } = await import("html-to-image");
  const jsPDF = (await import("jspdf")).default;

  const imgData = await toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const img = new Image();
  img.src = imgData;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
  });

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
}
