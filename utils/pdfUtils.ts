import { PDFDocument } from 'pdf-lib';

/**
 * Extract specific pages from a PDF and return as a new PDF blob
 * @param pdfBytes - Original PDF as ArrayBuffer
 * @param startPage - First page to extract (1-indexed)
 * @param endPage - Last page to extract (1-indexed)
 * @returns ArrayBuffer containing the extracted pages as a new PDF
 */
export async function extractPdfPages(
  pdfBytes: ArrayBuffer,
  startPage: number,
  endPage: number
): Promise<ArrayBuffer> {
  // Load the original PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Create a new PDF document
  const newPdfDoc = await PDFDocument.create();

  // Copy the specified pages (converting from 1-indexed to 0-indexed)
  const pageIndices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage - 1 + i
  );

  const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
  copiedPages.forEach(page => newPdfDoc.addPage(page));

  // Save the new PDF and return as ArrayBuffer
  const newPdfBytes = await newPdfDoc.save();
  return newPdfBytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 * @param buffer - ArrayBuffer to convert
 * @returns base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
