
import React, { useRef, useEffect } from 'react';
import { PDFDocumentProxy } from '../types';

interface PdfViewerProps {
  pdfDoc: PDFDocumentProxy;
  startPage: number;
  endPage: number;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdfDoc, startPage, endPage }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderPages = async () => {
      if (!pdfDoc || !containerRef.current) return;
      
      // Clear previous pages
      containerRef.current.innerHTML = '';

      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          
          const canvas = document.createElement('canvas');
          canvas.className = 'mx-auto mb-4 shadow-lg rounded-md';
          const context = canvas.getContext('2d');
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
             const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
          containerRef.current?.appendChild(canvas);
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
            const errorDiv = document.createElement('div');
            errorDiv.className = "text-center text-red-400 bg-red-900/50 p-4 rounded-md";
            errorDiv.textContent = `Failed to render page ${pageNum}.`;
            containerRef.current?.appendChild(errorDiv);
        }
      }
    };

    renderPages();
  }, [pdfDoc, startPage, endPage]);

  return <div ref={containerRef} className="p-4 overflow-y-auto h-full"></div>;
};

export default PdfViewer;