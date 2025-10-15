import React, { useState, useCallback } from 'react';
import { Chunk, QAPair } from '../types';
import { SparklesIcon, LoaderIcon, SaveIcon } from './icons';

interface QaGeneratorProps {
  selectedChunk: Chunk | null;
  chunks: Chunk[];
  qaCache: Record<number, QAPair[]>;
  generateQaForChunk: (chunk: Chunk) => Promise<void>;
  generateAllQa: () => void;
  saveAllQa: () => void;
  isGeneratingAll: boolean;
  generationProgress: { current: number; total: number };
  analyzeImages: boolean;
  setAnalyzeImages: (enabled: boolean) => void;
  isTextBased: boolean | null;
}

const QaGenerator: React.FC<QaGeneratorProps> = ({ 
    selectedChunk, 
    chunks,
    qaCache,
    generateQaForChunk,
    generateAllQa,
    saveAllQa,
    isGeneratingAll,
    generationProgress,
    analyzeImages,
    setAnalyzeImages,
    isTextBased
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateQA = useCallback(async () => {
    if (!selectedChunk) return;

    setIsLoading(true);
    setError(null);
    try {
      await generateQaForChunk(selectedChunk);
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedChunk, generateQaForChunk]);

  const qaForSelectedChunk = selectedChunk ? qaCache[selectedChunk.id] : undefined;
  const canSave = Object.keys(qaCache).length > 0;

  if (!selectedChunk) {
    return (
      <div className="bg-slate-800/50 p-6 rounded-lg flex items-center justify-center h-full">
        <div className="text-center text-slate-500">
          <p className="font-semibold">Select a chunk from the left</p>
          <p className="text-sm">to view it and generate Q&A.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 p-6 rounded-lg flex flex-col h-full">
      <div className="flex-shrink-0">
        <h2 className="text-xl font-bold mb-2 text-indigo-300">Q&A Generator</h2>
        <p className="text-sm text-slate-400 mb-4">
          Selected Chunk <span className="font-bold">#{selectedChunk.id}</span> (Pages: {selectedChunk.startPage} - {selectedChunk.endPage})
        </p>

        <div className="bg-slate-900/70 p-3 rounded-md mb-4">
            <label htmlFor="analyze-images-toggle" className="flex items-center justify-between cursor-pointer" title="Enable to analyze diagrams, schematics, and other images in the PDF.">
                <span className="font-medium text-slate-300">Analyze Images & Schematics</span>
                <div className="relative">
                    <input 
                        id="analyze-images-toggle" 
                        type="checkbox" 
                        className="sr-only" 
                        checked={analyzeImages} 
                        onChange={e => setAnalyzeImages(e.target.checked)}
                        disabled={isGeneratingAll}
                    />
                    <div className="block bg-slate-700 w-12 h-7 rounded-full"></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${analyzeImages ? 'transform translate-x-5 bg-indigo-400' : ''}`}></div>
                </div>
            </label>
             {isTextBased === false && !analyzeImages && (
                <p className="text-center text-amber-400 text-xs mt-2">
                    This is an image-only document. Enable analysis to generate Q&A.
                </p>
            )}
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            <button
                onClick={handleGenerateQA}
                disabled={isLoading || isGeneratingAll}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
            >
                {isLoading ? <LoaderIcon className="w-5 h-5"/> : <SparklesIcon className="w-5 h-5" />}
                {isLoading ? 'Generating...' : 'Generate Q&A'}
            </button>
            <button
                onClick={generateAllQa}
                disabled={isLoading || isGeneratingAll || chunks.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
            >
                <SparklesIcon className="w-5 h-5" />
                Generate for All
            </button>
        </div>

        {isGeneratingAll && (
            <div className="mb-4">
                <p className="text-sm text-center text-purple-300 mb-1">Generating for all chunks... ({generationProgress.current}/{generationProgress.total})</p>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}></div>
                </div>
            </div>
        )}

        <button
            onClick={saveAllQa}
            disabled={!canSave || isGeneratingAll}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed mb-4"
        >
            <SaveIcon className="w-5 h-5"/>
            Save All Q&A (JSON)
        </button>
      </div>

      <div className="mt-4 flex-grow overflow-y-auto pr-2 -mr-2 border-t border-slate-700/50 pt-4">
        {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}
        
        {isLoading && !qaForSelectedChunk && <div className="text-center p-4"><LoaderIcon className="mx-auto" /></div> }

        {qaForSelectedChunk && qaForSelectedChunk.length > 0 ? (
          <div className="space-y-4">
            {qaForSelectedChunk.map((pair, index) => (
              <div key={index} className="bg-slate-900/70 p-4 rounded-md animate-fade-in">
                <p className="font-semibold text-slate-300 mb-1">Question:</p>
                <p className="text-slate-400 mb-3">{pair.input_text}</p>
                <p className="font-semibold text-slate-300 mb-1">Answer:</p>
                <p className="text-slate-400">{pair.output_text}</p>
              </div>
            ))}
          </div>
        ) : (
            !isLoading && <p className="text-center text-slate-500 pt-4">No Q&A generated for this chunk yet.</p>
        )}
      </div>
    </div>
  );
};

export default QaGenerator;