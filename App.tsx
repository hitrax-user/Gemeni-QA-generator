



import React, { useState, useCallback, useMemo } from 'react';
import { Chunk, PDFDocumentProxy, QAPair } from './types';
import { generateQuestionsAndAnswers } from './services/geminiService';
import { extractPdfPages, arrayBufferToBase64 } from './utils/pdfUtils';
import PdfViewer from './components/PdfViewer';
import ChunkManager from './components/ChunkManager';
import QaGenerator from './components/QaGenerator';
import { UploadIcon, FileIcon } from './components/icons';

// Declare pdfjsLib as it's loaded from a CDN
declare const pdfjsLib: any;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [nextChunkId, setNextChunkId] = useState(1);
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);

  const [isAutoSplitting, setIsAutoSplitting] = useState(false);
  const [hasOutline, setHasOutline] = useState<boolean | null>(null);
  const [isTextBased, setIsTextBased] = useState<boolean | null>(null);

  const [qaCache, setQaCache] = useState<Record<number, QAPair[]>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });


  const resetStateForNewFile = () => {
      setFile(null);
      setPdfDoc(null);
      setPdfArrayBuffer(null);
      setAppError(null);
      setChunks([]);
      setSelectedChunk(null);
      setNextChunkId(1);
      setHasOutline(null);
      setIsTextBased(null);
      setQaCache({});
      setIsGeneratingAll(false);
      setGenerationProgress({ current: 0, total: 0 });
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      resetStateForNewFile();
      setFile(selectedFile);
      setIsParsing(true);
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          try {
            const arrayBuffer = event.target.result as ArrayBuffer;
            setPdfArrayBuffer(arrayBuffer);

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            setPdfDoc(pdf);

            // Check for outline for auto-splitting
            const outline = await pdf.getOutline();
            setHasOutline(!!outline && outline.length > 0);

            // Check if PDF is text-based or image-based
            let textFound = false;
            if (pdf.numPages > 0) {
                try {
                    const page = await pdf.getPage(1);
                    const textContent = await page.getTextContent();
                    textFound = textContent.items.some((item: any) => item.str.trim().length > 0);
                } catch(textCheckError) {
                    console.warn("Could not perform text check on PDF.", textCheckError);
                    textFound = false; // Assume not text-based if check fails
                }
            }
            setIsTextBased(textFound);

          } catch (err: any) {
            setAppError(`Error parsing PDF: ${err.message}`);
            resetStateForNewFile();
          } finally {
            setIsParsing(false);
          }
        }
      };
      reader.onerror = () => {
        setAppError('Failed to read file.');
        setIsParsing(false);
      }
      reader.readAsArrayBuffer(selectedFile);
    } else {
      setAppError('Please select a valid PDF file.');
      setFile(null);
      setPdfDoc(null);
    }
    e.target.value = ''; // Reset input to allow re-uploading the same file
  }, []);
  
  const autoSplitPdf = useCallback(async () => {
    if (!pdfDoc || !hasOutline) return;
    setIsAutoSplitting(true);
    setAppError(null);

    try {
        const outline = await pdfDoc.getOutline();
        if (!outline) {
            throw new Error("No outline found in the document.");
        }

        const bookmarks: { title: string; page: number }[] = [];
        async function processOutline(items: any[]) {
            for (const item of items) {
                try {
                    let dest = item.dest;
                    if (typeof dest === 'string') dest = await pdfDoc.getDestination(dest);
                    if (Array.isArray(dest) && dest[0]) {
                        const pageIndex = await pdfDoc.getPageIndex(dest[0]);
                        bookmarks.push({ title: item.title, page: pageIndex + 1 });
                    }
                } catch (e) {
                    console.warn(`Could not resolve destination for bookmark "${item.title}"`, e);
                }
                if (item.items && item.items.length > 0) await processOutline(item.items);
            }
        }
        await processOutline(outline);

        if (bookmarks.length === 0) {
            throw new Error("Failed to extract structure from outline. Please use manual splitting.");
        }

        const uniqueBookmarks = bookmarks
            .sort((a, b) => a.page - b.page)
            .filter((bookmark, index, self) => index === self.findIndex(b => b.page === bookmark.page));

        const initialChunks: { startPage: number; endPage: number; contextTitle: string }[] = [];
        uniqueBookmarks.forEach((bookmark, i) => {
            const startPage = bookmark.page;
            const endPage = (i + 1 < uniqueBookmarks.length) 
                ? uniqueBookmarks[i + 1].page - 1 
                : pdfDoc.numPages;
            if (startPage <= endPage) {
                initialChunks.push({ startPage, endPage, contextTitle: bookmark.title });
            }
        });

        const finalChunks: Omit<Chunk, 'id' | 'text'>[] = [];
        const MAX_CHUNK_PAGES = 4;
        initialChunks.forEach(chunk => {
            let currentStart = chunk.startPage;
            while (currentStart <= chunk.endPage) {
                const currentEnd = Math.min(currentStart + MAX_CHUNK_PAGES - 1, chunk.endPage);
                finalChunks.push({ startPage: currentStart, endPage: currentEnd, contextTitle: chunk.contextTitle });
                currentStart = currentEnd + 1;
            }
        });

        const newChunksWithId = finalChunks.map((chunk, index) => ({ ...chunk, id: index + 1 }));
        setChunks(newChunksWithId);
        setNextChunkId(newChunksWithId.length + 1);
        setSelectedChunk(newChunksWithId.length > 0 ? newChunksWithId[0] : null);
        setQaCache({});

    } catch (e: any) {
        setAppError(`Auto-split error: ${e.message}`);
        setChunks([]);
        setNextChunkId(1);
        setSelectedChunk(null);
    } finally {
        setIsAutoSplitting(false);
    }
}, [pdfDoc, hasOutline]);

  const addChunk = useCallback((start: number, end: number) => {
    // Manually added chunks don't have a context title
    const newChunk: Chunk = { id: nextChunkId, startPage: start, endPage: end, contextTitle: undefined };
    setChunks(prev => [...prev, newChunk].sort((a,b) => a.startPage - b.startPage));
    setNextChunkId(prev => prev + 1);
    setSelectedChunk(newChunk);
  }, [nextChunkId]);

  const deleteChunk = useCallback((id: number) => {
    setChunks(prev => prev.filter(chunk => chunk.id !== id));
    setQaCache(prev => {
        const newCache = { ...prev };
        delete newCache[id];
        return newCache;
    });
    if (selectedChunk?.id === id) {
      setSelectedChunk(null);
    }
  }, [selectedChunk]);
  
  const extractTextForChunk = useCallback(async (chunk: Chunk): Promise<string> => {
    if (!pdfDoc) return '';
    let fullText = '';
    for (let i = chunk.startPage; i <= chunk.endPage; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        } catch (error) {
            console.error(`Failed to extract text from page ${i}:`, error);
            fullText += `[Error extracting text from page ${i}]\n\n`;
        }
    }
    return fullText;
  }, [pdfDoc]);

  const extractPdfForChunk = useCallback(async (chunk: Chunk): Promise<string | null> => {
    if (!pdfArrayBuffer) return null;

    try {
        // Extract the specific pages for this chunk
        const chunkPdfBuffer = await extractPdfPages(
            pdfArrayBuffer,
            chunk.startPage,
            chunk.endPage
        );

        // Convert to base64
        const base64Pdf = arrayBufferToBase64(chunkPdfBuffer);
        return base64Pdf;
    } catch (error) {
        console.error(`Failed to extract PDF for chunk (pages ${chunk.startPage}-${chunk.endPage}):`, error);
        return null;
    }
  }, [pdfArrayBuffer]);


  const generateQaForChunk = useCallback(async (chunk: Chunk) => {
    const text = await extractTextForChunk(chunk);
    const pdfBase64 = await extractPdfForChunk(chunk);

    if (!text.trim() && !pdfBase64) {
        throw new Error("Could not extract any content from this chunk.");
    }

    // The service now returns simple { question, answer } pairs without context.
    const basePairs = await generateQuestionsAndAnswers(text, pdfBase64 || undefined);

    // We construct the final QAPair with context programmatically for consistency.
    const finalPairs: QAPair[] = basePairs.map(pair => {
      if (!pair.question || !pair.answer) {
        return null;
      }

      let questionText = pair.question.trim();
      // Ensure the question ends with a question mark.
      if (!questionText.endsWith('?')) {
        questionText += '?';
      }

      const contextPrefix = chunk.contextTitle
        ? `In the section "${chunk.contextTitle}" of the document "${file?.name || 'this document'}", `
        : `In the document "${file?.name || 'this document'}", `;

      // Make the final question flow naturally by lowercasing the first letter of the generated question.
      const finalQuestion = contextPrefix + questionText.charAt(0).toLowerCase() + questionText.slice(1);

      return {
        input_text: finalQuestion,
        output_text: pair.answer.trim(),
      };
    }).filter((p): p is QAPair => p !== null);

    setQaCache(prev => ({ ...prev, [chunk.id]: finalPairs }));
  }, [extractTextForChunk, extractPdfForChunk, file]);

  const handleGenerateAllQa = useCallback(async () => {
    if (chunks.length === 0) return;
    setIsGeneratingAll(true);
    setAppError(null);
    setGenerationProgress({ current: 0, total: chunks.length });

    let completed = 0;
    for (const chunk of chunks) {
      try {
        await generateQaForChunk(chunk);
        completed++;
        setGenerationProgress({ current: completed, total: chunks.length });

        // Pause between requests to stay within API rate limits, but not after the last one.
        if (completed < chunks.length) {
          await sleep(5000); // Wait 5 seconds to avoid hitting rate limits (e.g., 15 requests/min)
        }
      } catch (error: any) {
        console.error(`Failed to generate Q&A for chunk ${chunk.id}:`, error);
        setAppError(`Error on chunk #${chunk.id}: ${error.message}. Halting process.`);
        setIsGeneratingAll(false);
        return; // Stop the entire process on the first failure
      }
    }
    setIsGeneratingAll(false);
  }, [chunks, generateQaForChunk]);

  const handleSaveAllQa = useCallback(() => {
    const allPairs = Object.values(qaCache).flat();
    if (allPairs.length === 0) {
        setAppError("No Q&A pairs have been generated to save.");
        return;
    }

    const jsonLines = allPairs.map(pair => {
        const lineObject = {
            messages: [
                { role: 'user', content: pair.input_text },
                { role: 'model', content: pair.output_text }
            ]
        };
        return JSON.stringify(lineObject);
    }).join('\n');

    const blob = new Blob([jsonLines], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qa_dataset.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [qaCache]);


  const viewerPages = useMemo(() => {
    if (selectedChunk) {
        return { start: selectedChunk.startPage, end: selectedChunk.endPage };
    }
    if (pdfDoc) {
        return { start: 1, end: Math.min(4, pdfDoc.numPages) }; // Show first pages by default
    }
    return { start: 0, end: 0 };
  }, [pdfDoc, selectedChunk]);


  const FileUploader: React.FC = () => (
    <div className="h-screen w-screen flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold text-slate-100 mb-2">PDF Chunker & Q&A Generator</h1>
        <p className="text-lg text-slate-400 mb-8">Upload a PDF to split it into logical chunks and create Q&A datasets.</p>
        <label
          htmlFor="pdf-upload"
          className="relative group cursor-pointer"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-slate-800 border border-slate-700 rounded-lg px-8 py-6 flex flex-col items-center justify-center space-y-4">
             {isParsing ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-300"></div>
                  <span className="text-slate-300 font-semibold">Processing PDF...</span>
                </>
             ) : (
                <>
                  <UploadIcon className="w-12 h-12 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-slate-300 font-semibold">Click to upload a file</span>
                  <span className="text-slate-500 text-sm">(or drag and drop)</span>
                </>
             )}
          </div>
        </label>
        <input id="pdf-upload" type="file" className="hidden" onChange={handleFileChange} accept=".pdf" disabled={isParsing} />
        {appError && <p className="mt-4 text-red-400 bg-red-900/50 py-2 px-4 rounded-md">{appError}</p>}
      </div>
    </div>
  );

  if (!file || !pdfDoc) {
    return <FileUploader />;
  }

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col p-4 gap-4">
        <header className="flex-shrink-0 flex items-center justify-between bg-slate-800/50 p-3 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
                <FileIcon className="w-8 h-8 text-indigo-400 flex-shrink-0" />
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-slate-100 truncate">PDF Q&A Tool</h1>
                    <p className="text-sm text-slate-400 truncate" title={file.name}>{file.name}</p>
                </div>
            </div>
            <label
                htmlFor="pdf-reupload"
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-md transition-colors cursor-pointer text-sm flex-shrink-0"
            >
                Upload Another
            </label>
            <input id="pdf-reupload" type="file" className="hidden" onChange={handleFileChange} accept=".pdf"/>
        </header>
        <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
            <aside className="lg:col-span-3 h-full overflow-hidden">
                <ChunkManager 
                    chunks={chunks}
                    addChunk={addChunk}
                    deleteChunk={deleteChunk}
                    selectChunk={setSelectedChunk}
                    selectedChunkId={selectedChunk?.id || null}
                    numPages={pdfDoc.numPages}
                    fileName={file.name}
                    autoSplit={autoSplitPdf}
                    isAutoSplitting={isAutoSplitting}
                    hasOutline={hasOutline}
                    isTextBased={isTextBased}
                />
            </aside>
            <section className="lg:col-span-5 h-full bg-slate-900/50 rounded-lg overflow-hidden">
                <PdfViewer 
                    pdfDoc={pdfDoc}
                    startPage={viewerPages.start}
                    endPage={viewerPages.end}
                />
            </section>
            <aside className="lg:col-span-4 h-full overflow-hidden">
                <QaGenerator
                    selectedChunk={selectedChunk}
                    chunks={chunks}
                    qaCache={qaCache}
                    generateQaForChunk={generateQaForChunk}
                    generateAllQa={handleGenerateAllQa}
                    saveAllQa={handleSaveAllQa}
                    isGeneratingAll={isGeneratingAll}
                    generationProgress={generationProgress}
                    isTextBased={isTextBased}
                />
            </aside>
        </main>
        {appError && 
          <div className="fixed bottom-4 right-4 bg-red-800 text-white p-4 rounded-lg shadow-lg max-w-sm z-50 animate-fade-in">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold mb-1">An Error Occurred</h4>
                <p className="text-sm">{appError}</p>
              </div>
              <button onClick={() => setAppError(null)} className="ml-4 p-1 text-red-200 hover:text-white">&times;</button>
            </div>
          </div>
        }
    </div>
  );
};

export default App;